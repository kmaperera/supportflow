-- Allow insertion before assigning a number derived from the generated ticket ID.
-- MODIFY changes nullability without removing the existing unique index.
ALTER TABLE tickets
    MODIFY COLUMN ticket_number VARCHAR(30) NULL;
