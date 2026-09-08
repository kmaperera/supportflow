const repository = require("./slaPolicy.repository");
const ticketRepository = require("../tickets/ticket.repository");
const ApiError = require("../../utils/ApiError");

function validateId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value)) ||
      !/^[1-9]\d*$/.test(String(value)) || String(value).length > 20 ||
      BigInt(value) > 18446744073709551615n) {
    throw new ApiError(422, "ID must be a positive integer");
  }
}

function mapSlaPolicy(row) {
  if (!row) return null;
  return {
    id: row.id, priorityId: row.priority_id, priorityName: row.priority_name,
    responseTimeMinutes: row.response_time_minutes,
    resolutionTimeMinutes: row.resolution_time_minutes,
    isActive: Boolean(row.is_active), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function requirePolicy(row) {
  if (!row) throw new ApiError(404, "SLA policy not found");
  return mapSlaPolicy(row);
}

async function getAllPolicies(db) {
  return (await repository.findAll(db)).map(mapSlaPolicy);
}

async function getPolicyById(id, db) {
  validateId(id);
  return requirePolicy(await repository.findById(id, db));
}

async function getPolicyByPriorityId(priorityId, db) {
  validateId(priorityId);
  return requirePolicy(await repository.findByPriorityId(priorityId, db));
}

async function getPolicyByPriorityName(priorityName, db) {
  if (typeof priorityName !== "string" || !priorityName.trim()) {
    throw new ApiError(422, "Priority name must be a non-empty string");
  }
  return requirePolicy(await repository.findByPriorityName(priorityName.trim().toUpperCase(), db));
}

async function getActivePolicyByPriorityId(priorityId, db) {
  const policy = await getPolicyByPriorityId(priorityId, db);
  if (!policy.isActive) throw new ApiError(409, "Active SLA policy not available for this priority");
  return policy;
}

async function resolvePolicyForPriority(priorityId, db) {
  validateId(priorityId);
  const priority = await ticketRepository.findPriorityById(priorityId, db);
  if (!priority) throw new ApiError(404, "Ticket priority not found");
  const row = await repository.findByPriorityId(priorityId, db);
  if (!row) throw new ApiError(409, "SLA policy is not configured for this priority");
  const policy = mapSlaPolicy(row);
  if (![true, 1, "1"].includes(row.is_active)) {
    throw new ApiError(409, "Active SLA policy is not available for this priority");
  }
  const durations = [policy.responseTimeMinutes, policy.resolutionTimeMinutes];
  if (durations.some(value => !Number.isInteger(value) || value < 1 || value > 4294967295) ||
      policy.resolutionTimeMinutes < policy.responseTimeMinutes) {
    throw new ApiError(500, "Invalid SLA policy configuration");
  }
  return policy;
}

async function updatePolicy(id, values, db) {
  validateId(id);
  if (!values || typeof values !== "object" || Array.isArray(values) ||
      Object.keys(values).some(key => !["responseTimeMinutes", "resolutionTimeMinutes"].includes(key))) {
    throw new ApiError(422, "Only responseTimeMinutes and resolutionTimeMinutes may be updated");
  }
  const { responseTimeMinutes, resolutionTimeMinutes } = values;
  for (const value of [responseTimeMinutes, resolutionTimeMinutes]) {
    if (!Number.isInteger(value) || value < 1 || value > 4294967295) {
      throw new ApiError(422, "SLA durations must be positive integers within the unsigned INT range");
    }
  }
  if (resolutionTimeMinutes < responseTimeMinutes) {
    throw new ApiError(422, "Resolution time must be greater than or equal to response time");
  }
  await getPolicyById(id, db);
  await repository.updateById(id, { responseTimeMinutes, resolutionTimeMinutes }, db);
  return getPolicyById(id, db);
}

async function setPolicyActiveStatus(id, isActive, db) {
  validateId(id);
  if (typeof isActive !== "boolean") throw new ApiError(422, "isActive must be a boolean");
  await getPolicyById(id, db);
  await repository.setActiveStatus(id, isActive, db);
  return getPolicyById(id, db);
}

module.exports = { mapSlaPolicy, getAllPolicies, getPolicyById, getPolicyByPriorityId,
  getPolicyByPriorityName, getActivePolicyByPriorityId, resolvePolicyForPriority, updatePolicy, setPolicyActiveStatus };
