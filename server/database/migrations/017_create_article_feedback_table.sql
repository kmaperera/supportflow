-- Each authenticated user can leave one helpful/not-helpful vote per article.
CREATE TABLE IF NOT EXISTS article_feedback (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    article_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    is_helpful BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uq_article_feedback_article_user (article_id, user_id),
    INDEX idx_article_feedback_article_id (article_id),
    INDEX idx_article_feedback_user_id (user_id),
    INDEX idx_article_feedback_helpful (is_helpful),

    CONSTRAINT fk_article_feedback_article
        FOREIGN KEY (article_id) REFERENCES knowledge_base_articles(id) ON DELETE CASCADE,
    CONSTRAINT fk_article_feedback_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
