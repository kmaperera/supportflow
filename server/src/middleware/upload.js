const multer = require("multer");
const ApiError = require("../utils/ApiError");
const { MAX_ATTACHMENT_SIZE } = require("../constants/attachmentTypes");
const { validateAttachmentMetadata } = require("./attachmentValidation");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE,
    files: 1,
    fields: 0,
    // Busboy emits partsLimit when this count is reached; allow the sole file.
    parts: 2,
    fieldSize: 1024,
    fieldNameSize: 100,
  },
  fileFilter(req, file, callback) {
    try {
      validateAttachmentMetadata(file);
      callback(null, true);
    } catch (err) {
      callback(err);
    }
  },
});

const parseAttachment = upload.single("attachment");
function uploadSingleAttachment(req, res, next) {
  parseAttachment(req, res, (err) => {
    if (!err || err instanceof ApiError || err instanceof multer.MulterError) return next(err);
    // Only parser errors reach this callback, not downstream application errors.
    return next(new ApiError(400, "Malformed multipart upload"));
  });
}

function handleMulterError(err, req, res, next) {
  if (!(err instanceof multer.MulterError)) return next(err);
  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      return next(new ApiError(413, "File size exceeds the 10 MB limit"));
    case "LIMIT_FILE_COUNT":
      return next(new ApiError(422, "Too many files uploaded"));
    case "LIMIT_UNEXPECTED_FILE":
      return next(new ApiError(422, "Unexpected file field"));
    case "LIMIT_FIELD_COUNT":
      return next(new ApiError(422, "Attachment uploads do not accept text fields"));
    case "LIMIT_PART_COUNT":
      return next(new ApiError(422, "Too many multipart parts"));
    default:
      return next(new ApiError(400, "Invalid file upload"));
  }
}

module.exports = { uploadSingleAttachment, handleMulterError };
