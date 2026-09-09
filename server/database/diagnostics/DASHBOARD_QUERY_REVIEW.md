# Phase 11.18 query review

## Verification and deployment

Live SHOW INDEX and EXPLAIN were run on the configured development database on 2026-09-09. See `dashboard-explain-before.json` for possible_keys, chosen key, estimated rows and Extra. These are estimates on a small dataset, not latency benchmarks. No persistent database schema/data changes were made during this review. Migration 019 must be applied through the normal SQL migration process before the new indexes benefit deployed queries.

Run `node database/diagnostics/dashboard-explain.js` from server to repeat the read-only inspection against its configured database. It prints indexes and plans only, not credentials or ticket content. Compare after applying migration 019 on staging with representative data; do not force indexes just to change a plan. The script calls actual repository methods through an EXPLAIN adapter, so query changes are reflected automatically. Scope IDs 1/2 and the sample UTC range can be adjusted in this development-only script for representative data.

## Query inventory and decisions

| Feature | Query shape and decision |
| --- | --- |
| Employee summary | One owner-filtered conditional aggregate; retained. |
| Technician summary | Current-assignment aggregate plus indexed unassigned count; independent pool reads now overlap. |
| Admin summary | Ticket aggregate, unassigned count, user aggregate; independent pool reads now overlap. Separate queue count can use the assignment index; no speculative larger aggregate rewrite. |
| Cards | Reuses exactly one role summary; no duplicate per-card queries. |
| Status distribution | Scoped GROUP BY status; retained SQL aggregation. |
| Category distribution | One scoped join to category identity, grouped counts; no redundant joins. |
| Priority distribution | LEFT JOIN with scope in ON preserves zero priorities; unchanged. |
| Workload | Users filtered by role, LEFT JOIN current assignment; retains inactive and empty technicians. |
| First-response/resolution averages | Single scoped AVG/COUNT each, valid persisted completion timestamps; no inclusion changes. |
| SLA compliance | One scoped conditional aggregate across both dimensions; no policy join. |
| Trend | Half-open raw created_at range before DATE_FORMAT grouping; new scoped creation indexes support this range. UTC boundaries and zero-fill unchanged. |
| Recent tickets | Lightweight category/priority joins, creation DESC/id DESC LIMIT; scoped creation indexes address filesort. |
| Activity | Four bounded source queries joining ticket and actor identity; no N+1. PUBLIC filtering remains before LIMIT for employees. Pool concurrency preserved; injected connections now execute sequentially. |
| Feedback submission | Existing ticket lock, ticket lookup and feedback lookup/write/readback in one transaction. No changes: transaction ordering and ownership semantics retained. Full ticket lookup uses explicit columns; this phase avoids changing lifecycle repository contracts. |
| Satisfaction | One narrow global aggregate; existing rating index supplies a covering scan. |

No SELECT * in production dashboard/feedback queries; no per-row lookups; no unsafe client interpolation found. SQL scopes and LIMIT values are parameterized. Trend formats and activity identifiers come from internal allowlists. Existing numeric/null mapping, validation and UTC helpers were retained; only a small independent-read helper was needed.

## Existing indexes inspected live

- tickets: PK(id), unique(ticket_number), created_by, assigned_to, created_at, category_id, priority_id, (status, priority_id).
- users: PK(id), unique(email), role, is_active, department.
- categories: PK(id), unique(name), is_active, created_by FK index. Priorities: PK(id), unique(name), unique(sort_order), is_active.
- status history: (ticket_id, changed_at), changed_by, changed_at, PK(id).
- assignments: (ticket_id, unassigned_at), technician_id, assigned_by FK index, PK(id).
- comments: ticket_id, user_id, comment_type, (ticket_id, created_at), PK(id).
- feedback: UNIQUE(ticket_id), user_id, rating, created_at, PK(id).

Migration 019 adds only tickets(created_by, created_at) and tickets(assigned_to, created_at). Equality scope then creation order/range matches two existing endpoints. InnoDB's implicit PK suffix supports the id ordering tie-break without another explicit id column. Metadata guards skip equivalent leading-column indexes, even under different names; no unsupported CREATE INDEX IF NOT EXISTS syntax. Existing indexes are preserved for other workloads. Additional storage and creation/assignment write maintenance are the tradeoff.

No single-column timing/deadline indexes were added: comparisons between columns and whole-scope aggregates do not justify one index per timestamp. No feedback indexes duplicated. Global assignment/comment activity scans are only 5/2 estimated rows here; defer extra event-time indexes until representative volume justifies write overhead.

## Representative observations before migration

- Employee recent tickets: created_by ref lookup, estimated 1 ticket, Using filesort; category/priority PK joins.
- Technician recent tickets: assigned_to lookup with filesort (see raw plan for estimate). Neither existing index includes creation time.
- Scoped trend: owner/assignment access plus grouping temporary/filesort; composite indexes can cover scope and timestamp range, though grouping may still sort.
- Category: owner ref and category PK join; temporary/filesort is expected for aggregate ordering by count.
- Workload: users role index (2 estimated rows), tickets assigned_to ref (2); aggregate sorting remains necessary.
- Status activity: ticket ownership lookup and (ticket_id, changed_at) history lookup (3 estimated history rows); cross-ticket global ordering may require sorting.
- Satisfaction: type=index, idx_ticket_feedback_rating, 2 estimated rows, Using index. Full rating scan is necessary for a global AVG/count distribution.

No after-migration speedup is claimed: migration is supplied but not applied to the configured database. No caching, new endpoints, response fields, metrics, business rules or denormalization were introduced.
