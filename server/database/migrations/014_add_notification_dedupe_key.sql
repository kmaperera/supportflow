-- NULL keys preserve ordinary notifications; warning keys enforce idempotency.
ALTER TABLE notifications
    ADD COLUMN dedupe_key VARCHAR(191) NULL,
    ADD UNIQUE INDEX uq_notifications_dedupe_key (dedupe_key);
