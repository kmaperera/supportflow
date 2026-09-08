const pool = require("../../config/database");

const NOTIFICATION_SELECT = `
  SELECT id, user_id, ticket_id, comment_id, type, title, message,
    is_read, read_at, created_at
  FROM notifications
`;

async function createNotification({ userId, ticketId = null, commentId = null, type, title, message, dedupeKey = null }, db = pool) {
  try {
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, ticket_id, comment_id, type, title, message, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, ticketId, commentId, type, title, message, dedupeKey]
  );
  return result.insertId;
  } catch (error) {
    if (dedupeKey !== null && error.code === "ER_DUP_ENTRY" &&
        /for key ['`](?:notifications\.)?uq_notifications_dedupe_key['`]/.test(error.sqlMessage || error.message || "")) {
      return null;
    }
    throw error;
  }
}

async function createNotifications(notifications, db = pool) {
  if (!Array.isArray(notifications)) throw new TypeError("Notifications must be an array");
  // Individual inserts return exact IDs without assuming contiguous AUTO_INCREMENT values.
  const ids = [];
  for (const notification of notifications) {
    const id = await createNotification(notification, db);
    if (id !== null) ids.push(id);
  }
  return ids;
}

async function findById(notificationId, db = pool) {
  const [rows] = await db.query(`${NOTIFICATION_SELECT} WHERE id = ? LIMIT 1`, [notificationId]);
  return rows[0] || null;
}

async function findByUserId(userId, options = {}, db = pool) {
  const { limit = 20, offset = 0 } = options;
  const unreadFilter = options.unreadOnly === true ? " AND is_read = FALSE" : "";
  const [rows] = await db.query(
    `${NOTIFICATION_SELECT} WHERE user_id = ?${unreadFilter}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return rows;
}

async function countByUserId(userId, options = {}, db = pool) {
  const unreadFilter = options.unreadOnly === true ? " AND is_read = FALSE" : "";
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?${unreadFilter}`,
    [userId]
  );
  return Number(rows[0].total);
}

async function countUnreadByUserId(userId, db = pool) {
  return countByUserId(userId, { unreadOnly: true }, db);
}

async function findByIdAndUserId(notificationId, userId, db = pool) {
  const [rows] = await db.query(
    `${NOTIFICATION_SELECT} WHERE id = ? AND user_id = ? LIMIT 1`,
    [notificationId, userId]
  );
  return rows[0] || null;
}

async function markAsRead(notificationId, userId, db = pool) {
  const [result] = await db.query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = ? AND user_id = ? AND is_read = FALSE`,
    [notificationId, userId]
  );
  return result.affectedRows;
}

async function markAllAsReadByUserId(userId, db = pool) {
  const [result] = await db.query(
    `UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND is_read = FALSE`,
    [userId]
  );
  return result.affectedRows;
}

module.exports = { createNotification, createNotifications, findById, findByUserId, countByUserId, countUnreadByUserId,
  findByIdAndUserId, markAsRead, markAllAsReadByUserId };
