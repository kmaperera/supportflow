const pool = require("../../config/database");
const calculations = require("./slaCalculation.service");
const notifications = require("../notifications/notification.service");
const realtime = require("../notifications/notificationRealtime.service");
const { NOTIFICATION_TYPES } = require("../../constants/notificationTypes");
const { TICKET_STATUSES } = require("../../constants/ticketStatuses");

// Supplied tickets must be trusted mapped backend state, never request bodies.
async function createWarning(ticket, now, db, target) {
  if (!ticket || typeof ticket !== "object") throw new TypeError("Ticket is required");
  if ([TICKET_STATUSES.RESOLVED, TICKET_STATUSES.CLOSED].includes(ticket.status)) return null;
  const warning = target === "response"
    ? calculations.calculateResponseSlaWarning({ createdAt: ticket.createdAt,
      responseDueAt: ticket.responseDueAt, firstResponseAt: ticket.firstResponseAt, now })
    : calculations.calculateResolutionSlaWarning({ createdAt: ticket.createdAt,
      resolutionDueAt: ticket.resolutionDueAt, resolvedAt: ticket.resolvedAt, now });
  if (!warning.isWarning || ticket.assignedTo == null) return null;
  if (typeof ticket.ticketNumber !== "string" || !ticket.ticketNumber.trim()) {
    throw new TypeError("Ticket number is required");
  }
  const data = {
    userId: ticket.assignedTo, ticketId: ticket.id, commentId: null,
    type: NOTIFICATION_TYPES.SLA_WARNING,
    title: target === "response" ? "Response SLA approaching" : "Resolution SLA approaching",
    message: `${ticket.ticketNumber} is approaching its ${target === "response" ? "first-response" : "resolution"} SLA deadline.`,
    dedupeKey: `sla-warning:${target}:${ticket.id}:${ticket.assignedTo}`,
  };
  // The caller owns commit and subsequent emission when injecting a transaction.
  if (db !== undefined) return notifications.createNotification(data, db);

  const connection = await pool.getConnection();
  let notification;
  try {
    await connection.beginTransaction();
    notification = await notifications.createNotification(data, connection);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    connection.release();
  }
  if (notification) realtime.emitNotification(notification);
  return notification;
}

function createResponseWarningNotification({ ticket, now, db } = {}) {
  return createWarning(ticket, now, db, "response");
}

function createResolutionWarningNotification({ ticket, now, db } = {}) {
  return createWarning(ticket, now, db, "resolution");
}

module.exports = { createResponseWarningNotification, createResolutionWarningNotification };
