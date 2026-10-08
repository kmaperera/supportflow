const path = require("node:path");
const ApiError = require("../utils/ApiError");
const {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENT_FILENAME_LENGTH,
} = require("../constants/attachmentTypes");

function validateAttachmentMetadata(file) {
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

  if (/[\x00-\x1f\x7f]/.test(file.originalname)) {
    throw new ApiError(422, "Attachment filename contains control characters");
  }
  file.originalname = path.posix.basename(path.win32.basename(file.originalname)).trim();

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
  return extension;
}

function validateAttachmentFile(file) {
  const extension = validateAttachmentMetadata(file);

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

  // Shallow signatures only: never decode images or unpack Office archives here.
  const startsWith = (bytes) => file.buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
  const signatures = {
    ".pdf": () => startsWith(Buffer.from("%PDF-")),
    ".png": () => startsWith([137, 80, 78, 71, 13, 10, 26, 10]),
    ".jpg": () => startsWith([255, 216, 255]),
    ".jpeg": () => startsWith([255, 216, 255]),
    ".webp": () => startsWith(Buffer.from("RIFF")) && file.buffer.subarray(8, 12).equals(Buffer.from("WEBP")),
  };
  if (signatures[extension] && !signatures[extension]()) {
    throw new ApiError(415, "Attachment content does not match the file type");
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

module.exports = {
  validateAttachmentMetadata,
  validateAttachmentFile,
  validateSingleAttachment,
};
