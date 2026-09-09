-- Knowledge Base articles retain their category and author references.
CREATE TABLE IF NOT EXISTS knowledge_base_articles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL,
    content TEXT NOT NULL,
    status ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NOT NULL,
    published_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uq_knowledge_base_articles_slug (slug),
    INDEX idx_knowledge_base_articles_category_id (category_id),
    INDEX idx_knowledge_base_articles_status (status),
    INDEX idx_knowledge_base_articles_created_by (created_by),
    INDEX idx_knowledge_base_articles_published_at (published_at),

    CONSTRAINT fk_knowledge_base_articles_category
        FOREIGN KEY (category_id) REFERENCES knowledge_base_categories(id) ON DELETE RESTRICT,
    CONSTRAINT fk_knowledge_base_articles_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);
