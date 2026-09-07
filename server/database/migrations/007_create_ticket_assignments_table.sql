-- Historical assignments; tickets.assigned_to holds the current assignee.
CREATE TABLE IF NOT EXISTS ticket_assignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    technician_id BIGINT UNSIGNED NOT NULL,
    assigned_by BIGINT UNSIGNED NOT NULL,
    assignment_type ENUM('SELF', 'ADMIN') NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unassigned_at DATETIME NULL,

    -- Also supports ticket_id-only lookups through the leading column.
    INDEX idx_ticket_assignments_ticket_active (ticket_id, unassigned_at),
    INDEX idx_ticket_assignments_technician_id (technician_id),
    CONSTRAINT fk_ticket_assignments_ticket_id
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_assignments_technician_id
        FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_assignments_assigned_by
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT
);
