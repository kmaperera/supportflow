const pool = require("../../config/database");

const COMMENT_SELECT = `
  SELECT c.id, c.ticket_id, c.user_id, c.comment_type, c.content, c.created_at, c.updated_at,
    author.first_name AS author_first_name,
    author.last_name AS author_last_name,
    author.email AS author_email,
    author.role AS author_role,
    author.profile_image_url AS author_profile_image_url
  FROM ticket_comments AS c
  INNER JOIN users AS author ON author.id = c.user_id
`;

async function createComment({ ticketId, userId, commentType, content }, db = pool) {
  const [result] = await db.query(
    `INSERT INTO ticket_comments (ticket_id, user_id, comment_type, content)
     VALUES (?, ?, ?, ?)`,
    [ticketId, userId, commentType, content]
  );
  return result.insertId;
}

async function findById(commentId, db = pool) {
  const [rows] = await db.query(`${COMMENT_SELECT} WHERE c.id = ? LIMIT 1`, [commentId]);
  return rows[0] || null;
}

async function findByTicketId(ticketId, options = {}, db = pool) {
  // Trusted service code supplies this filter after checking authorization.
  const includeInternal = options.includeInternal === true;
  const typeFilter = includeInternal ? "" : " AND c.comment_type = ?";
  const values = includeInternal ? [ticketId] : [ticketId, "PUBLIC"];
  const [rows] = await db.query(
    `${COMMENT_SELECT} WHERE c.ticket_id = ?${typeFilter} ORDER BY c.created_at ASC, c.id ASC`,
    values
  );
  return rows;
}

module.exports = { createComment, findById, findByTicketId };
