const repository = require("./notification.repository");
const { NOTIFICATION_TYPES } = require("../../constants/notificationTypes");
const ApiError = require("../../utils/ApiError");

function validateId(value, label) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value)) ||
      !/^[1-9]\d*$/.test(String(value)) || String(value).length > 20 ||
      BigInt(value) > 18446744073709551615n) {
    throw new ApiError(422, `${label} must be a positive integer`);
  }
}

function validateNotification(notification) {
  if (!notification || typeof notification !== "object" || Array.isArray(notification)) {
    throw new ApiError(422, "Notification data is required");
  }
  const { userId, ticketId = null, commentId = null, type, title, message } = notification;
  validateId(userId, "User ID");
  if (ticketId !== null) validateId(ticketId, "Ticket ID");
  if (commentId !== null) validateId(commentId, "Comment ID");
  if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
    throw new ApiError(422, "Invalid notification type");
  }
  if (typeof title !== "string" || !title.trim() || Array.from(title.trim()).length > 255) {
    throw new ApiError(422, "Notification title must be 1 to 255 characters");
  }
  if (typeof message !== "string" || !message.trim()) {
    throw new ApiError(422, "Notification message is required");
  }
  return { userId, ticketId, commentId, type, title: title.trim(), message: message.trim() };
}

function mapNotification(row) {
  return {
    id: row.id, userId: row.user_id, ticketId: row.ticket_id, commentId: row.comment_id,
    type: row.type, title: row.title, message: row.message,
    isRead: row.is_read === true || row.is_read === 1 || row.is_read === "1",
    readAt: row.read_at, createdAt: row.created_at,
  };
}

async function getCreatedNotification(id, db) {
  const row = await repository.findById(id, db);
  if (!row) throw new ApiError(500, "Created notification could not be retrieved");
  return mapNotification(row);
}

async function createNotification(notification, db) {
  const data = validateNotification(notification);
  const id = await repository.createNotification(data, db);
  return getCreatedNotification(id, db);
}

async function createNotifications(notifications, db) {
  if (!Array.isArray(notifications)) throw new ApiError(422, "Notifications must be an array");
  // Validate the entire batch before the first write; the caller owns any transaction.
  const validated = Array.from(notifications, validateNotification);
  const ids = await repository.createNotifications(validated, db);
  const created = [];
  for (const id of ids) created.push(await getCreatedNotification(id, db));
  return created;
}

async function getNotificationById(notificationId, db) {
  validateId(notificationId, "Notification ID");
  const row = await repository.findById(notificationId, db);
  return row ? mapNotification(row) : null;
}

async function getUnreadCount(userId, db) {
  validateId(userId, "User ID");
  return repository.countUnreadByUserId(userId, db);
}

module.exports = { createNotification, createNotifications, getNotificationById, getUnreadCount, mapNotification };
