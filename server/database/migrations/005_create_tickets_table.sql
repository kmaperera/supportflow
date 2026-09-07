-- Core ticket data; assignment history and workflow rules are handled separately.
CREATE TABLE IF NOT EXISTS tickets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_number VARCHAR(30) NOT NULL UNIQUE,
    created_by BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    priority_id BIGINT UNSIGNED NOT NULL,
    assigned_to BIGINT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status ENUM(
        'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER',
        'RESOLVED', 'CLOSED', 'REOPENED'
    ) NOT NULL DEFAULT 'OPEN',
    first_response_at DATETIME NULL,
    resolved_at DATETIME NULL,
    closed_at DATETIME NULL,
    resolution_summary TEXT NULL,

    -- SLA snapshots reserved for future SLA support.
    sla_response_due_at DATETIME NULL,
    sla_resolution_due_at DATETIME NULL,
    sla_response_breached BOOLEAN NOT NULL DEFAULT FALSE,
    sla_resolution_breached BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_tickets_created_by (created_by),
    INDEX idx_tickets_category_id (category_id),
    INDEX idx_tickets_priority_id (priority_id),
    INDEX idx_tickets_assigned_to (assigned_to),
    INDEX idx_tickets_created_at (created_at),
    -- The leading status column also supports status-only filtering.
    INDEX idx_tickets_status_priority (status, priority_id),

    CONSTRAINT fk_tickets_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_category_id
        FOREIGN KEY (category_id) REFERENCES ticket_categories(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_priority_id
        FOREIGN KEY (priority_id) REFERENCES ticket_priorities(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_assigned_to
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
