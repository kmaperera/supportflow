-- One SLA policy per priority; durations are stored exclusively in minutes.
CREATE TABLE IF NOT EXISTS sla_policies (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    priority_id BIGINT UNSIGNED NOT NULL,
    response_time_minutes INT UNSIGNED NOT NULL,
    resolution_time_minutes INT UNSIGNED NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uq_sla_policies_priority_id (priority_id),
    CONSTRAINT fk_sla_policies_priority_id
        FOREIGN KEY (priority_id) REFERENCES ticket_priorities(id) ON DELETE RESTRICT
);
