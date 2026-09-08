-- Notifications belong to a recipient and may reference a ticket or comment.
-- Notification types are defined by application constants.
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    ticket_id BIGINT UNSIGNED NULL,
    comment_id BIGINT UNSIGNED NULL,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_notifications_user_id (user_id),
    INDEX idx_notifications_user_is_read (user_id, is_read),
    INDEX idx_notifications_ticket_id (ticket_id),
    INDEX idx_notifications_comment_id (comment_id),
    INDEX idx_notifications_user_created (user_id, created_at),
    CONSTRAINT fk_notifications_user_id
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_ticket_id
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_comment_id
        FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE CASCADE
);
