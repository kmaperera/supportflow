const { buildExportFilename } = require("./exportFilename");
// Generic in-memory CSV foundation. Columns and download names are server-owned.
function encodeCell(value) {
  let text;
  if (value == null) text = "";
  else if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new TypeError("Invalid CSV date");
    text = value.toISOString();
  } else if (typeof value === "string") {
    // Protect formulas even after leading whitespace/control characters. Real
    // numeric negative values bypass this string-only spreadsheet protection.
    text = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  } else if (typeof value === "number" && Number.isFinite(value)) text = String(value);
  else if (typeof value === "boolean" || typeof value === "bigint") text = String(value);
  else throw new TypeError("CSV values must be scalar values or valid dates; map nested objects explicitly");
  return `"${text.replace(/"/g, '""')}"`;
}

function generateCsv({ columns, rows } = {}) {
  if (!Array.isArray(columns) || columns.length === 0 || columns.some(column =>
    !column || typeof column.header !== "string" || !column.header.trim() ||
    (column.value !== undefined ? typeof column.value !== "function" : typeof column.key !== "string" || !column.key))) {
    throw new TypeError("Invalid CSV column definition");
  }
  if (!Array.isArray(rows)) throw new TypeError("CSV rows must be an array");
  const lines = [columns.map(column => encodeCell(column.header)).join(",")];
  for (const row of rows) {
    if (!row || typeof row !== "object") throw new TypeError("Invalid CSV row");
    lines.push(columns.map(column => encodeCell(column.value ? column.value(row) :
      Object.hasOwn(row, column.key) ? row[column.key] : undefined)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function buildCsvFilename(baseName, date) {
  return buildExportFilename(baseName, "csv", date);
}

function sendCsvDownload(res, { csv, filename } = {}) {
  if (typeof csv !== "string" && !Buffer.isBuffer(csv)) throw new TypeError("Invalid CSV download content");
  if (typeof filename !== "string" || filename.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.csv$/.test(filename)) {
    throw new TypeError("Invalid CSV download filename");
  }
  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
}

module.exports = { generateCsv, buildCsvFilename, sendCsvDownload };
