-- New tickets snapshot their SLA deadlines; historical tickets remain NULL.
ALTER TABLE tickets
    ADD COLUMN response_due_at DATETIME NULL,
    ADD COLUMN resolution_due_at DATETIME NULL;
