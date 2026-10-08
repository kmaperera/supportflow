-- Apply before deploying Phase 18.11. Existing assets retain their actual public
-- delivery type; this migration does not change remote Cloudinary assets.
ALTER TABLE ticket_attachments
    ADD COLUMN delivery_type VARCHAR(20) NOT NULL DEFAULT 'upload' AFTER resource_type;
