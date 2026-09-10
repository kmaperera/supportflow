# PDF foundation

`utils/pdf.js` exports `generatePdfReport({title, subtitle?, columns, rows,
orientation?, generatedAt?})`, `buildPdfFilename(baseName, date?)`, and
`sendPdfDownload(res, {pdfBuffer, filename})`. Inputs/column schemas/filenames are
server-owned, not raw client options. Generation returns a Promise of a complete
in-memory Buffer; failures reject before any HTTP response is sent.

Columns use `{header, key, width?}` or `{header, value: row => ..., width?}`.
Widths are points; unspecified widths divide remaining space. Minimum width is 24.
A4 portrait is default; landscape is supported. Margins are 40 points with reserved
footer space. Cells wrap and rows use measured heights. Page breaks repeat headers;
footers identify SupportFlow and page number. Rows too tall for a fresh page reject
with RangeError rather than overflowing or looping. Oversized headers/titles and
invalid definitions also reject. Empty data still renders title and table headers.

Values render as plain text, including HTML-like strings and formula-like text.
No CSV apostrophe sanitization is applied. Null/undefined are empty, booleans use
true/false, numbers use ordinary text and Date objects use UTC ISO-8601. Nested
objects and invalid dates require explicit mapping. Generated-at is UTC ISO-8601.
Built-in Helvetica fonts support limited Unicode; full non-Latin support may need
an explicitly bundled application font in a later phase. No external fonts added.

The shared exportFilename helper validates server-owned slugs and UTC dates for
CSV/PDF; existing CSV wrappers retain their API. PDF downloads validate names again
and send application/pdf attachments. Express determines Buffer content length.
Existing error middleware handles rejected generation as JSON when later routes
connect the utility. No PDF routes, report rules, charts, or file writes are added.
