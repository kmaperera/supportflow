const ALLOWED_ATTACHMENT_TYPES = Object.freeze({
  ".jpg": Object.freeze(["image/jpeg"]),
  ".jpeg": Object.freeze(["image/jpeg"]),
  ".png": Object.freeze(["image/png"]),
  ".webp": Object.freeze(["image/webp"]),
  ".pdf": Object.freeze(["application/pdf"]),
  ".txt": Object.freeze(["text/plain"]),
  ".csv": Object.freeze(["text/csv", "application/csv", "text/plain"]),
  ".doc": Object.freeze(["application/msword"]),
  ".docx": Object.freeze([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  ".xls": Object.freeze(["application/vnd.ms-excel"]),
  ".xlsx": Object.freeze([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
});

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENT_FILENAME_LENGTH = 255;

module.exports = {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENT_FILENAME_LENGTH,
};
