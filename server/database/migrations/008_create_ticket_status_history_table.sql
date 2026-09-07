-- Append-only transitions; existing tickets are not backfilled.
CREATE TABLE IF NOT EXISTS ticket_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    from_status ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'REOPENED') NOT NULL,
    to_status ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'REOPENED') NOT NULL,
    changed_by BIGINT UNSIGNED NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The leading ticket_id also supports ticket-only lookups.
    INDEX idx_ticket_status_history_ticket_changed (ticket_id, changed_at),
    INDEX idx_ticket_status_history_changed_by (changed_by),
    INDEX idx_ticket_status_history_changed_at (changed_at),
    CONSTRAINT fk_ticket_status_history_ticket_id
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_status_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
);
