# Analytics PDF

GET /api/v1/reports/analytics/export/pdf is ADMIN-only. Only optional startDate and
endDate are accepted, using the existing strict UTC report date validation. Dates
filter ticket creation as in each source report. No other filters/pagination apply.

reports.analyticsPdf.js calls the existing Technician Performance, SLA, Category,
Priority, and Status services. Normal pool reads run concurrently; an injected
connection is used sequentially. No extra SQL or analytics recalculation is added.
Overview derives total/active/resolved/closed counts from the Status output. Active
means OPEN, ASSIGNED, IN_PROGRESS, WAITING_FOR_USER and REOPENED. All other metrics
and ordering are copied from their source reports, including historical technician
attribution and zero-data/inactive rows.

The six sections are Overview, SLA Performance, Status Distribution, Category
Distribution, Priority Distribution, Technician Performance. A4 landscape, one
section starting per page, gives clear headings and spacing. Long sections repeat
headings/headers on continuation pages. The generic PDF helper now accepts a
sections array; its existing columns/rows API remains supported. These APIs are
mutually exclusive. Percentages append % without changing the source number;
null values are blank. No charts or detailed ticket data are included.

The validated date period appears in the subtitle. Generated timestamp and filename
use UTC. Filename: supportflow-analytics-report-YYYY-MM-DD.pdf. Successful output is
a raw in-memory PDF attachment; errors remain JSON and no report files are saved.
Independent report reads are not a transactional snapshot during concurrent writes,
matching the existing report semantics.
