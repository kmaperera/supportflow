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
  const { dedupeKey } = notification;
  if (dedupeKey != null && (typeof dedupeKey !== "string" || !dedupeKey.trim() || dedupeKey.length > 191)) {
    throw new ApiError(422, "Notification dedupe key must be 1 to 191 characters");
  }
  return { userId, ticketId, commentId, type, title: title.trim(), message: message.trim(),
    ...(dedupeKey != null ? { dedupeKey } : {}) };
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
  if (id === null) return null;
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

async function getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  validateId(userId, "User ID");
  for (const [value, label] of [[page, "Page"], [limit, "Limit"]]) {
    if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
        !Number.isSafeInteger(Number(value))) {
      throw new ApiError(422, `${label} must be a positive integer`);
    }
  }
  page = Number(page);
  limit = Number(limit);
  if (limit > 100) throw new ApiError(422, "Limit must be between 1 and 100");
  if (![true, false, "true", "false"].includes(unreadOnly)) {
    throw new ApiError(422, "unreadOnly must be true or false");
  }
  unreadOnly = unreadOnly === true || unreadOnly === "true";
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new ApiError(422, "Page exceeds the supported range");
  const [rows, total, unreadCount] = await Promise.all([
    repository.findByUserId(userId, { unreadOnly, limit, offset }),
    repository.countByUserId(userId, { unreadOnly }),
    repository.countUnreadByUserId(userId),
  ]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    notifications: rows.map(mapNotification),
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0 },
    unreadCount,
  };
}

async function markNotificationAsRead(notificationId, userId, db) {
  validateId(notificationId, "Notification ID");
  validateId(userId, "User ID");
  const row = await repository.findByIdAndUserId(notificationId, userId, db);
  if (!row) throw new ApiError(404, "Notification not found");
  const notification = mapNotification(row);
  if (notification.isRead) return notification;
  await repository.markAsRead(notificationId, userId, db);
  const updated = await repository.findByIdAndUserId(notificationId, userId, db);
  if (!updated) throw new ApiError(404, "Notification not found");
  const result = mapNotification(updated);
  if (!result.isRead || result.readAt == null) {
    throw new ApiError(500, "Notification read state could not be updated");
  }
  return result;
}

async function markAllNotificationsAsRead(userId, db) {
  validateId(userId, "User ID");
  const updatedCount = await repository.markAllAsReadByUserId(userId, db);
  const unreadCount = await repository.countUnreadByUserId(userId, db);
  return { updatedCount, unreadCount };
}

module.exports = { createNotification, createNotifications, getNotificationById, getUnreadCount, mapNotification, getUserNotifications,
  markNotificationAsRead, markAllNotificationsAsRead };
