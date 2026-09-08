const policyService = require("./slaPolicy.service");

function validateStartAt(startAt) {
  if (!(startAt instanceof Date) || !Number.isFinite(startAt.getTime())) {
    throw new TypeError("startAt must be a valid Date");
  }
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
  calculateResponseDeadline,
  calculateResponseDeadlineForPriority,
  calculateResolutionDeadline,
  calculateResolutionDeadlineForPriority,
};
