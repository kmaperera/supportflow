# Phase 17.11 — Search/filter UX

All implementation changes are inside `client/`. No backend, auth, permission, mutation, Socket.IO, export or later-phase changes.

## Shared behavior

- `src/components/FilterBar.jsx`: lightweight structural wrapper with optional active-filter count; preserves each form's submit behavior and responsive grid. Exports compact `ClearFilters`, subtly disabled when criteria are at defaults.
- `src/components/useDebouncedSearch.js`: 350 ms live search with timer cleanup, outer-whitespace normalization, equality guard and an atomic search/page-1 update. A select/submit that commits pending search cancels the pending timer. Paging does not retrigger search. Clear cancels pending search.
- `src/index.css`: filter-only control height, padding, minimum width, placeholder color and mobile/desktop text sizing. Existing real labels remain intact. No icon dependency or new filter framework.
- Existing explicit-submit employee searches, audit Apply filters, and report Generate Report remain explicit. Live selects apply immediately. Admin workload search also uses 350 ms.
- Filter/search/sort changes reset paginated lists to page 1; paging keeps all criteria. Existing server totals, page recovery and pagination controls remain in place.
- All paginated lists filter on the server. Existing local ticket-category and workload filters operate on complete, unpaginated datasets; new KB category filters do likewise.
- Criteria stay visible during loading and errors. Existing initial skeletons, subtle refetch loading, filtered empty states, Retry and stale-report warnings remain. No filter toast or confirmation.
- These lists use effect/request state, not TanStack Query keys. Criteria and pagination remain in their request dependencies. No URL/global-state migration.

## Audited interfaces

| Interface | Result |
| --- | --- |
| Employee My Tickets | Shared search/filter layout, control sizing, counts and disabled compact clear; existing submit search/status/category/priority/sort retained. |
| Employee Knowledge Base | Contextual article placeholder, shared controls/count/clear, updating message; explicit submit retained. |
| Technician Assigned Tickets | Added supported server search/status/category/priority/sort through the existing assigned-to-me endpoint; 350 ms search; only the four supported active statuses. User-controlled ownership parameters are excluded. |
| Technician Unassigned Queue | Shared controls/count/clear and guarded 350 ms search. Fixed unassigned scope, self-assignment and ticket cards retained. |
| Technician Workload | Audited; endpoint accepts no criteria. Remains personal statistics with Refresh, no invented filters or rankings. |
| Admin Users | Shared layout/count/clear, readable sorts, All statuses, guarded 350 ms search. |
| Admin Technicians | Same compact layout and search behavior; role remains TECHNICIAN. |
| Admin Ticket Categories | Shared controls/count/clear, readable sorts and All statuses. Full-dataset local filtering retained. |
| Admin Tickets | Responsive multirow grid, count/clear, 350 ms search; added supported assignedTo technician selector using the complete existing dashboard workload list, including inactive technicians. Assignment state remains independent. |
| Admin Technician Workload | Shared controls/count/clear; 350 ms server search, existing factual full-dataset workload filters and sorts. |
| Admin KB Articles | Shared controls/count/clear, guarded 350 ms search; category select commits immediately with pending search. |
| Admin KB Categories | Separate local search/status state over the complete category list, matching empty state and shared count/clear. Existing tab-mount behavior retained. |
| Admin Analytics | Audited; existing daily/monthly trend selector refetches trend. No unsupported arbitrary date range. |
| Admin Reports | Shared criteria styling/count/clear, contextual search placeholder and lookup defaults. Report types, explicit generation, UTC date validation, applied criteria for pagination/export and stale-result behavior retained. Clear resets draft criteria, preserving the existing generated-result convention. |
| Admin Audit Logs | Shared styling/count/clear and contextual search label/placeholder. Supported action/actor/entity/date fields and explicit Apply filters retained; dates remain inclusive UTC and validated. |

## Limits intentionally respected

- Employee/technician KB article search supports categoryId, but its category-list endpoint is admin-only. No category selector built from incomplete article pages or unauthorized requests.
- KB article publication state is not a supported list parameter.
- Admin workload search endpoint returns active technicians only; no inactive toggle or subjective thresholds added.
- Personal workload statistics have no filter parameters; analytics supports only the existing daily/monthly trend period.
- Existing ticket date parameters were not newly exposed: this phase standardizes the implemented ticket controls; date/report/audit interfaces keep their existing scope.
- No current-page filtering, unsupported name/email/phone search claims, custom selector framework or global filter persistence system.

## Changed files

- Shared: `src/components/FilterBar.jsx`, `src/components/useDebouncedSearch.js`, `src/index.css`.
- API: `src/api/ticketApi.js` (allowlisted assigned-ticket criteria and admin assignedTo).
- Employee: `src/pages/employee/TicketFilters.jsx`, `KnowledgeBasePage.jsx`.
- Technician: `src/pages/technician/QueueFilters.jsx`, `MyAssignedTicketsPage.jsx`, `UnassignedTicketsPage.jsx`.
- Admin: `src/pages/admin/UserManagementPage.jsx`, `TechnicianManagementPage.jsx`, `CategoryManagementPage.jsx`, `AdminTicketsPage.jsx`, `AdminTechnicianWorkloadPage.jsx`, `AdminKnowledgeBasePage.jsx`, `AdminReportsPage.jsx`, `AdminAuditLogsPage.jsx`.
- Verification: `tests/searchFilters.smoke.mjs`, `tests/searchFilters.browser.html`.
- Documentation: `SEARCH_FILTER_UX.md`.

## Verification

- `npm run build`: passed (existing-style warning for chunks larger than 500 kB). Windows sandbox blocked Vite's helper; successful build used approved execution outside the sandbox.
- `npm run lint`: passed.
- 15 smoke scripts passed: searchFilters, myTickets, myAssignedTickets, unassignedTickets, adminTickets, users, knowledgeBase, adminKnowledgeBase, categories, technicianWorkload, adminAnalytics, reports, auditLogs, pagination, formValidation.
- Headless Edge browser fixture passed: no initial duplicate, single debounced search/page reset, outer-only trimming, paging preservation, immediate select cancellation, pending clear cancellation, disabled clear at defaults, and compact/no-overflow fixture controls at 320/375/430 px.
- Browser checks cover the shared control fixture, not an authenticated end-to-end session against a running backend.
