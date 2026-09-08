const policyService = require("./slaPolicy.service");

function validateStartAt(startAt) {
  if (!(startAt instanceof Date) || !Number.isFinite(startAt.getTime())) {
    throw new TypeError("startAt must be a valid Date");
  }
}

function calculateResponseDeadline({ startAt, responseTimeMinutes } = {}) {
  validateStartAt(startAt);
  if (!Number.isSafeInteger(responseTimeMinutes) || responseTimeMinutes <= 0) {
    throw new TypeError("responseTimeMinutes must be a positive safe integer");
  }
  // Absolute elapsed time: no timezone adjustment or business-calendar rules.
  const durationMs = responseTimeMinutes * 60 * 1000;
  const deadlineMs = startAt.getTime() + durationMs;
  const deadline = new Date(deadlineMs);
  if (!Number.isSafeInteger(durationMs) || !Number.isSafeInteger(deadlineMs) ||
      !Number.isFinite(deadline.getTime())) {
    throw new RangeError("Response deadline exceeds the supported Date range");
  }
  return deadline;
}

async function calculateResponseDeadlineForPriority({ startAt, priorityId, db } = {}) {
  validateStartAt(startAt);
  // Snapshot the instant before awaiting a policy read.
  const start = new Date(startAt.getTime());
  const policy = await policyService.resolvePolicyForPriority(priorityId, db);
  const responseDueAt = calculateResponseDeadline({ startAt: start, responseTimeMinutes: policy.responseTimeMinutes });
  return { policy, responseDueAt };
}

module.exports = { calculateResponseDeadline, calculateResponseDeadlineForPriority };
