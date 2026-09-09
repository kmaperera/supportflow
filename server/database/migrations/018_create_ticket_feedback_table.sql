-- One satisfaction record per ticket; separate from article helpfulness feedback.
CREATE TABLE IF NOT EXISTS ticket_feedback (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uq_ticket_feedback_ticket_id (ticket_id),
    INDEX idx_ticket_feedback_user_id (user_id),
    INDEX idx_ticket_feedback_rating (rating),
    INDEX idx_ticket_feedback_created_at (created_at),

    CONSTRAINT chk_ticket_feedback_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT fk_ticket_feedback_ticket
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_feedback_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
