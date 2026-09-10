function buildExportFilename(baseName, extension, date = new Date()) {
  if (!["csv", "pdf"].includes(extension)) throw new TypeError("Invalid export extension");
  // Callers supply a server constant, never req.query/body. Reject unsafe names
  // instead of attempting to repair path or header-injection input.
  if (typeof baseName !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(baseName) || baseName.length > 80) {
    throw new TypeError("Invalid export filename base");
  }
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999) {
    throw new TypeError("Invalid export filename date");
  }
  return `${baseName.toLowerCase()}-${date.toISOString().slice(0, 10)}.${extension}`;
}

module.exports = { buildExportFilename };
