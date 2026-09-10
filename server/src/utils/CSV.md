# CSV foundation

`src/utils/csv.js` exports three generic helpers. No application route uses them yet.

- `generateCsv({ columns, rows })`: columns are an explicit ordered array of
  `{ key, header }` or `{ header, value: row => ... }`. Mappers deliberately flatten
  nested objects. Extra row properties are never exported automatically.
- `buildCsvFilename(baseName, date = new Date())`: use a server-owned constant such
  as `supportflow-tickets`. Produces a lowercase slug plus UTC date and `.csv`.
  Unsafe bases are rejected, including paths, quotes and CR/LF. Never pass client
  query/body filename values.
- `sendCsvDownload(res, { csv, filename })`: validates the filename again and sends
  raw string/Buffer content with status 200, UTF-8 text/csv and attachment headers.
  Express calculates content length. Existing JSON responses are unaffected.

Every cell, including headers, is quoted; embedded quotes are doubled. Commas and
embedded CR/LF are preserved. Records use CRLF, including a final CRLF. Content
always starts with a UTF-8 BOM for Excel compatibility; Unicode is preserved.
Empty datasets still include headers.

Null/undefined become empty cells, booleans become true/false, finite numbers and
bigints use their ordinary decimal text, and valid Date objects use UTC ISO-8601.
Objects/arrays and invalid dates/nonfinite numbers require explicit mapping and
otherwise throw TypeError. Invalid columns also throw TypeError; existing global
error handling should hide programmer errors from API clients.

String cells beginning with =, +, -, or @ (including after leading whitespace or
control characters), or starting with tab/CR/LF, receive an apostrophe prefix before
CSV escaping. This spreadsheet protection applies to headers and mapped strings,
not actual negative numbers. Source objects and database values are not modified.

The utility only formats supplied rows in memory. Dataset retrieval, authorization,
export endpoints, and report-specific column definitions belong to later phases.
