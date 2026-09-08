const path = require("node:path");
const ApiError = require("../utils/ApiError");
const {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENT_FILENAME_LENGTH,
} = require("../constants/attachmentTypes");

// Metadata validation only; this does not inspect file signatures or contents.
function validateAttachmentFile(file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    throw new ApiError(422, "Attachment file is required");
  }

  if (
    typeof file.originalname !== "string" ||
    !file.originalname.trim() ||
    file.originalname.length > MAX_ATTACHMENT_FILENAME_LENGTH
  ) {
    throw new ApiError(422, "Attachment filename is invalid");
  }

  const extension = path.extname(file.originalname).toLowerCase();
  if (!extension || extension === ".") {
    throw new ApiError(422, "Attachment filename must have a file extension");
  }

  const allowedMimeTypes = ALLOWED_ATTACHMENT_TYPES[extension];
  if (!allowedMimeTypes) {
    throw new ApiError(415, "Attachment type is not supported");
  }

  if (
    typeof file.mimetype !== "string" ||
    !allowedMimeTypes.includes(file.mimetype)
  ) {
    throw new ApiError(415, "Attachment MIME type does not match the file extension");
  }

  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new ApiError(422, "Attachment file size is invalid");
  }
  if (file.size === 0) {
    throw new ApiError(422, "Attachment file cannot be empty");
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new ApiError(413, "Attachment exceeds the 10 MB size limit");
  }

  if (!Buffer.isBuffer(file.buffer)) {
    throw new ApiError(422, "Attachment file buffer is required");
  }
  if (file.buffer.length === 0) {
    throw new ApiError(422, "Attachment file cannot be empty");
  }
  if (file.buffer.length > MAX_ATTACHMENT_SIZE) {
    throw new ApiError(413, "Attachment exceeds the 10 MB size limit");
  }
  if (file.buffer.length !== file.size) {
    throw new ApiError(422, "Attachment file size does not match its buffer");
  }
}

function validateSingleAttachment(req, res, next) {
  try {
    validateAttachmentFile(req.file);
  } catch (err) {
    return next(err);
  }
  return next();
}

function validateMultipleAttachments(req, res, next) {
  try {
    if (!Array.isArray(req.files) || req.files.length === 0) {
      throw new ApiError(422, "Attachment file is required");
    }
    if (req.files.length > 5) {
      throw new ApiError(422, "Too many files uploaded");
    }
    for (const file of req.files) {
      validateAttachmentFile(file);
    }
  } catch (err) {
    return next(err);
  }
  return next();
}

module.exports = {
  validateAttachmentFile,
  validateSingleAttachment,
  validateMultipleAttachments,
};
