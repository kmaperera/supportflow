# Ticket report query conventions

GET /api/v1/reports/tickets remains ADMIN-only. It accepts search, startDate,
endDate, status, priorityId, categoryId, technicianId, page, limit, sortBy and
sortOrder. Aggregate endpoints retain their own restricted parameters and ordering.

Search trims whitespace, omits blank text and accepts at most 100 characters.
It matches ticket number/title and requester/current technician first name,
last name and email. User %, _ and ! are literal text: parameterized LIKE uses
! as its explicit escape character. Case sensitivity follows database collation.
Search fields combine with OR inside parentheses; other filters combine with AND.

Dates still filter ticket creation using UTC inclusive start and exclusive next-day
end boundaries. Technician filtering uses tickets.assigned_to. Valid nonexistent
IDs continue to return no matches.

Sort keys: createdAt, ticketNumber, title, status, category, priority, requester,
technician. Priority uses its name; user sorts use first name. MySQL's native NULL
ordering preserves unassigned tickets. sortOrder accepts case-insensitive asc/desc
and returns ASC/DESC. Defaults are createdAt DESC. ID breaks ties in the same
direction as the primary sort. Only server-mapped identifiers enter ORDER BY.

Pagination defaults to page 1, limit 25, with maximum limit 100. Beyond-last-page
requests return empty rows with the requested page and complete count metadata.
Rows and count share parameterized WHERE conditions, including the same identity
joins when searching. The response adds sorting alongside filters/pagination/rows.
No export behavior is included.
