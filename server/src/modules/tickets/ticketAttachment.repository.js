const pool = require("../../config/database");

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
      uploader.profile_image_url AS uploader_profile_image_url
     FROM ticket_attachments AS a
     INNER JOIN users AS uploader ON uploader.id = a.uploaded_by
     WHERE a.id = ? LIMIT 1`,
    [attachmentId]
  );
  return rows[0] || null;
}

module.exports = { createAttachment, findById };
