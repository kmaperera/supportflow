const policyService = require("./slaPolicy.service");
const { SLA_RESULTS } = require("../../constants/slaResults");

function validateDate(value, name) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date`);
  }
}

function validateStartAt(startAt) {
  validateDate(startAt, "startAt");
}

function calculateFirstResponseSla({ createdAt = null, responseDueAt = null, firstResponseAt = null } = {}) {
  for (const [name, value] of Object.entries({ createdAt, responseDueAt, firstResponseAt })) {
    if (value !== null) validateDate(value, name);
  }
  if (createdAt !== null) {
    if (responseDueAt !== null && responseDueAt.getTime() < createdAt.getTime()) {
      throw new RangeError("responseDueAt cannot precede createdAt");
    }
    if (firstResponseAt !== null && firstResponseAt.getTime() < createdAt.getTime()) {
      throw new RangeError("firstResponseAt cannot precede createdAt");
    }
  }

  let result = SLA_RESULTS.NOT_TRACKED;
  let differenceMinutes = null;
  if (responseDueAt !== null) {
    result = SLA_RESULTS.PENDING;
    if (firstResponseAt !== null) {
      differenceMinutes = (responseDueAt.getTime() - firstResponseAt.getTime()) / 60000;
      result = firstResponseAt.getTime() <= responseDueAt.getTime() ? SLA_RESULTS.MET : SLA_RESULTS.MISSED;
    }
  }
  // Preserve fractional elapsed minutes; pending results never consult the clock.
  const responseTimeMinutes = createdAt !== null && firstResponseAt !== null
    ? (firstResponseAt.getTime() - createdAt.getTime()) / 60000
    : null;
  return { result, responseDueAt, firstResponseAt, responseTimeMinutes, differenceMinutes };
}

function calculateDeadline(startAt, durationMinutes, durationName, deadlineName) {
  validateStartAt(startAt);
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
    throw new TypeError(`${durationName} must be a positive safe integer`);
  }
  // Absolute elapsed time: no timezone adjustment or business-calendar rules.
  const durationMs = durationMinutes * 60 * 1000;
  const deadlineMs = startAt.getTime() + durationMs;
  const deadline = new Date(deadlineMs);
  if (!Number.isSafeInteger(durationMs) || !Number.isSafeInteger(deadlineMs) ||
      !Number.isFinite(deadline.getTime())) {
    throw new RangeError(`${deadlineName} deadline exceeds the supported Date range`);
  }
  return deadline;
}

function calculateResponseDeadline({ startAt, responseTimeMinutes } = {}) {
  return calculateDeadline(startAt, responseTimeMinutes, "responseTimeMinutes", "Response");
}

function calculateResolutionDeadline({ startAt, resolutionTimeMinutes } = {}) {
  return calculateDeadline(startAt, resolutionTimeMinutes, "resolutionTimeMinutes", "Resolution");
}

async function calculateResponseDeadlineForPriority({ startAt, priorityId, db } = {}) {
  validateStartAt(startAt);
  // Snapshot the instant before awaiting a policy read.
  const start = new Date(startAt.getTime());
  const policy = await policyService.resolvePolicyForPriority(priorityId, db);
  const responseDueAt = calculateResponseDeadline({ startAt: start, responseTimeMinutes: policy.responseTimeMinutes });
  return { policy, responseDueAt };
}

async function calculateResolutionDeadlineForPriority({ startAt, priorityId, db } = {}) {
  validateStartAt(startAt);
  // Snapshot the instant before awaiting a policy read.
  const start = new Date(startAt.getTime());
  const policy = await policyService.resolvePolicyForPriority(priorityId, db);
  const resolutionDueAt = calculateResolutionDeadline({ startAt: start, resolutionTimeMinutes: policy.resolutionTimeMinutes });
  return { policy, resolutionDueAt };
}

module.exports = {
  calculateFirstResponseSla,
  calculateResponseDeadline,
  calculateResponseDeadlineForPriority,
  calculateResolutionDeadline,
  calculateResolutionDeadlineForPriority,
};
