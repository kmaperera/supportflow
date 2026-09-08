-- Attachment metadata only; file bytes will be stored in Cloudinary.
-- NULL comment_id denotes a direct ticket attachment; otherwise visibility is inherited from the comment.
-- Services will enforce authorization and verify that the comment belongs to the same ticket.
CREATE TABLE IF NOT EXISTS ticket_attachments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    comment_id BIGINT UNSIGNED NULL,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    public_id VARCHAR(255) NOT NULL,
    file_url VARCHAR(1000) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL COMMENT 'File size in bytes',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_ticket_attachments_ticket_id (ticket_id),
    INDEX idx_ticket_attachments_comment_id (comment_id),
    INDEX idx_ticket_attachments_uploaded_by (uploaded_by),
    INDEX idx_ticket_attachments_ticket_created (ticket_id, created_at),
    CONSTRAINT fk_ticket_attachments_ticket_id
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_attachments_comment_id
        FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_attachments_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
);
