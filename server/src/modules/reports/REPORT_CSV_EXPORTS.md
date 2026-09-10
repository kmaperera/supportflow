# Aggregate report CSV exports

All routes below inherit reports authentication and ADMIN authorization. Their
validation and data come directly from the matching JSON report service. Columns
are defined in reports.csv.js; generic escaping/BOM/formula protection and download
headers remain in utils/csv.js. CSV output follows JSON ordering without recalculating
metrics. Filenames use fixed server-owned bases and the current UTC date.

- /reports/date-range/export/csv: Date, Ticket Count; required startDate/endDate,
  includes zero-filled days.
- /reports/technician-performance/export/csv: Technician, Email, Active, Assigned
  Tickets, Resolved Tickets, Average First Response Minutes, Average Resolution
  Minutes, Response SLA Compliance %, Resolution SLA Compliance %. Uses existing
  historical attribution. Optional startDate/endDate.
- /reports/sla/export/csv: SLA Type, Tracked Tickets, Met Tickets, Missed Tickets,
  Pending Tickets, Completed Tickets, Compliance %. Response then Resolution rows.
- /reports/categories/export/csv: Category, Active, Total Tickets, Active Tickets,
  Resolved Tickets, Closed Tickets, Percentage of Tickets.
- /reports/priorities/export/csv: Priority, Total Tickets, Active Tickets,
  Resolved Tickets, Closed Tickets, Percentage of Tickets. Preserves severity order.
- /reports/statuses/export/csv: Status, Total Tickets, Percentage of Tickets.
  Always includes seven lifecycle-ordered statuses.

The application prefix is /api/v1. Each export accepts only its corresponding JSON
report's filters. Pagination, client columns/filenames, and arbitrary dispatch are
not supported. Null metrics are empty cells. Empty arrays retain the header, while
existing zero-filled/configured rows remain present. Validation/auth/server failures
use JSON errors and no attachment headers. CSVs are generated in memory; no files,
email, PDF, or persistence behavior is added.
