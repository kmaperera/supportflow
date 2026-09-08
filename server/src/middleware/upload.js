const multer = require("multer");
const ApiError = require("../utils/ApiError");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
});

const uploadSingleAttachment = upload.single("attachment");
const uploadMultipleAttachments = upload.array("attachments", 5);

// Place after the upload helper on future attachment routes, before the global error handler.
function handleMulterError(err, req, res, next) {
  if (!(err instanceof multer.MulterError)) {
    return next(err);
  }

  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      return next(new ApiError(413, "File size exceeds the 10 MB limit"));
    case "LIMIT_FILE_COUNT":
      return next(new ApiError(422, "Too many files uploaded"));
    case "LIMIT_UNEXPECTED_FILE":
      return next(new ApiError(422, "Unexpected file field"));
    default:
      return next(new ApiError(400, "Invalid file upload"));
  }
}

module.exports = {
  uploadSingleAttachment,
  uploadMultipleAttachments,
  handleMulterError,
};
