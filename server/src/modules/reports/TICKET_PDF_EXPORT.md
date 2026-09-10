# Ticket PDF export

GET /api/v1/reports/tickets/export/pdf is ADMIN-only and reuses Ticket CSV's
normalization and shared unpaginated export retrieval. Accepts search, startDate,
endDate, status, priorityId, categoryId, technicianId, sortBy and sortOrder.
page/limit and client titles/filenames are rejected. UTC creation-date boundaries,
literal LIKE search, current assignment and deterministic sorting match JSON/CSV.

The in-memory A4 landscape table uses the existing PDF utility with explicit
widths totaling 761 points. Columns are Ticket Number, Title, Status, Category,
Priority, Requester, Assigned Technician, Created At, First Response At, Resolved At.
Names follow existing first/last-name mapping; unassigned names and null timestamps
are blank. Dates use YYYY-MM-DD HH:mm UTC, decoded by the export query as UTC.
Text is passed directly to PDFKit, including formula/HTML-like text. No CSV prefixes.
The renderer wraps cells, repeats headers and numbers pages; oversized rows retain
its controlled failure behavior. Built-in font limitations remain as documented.

The title is SupportFlow Ticket Report and filename is
supportflow-ticket-report-YYYY-MM-DD.pdf, using the server's current UTC date.
Empty results still render the title/table header. Successful responses are raw
PDF attachments; failures remain JSON without attachment headers. No generated
files are saved. Existing CSV and JSON contracts remain unchanged.
