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

function calculateResolutionSla({ createdAt = null, resolutionDueAt = null, resolvedAt = null } = {}) {
  for (const [name, value] of Object.entries({ createdAt, resolutionDueAt, resolvedAt })) {
    if (value !== null) validateDate(value, name);
  }
  if (createdAt !== null) {
    if (resolutionDueAt !== null && resolutionDueAt.getTime() < createdAt.getTime()) {
      throw new RangeError("resolutionDueAt cannot precede createdAt");
    }
    if (resolvedAt !== null && resolvedAt.getTime() < createdAt.getTime()) {
      throw new RangeError("resolvedAt cannot precede createdAt");
    }
  }

  let result = SLA_RESULTS.NOT_TRACKED;
  let differenceMinutes = null;
  if (resolutionDueAt !== null) {
    result = SLA_RESULTS.PENDING;
    if (resolvedAt !== null) {
      differenceMinutes = (resolutionDueAt.getTime() - resolvedAt.getTime()) / 60000;
      result = resolvedAt.getTime() <= resolutionDueAt.getTime() ? SLA_RESULTS.MET : SLA_RESULTS.MISSED;
    }
  }
  // Match first-response precision; unresolved tickets never consult the clock.
  const resolutionTimeMinutes = createdAt !== null && resolvedAt !== null
    ? (resolvedAt.getTime() - createdAt.getTime()) / 60000
    : null;
  return { result, resolutionDueAt, resolvedAt, resolutionTimeMinutes, differenceMinutes };
}

function calculateOverallSlaStatus({ responseResult, resolutionResult } = {}) {
  const validResults = Object.values(SLA_RESULTS);
  if (!validResults.includes(responseResult) || !validResults.includes(resolutionResult)) {
    throw new TypeError("Response and resolution results must be valid SLA results");
  }
  const responseUntracked = responseResult === SLA_RESULTS.NOT_TRACKED;
  const resolutionUntracked = resolutionResult === SLA_RESULTS.NOT_TRACKED;
  // Inconsistent tracking is invalid even when the tracked target was missed.
  if (responseUntracked !== resolutionUntracked) {
    throw new RangeError("Inconsistent SLA tracking data");
  }
  if (responseUntracked) return SLA_RESULTS.NOT_TRACKED;
  if (responseResult === SLA_RESULTS.MISSED || resolutionResult === SLA_RESULTS.MISSED) {
    return SLA_RESULTS.MISSED;
  }
  if (responseResult === SLA_RESULTS.MET && resolutionResult === SLA_RESULTS.MET) {
    return SLA_RESULTS.MET;
  }
  return SLA_RESULTS.PENDING;
}

function calculateTicketSlaStatus({ createdAt, responseDueAt, firstResponseAt, resolutionDueAt, resolvedAt } = {}) {
  const response = calculateFirstResponseSla({ createdAt, responseDueAt, firstResponseAt });
  const resolution = calculateResolutionSla({ createdAt, resolutionDueAt, resolvedAt });
  const status = calculateOverallSlaStatus({
    responseResult: response.result, resolutionResult: resolution.result,
  });
  return { status, response, resolution };
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
  calculateOverallSlaStatus,
  calculateTicketSlaStatus,
  calculateResolutionSla,
  calculateFirstResponseSla,
  calculateResponseDeadline,
  calculateResponseDeadlineForPriority,
  calculateResolutionDeadline,
  calculateResolutionDeadlineForPriority,
};
