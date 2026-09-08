const pool = require("../../config/database");

const NOTIFICATION_SELECT = `
  SELECT id, user_id, ticket_id, comment_id, type, title, message,
    is_read, read_at, created_at
  FROM notifications
`;

async function createNotification({ userId, ticketId = null, commentId = null, type, title, message }, db = pool) {
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, ticket_id, comment_id, type, title, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, ticketId, commentId, type, title, message]
  );
  return result.insertId;
}

async function createNotifications(notifications, db = pool) {
  if (!Array.isArray(notifications)) throw new TypeError("Notifications must be an array");
  // Individual inserts return exact IDs without assuming contiguous AUTO_INCREMENT values.
  const ids = [];
  for (const notification of notifications) {
    ids.push(await createNotification(notification, db));
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

module.exports = { createNotification, createNotifications, findById, findByUserId, countByUserId, countUnreadByUserId };
