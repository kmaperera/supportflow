-- Historical conversation records; comment visibility is enforced by application services.
CREATE TABLE IF NOT EXISTS ticket_comments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    comment_type ENUM('PUBLIC', 'INTERNAL') NOT NULL DEFAULT 'PUBLIC',
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_ticket_comments_ticket_id (ticket_id),
    INDEX idx_ticket_comments_user_id (user_id),
    INDEX idx_ticket_comments_comment_type (comment_type),
    INDEX idx_ticket_comments_ticket_created (ticket_id, created_at),
    CONSTRAINT fk_ticket_comments_ticket_id
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_comments_user_id
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
