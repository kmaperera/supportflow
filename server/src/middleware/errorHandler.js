const errorHandler = (err, req, res, next) => {
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

  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
};

module.exports = errorHandler;
