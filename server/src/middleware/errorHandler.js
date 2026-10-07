const errorHandler = (err, req, res, next) => {
  // Parser errors may contain fragments of submitted credentials or content.
  if (!res.headersSent && ['entity.parse.failed', 'entity.too.large'].includes(err.type)) {
    return res.status(err.type === 'entity.too.large' ? 413 : 400).json({
      success: false,
      message: err.type === 'entity.too.large' ? 'Request body exceeds the 10 KB limit' : 'Malformed JSON request body',
      errors: [],
    });
  }
  const statusCode =
    Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599
      ? err.statusCode
      : 500;
  const isUnexpectedServerError = statusCode >= 500 && !err.isOperational;

  if (isUnexpectedServerError) {
    console.error("Unexpected server error");
  }

  if (res.headersSent) {
    return next(err);
  }

  const response = {
    success: false,
    message: isUnexpectedServerError
      ? "Internal server error"
      : err.message || "Internal server error",
    errors: !isUnexpectedServerError && Array.isArray(err.errors) ? err.errors : [],
  };

  return res.status(statusCode).json(response);
};

module.exports = errorHandler;
