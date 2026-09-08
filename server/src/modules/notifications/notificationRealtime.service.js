const { getIO } = require("../../config/socket");
const { NOTIFICATION_TYPES } = require("../../constants/notificationTypes");

function validId(value) {
  return ["string", "number"].includes(typeof value) &&
    (typeof value !== "number" || Number.isSafeInteger(value)) &&
    /^[1-9]\d*$/.test(String(value)) && String(value).length <= 20 &&
    BigInt(value) <= 18446744073709551615n;
}

function buildRealtimeNotificationPayload(notification) {
  if (!notification || !validId(notification.id) || !validId(notification.userId) ||
      (notification.ticketId !== null && !validId(notification.ticketId)) ||
      (notification.commentId !== null && !validId(notification.commentId)) ||
      !Object.values(NOTIFICATION_TYPES).includes(notification.type) ||
      typeof notification.title !== "string" || !notification.title.trim() ||
      typeof notification.message !== "string" || !notification.message.trim() ||
      typeof notification.isRead !== "boolean" ||
      !(typeof notification.createdAt === "string" || notification.createdAt instanceof Date) ||
      !(notification.readAt === null || typeof notification.readAt === "string" || notification.readAt instanceof Date)) {
    throw new TypeError("A valid mapped notification is required");
  }
  const { id, ticketId, commentId, type, title, message, isRead, readAt, createdAt } = notification;
  return { id, ticketId, commentId, type, title, message, isRead, readAt, createdAt };
}

function emitNotification(notification) {
  try {
    const payload = buildRealtimeNotificationPayload(notification);
    getIO().to(`user:${notification.userId}`).emit("notification:new", payload);
    return true;
  } catch {
    console.warn("Notification realtime delivery failed");
    return false;
  }
}

function emitNotifications(notifications) {
  if (!Array.isArray(notifications)) {
    console.warn("Notification realtime delivery failed");
    return false;
  }
  let success = true;
  for (const notification of notifications) {
    if (!emitNotification(notification)) success = false;
  }
  return success;
}

module.exports = { buildRealtimeNotificationPayload, emitNotification, emitNotifications };
