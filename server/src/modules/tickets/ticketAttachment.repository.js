const pool = require("../../config/database");
const { COMMENT_TYPES } = require("../../constants/commentTypes");

async function createAttachment({
  ticketId, commentId = null, uploadedBy, originalName, publicId,
  fileUrl, resourceType, mimeType, fileSize,
}, db = pool) {
  const [result] = await db.query(
    `INSERT INTO ticket_attachments
      (ticket_id, comment_id, uploaded_by, original_name, public_id,
       file_url, resource_type, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, commentId, uploadedBy, originalName, publicId,
      fileUrl, resourceType, mimeType, fileSize]
  );
  return result.insertId;
}

async function findById(attachmentId, db = pool) {
  const [rows] = await db.query(
    `SELECT a.id, a.ticket_id, a.comment_id, a.uploaded_by, a.original_name,
      a.public_id, a.file_url, a.resource_type, a.mime_type, a.file_size, a.created_at,
      uploader.first_name AS uploader_first_name,
      uploader.last_name AS uploader_last_name,
      uploader.email AS uploader_email,
      uploader.role AS uploader_role,
      uploader.profile_image_url AS uploader_profile_image_url, c.comment_type
     FROM ticket_attachments AS a
     INNER JOIN users AS uploader ON uploader.id = a.uploaded_by
     LEFT JOIN ticket_comments AS c ON c.id = a.comment_id AND c.ticket_id = a.ticket_id
     WHERE a.id = ? LIMIT 1`,
    [attachmentId]
  );
  return rows[0] || null;
}

async function findByTicketId(ticketId, options = {}, db = pool) {
  // Only trusted service code may enable internal-comment visibility.
  const includeInternal = options.includeInternal === true;
  const visibilityFilter = includeInternal ? "" : " AND (a.comment_id IS NULL OR c.comment_type = ?)";
  const values = includeInternal ? [ticketId] : [ticketId, COMMENT_TYPES.PUBLIC];
  const [rows] = await db.query(
    `SELECT a.id, a.ticket_id, a.comment_id, a.original_name, a.public_id,
      a.file_url, a.resource_type, a.mime_type, a.file_size, a.created_at,
      u.id AS uploader_id, u.first_name AS uploader_first_name,
      u.last_name AS uploader_last_name, u.email AS uploader_email,
      u.role AS uploader_role, u.profile_image_url AS uploader_profile_image_url,
      c.comment_type
     FROM ticket_attachments AS a
     INNER JOIN users AS u ON u.id = a.uploaded_by
     LEFT JOIN ticket_comments AS c ON c.id = a.comment_id
     WHERE a.ticket_id = ?${visibilityFilter}
     ORDER BY a.created_at ASC, a.id ASC`,
    values
  );
  return rows;
}

module.exports = { createAttachment, findById, findByTicketId };
