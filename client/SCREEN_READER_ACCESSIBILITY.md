# Phase 17.15 — Screen reader accessibility

Scope: frontend presentation and accessibility only. No backend, API modules, role rules, mutation eligibility, Socket.IO contracts, or navigation redesign changed. No dependencies added.

1. **Files changed.** The complete inventory is below. Most page changes are small label, relationship, heading, or feedback fixes; shared behavior lives in `DocumentTitle`, `Tabs`, `FieldError`, `ErrorState`, and `FilterBar`.
2. **Landmarks and headings.** Employee, Technician, and Admin retain one `main#main-content`, their labeled sidebar navigation, shared header, and skip link. Auth/standalone Profile and global fallback mains now have stable focus targets. Login has one visible primary heading at all widths. Ticket/article loading and error states and the lazy Analytics fallback also have primary headings. Compact errors no longer introduce competing section headings; the nested KB category editor uses h3.
3. **Forms.** Existing explicit/wrapping labels, native required fields, invalid states, and stable help/error IDs are preserved. Decorative required asterisks are hidden. Field errors and Audit filter errors no longer each fire assertive announcements; focus-first validation and descriptions remain. Form/server errors remain alerts. Rating feedback has a named error relationship and associated length guidance. Pure Cancel navigation in user/category forms uses links, with pending navigation still disabled.
4. **Loading, skeletons, empty/error states.** Loading remains polite; skeleton markup remains decorative with one loading region. Empty states remain ordinary text. Query failures remain alerts with existing retry actions. These primitives were retained and checked rather than rewritten.
5. **Toasts and dialogs.** Success/info/warning toasts remain polite; error toasts remain assertive, with named dismiss buttons and hover/focus timeout pausing. Confirmation dialogs retain native dialog semantics, modal state, actual title/description targets, safe initial focus, trapping, pending behavior, and focus restoration. User/category/KB/assignment errors are rendered once in the open dialog, instead of also behind it. Existing mutation success feedback is reused.
6. **Tables, pagination, filters, tabs.** Reports and Audit tables retain captions and scoped headers. Analytics workload headers now have column scope and its scroll container is keyboard reachable. Existing responsive card lists remain lists with definition lists rather than fake tables. There are no sortable table headers requiring aria-sort; sort selects remain native. Pagination retains its navigation label and aria-current. Shared filter wrappers have a useful group name; native form wrappers retain form semantics. Clear filters keeps its pointer/disabled cursor. KB now uses named tabs and panels: arrows/Home/End move focus, Enter/Space activate, one tab is in the tab sequence, and inactive panels are hidden. Moving between tabs does not itself fetch content.
7. **Technician combobox.** Its name is “Select technician”, with required/expanded/autocomplete state, controls referencing the mounted listbox, active descendant referencing the active option, and selected/disabled option states. Closed options are absent. Existing keyboard selection and current-technician exclusion remain intact.
8. **Tickets, conversation, files.** Employee/Technician/Admin card names include number, title, and textual status. Repeated user, category, and SLA actions include context. Replies and internal notes use named articles and time elements; each internal entry explicitly says “Internal note by …”. File upload retains its native input, selected filename, required/error/help relationships; Open/Download already include filenames and remain buttons because they fetch authenticated blobs.
9. **Notifications.** Cards retain readable type, title, message, timestamp and Read/Unread text. Actions now include the notification title. Explicitly marking one read produces one polite success toast; opening its ticket does not add that toast. View Ticket remains a button because it first marks the notification read. No live region was added to the list, and existing realtime deduplication is unchanged.
10. **Charts and metrics.** The existing visible definition lists are the nonvisual chart alternative, using exactly the same loaded rows. They now sit in named, keyboard-scrollable data regions. Recharts SVG remains hidden and its accessibility layer disabled; no data is lost or requested again. Trend rows are the existing bounded 12-month/30-day series. Dashboard label/value order and text badges remain. SLA ticks are not live regions.
11. **SPA titles.** The startup title is SupportFlow. `DocumentTitle` follows the rendered primary heading, including asynchronous ticket/article titles, and only writes when the title changes. It adds no competing live region and preserves Phase 17.14 route/main focus behavior.
12. **Contrast.** Notification timestamps use slate-600 in Light mode, improving contrast on the tinted unread background; Dark mode keeps slate-400. Browser checks measured badge text across every status/priority tone and sampled notification timestamps against rendered backgrounds at a minimum 4.5:1 in both themes. Existing error/toast/helper/focus colors and textual state meanings remain. This is a targeted contrast review, not a full WCAG certification; disabled controls retain their existing treatment.
13. **Responsive behavior.** Accessibility-tree checks cover all three role shells at 375, 768, and 1440px in Light/Dark (18 combinations), plus KB, Create User, Notifications, and Analytics at those widths/themes (24 combinations), and Login at all three widths. Each exposes one main/h1; collapsed navigation, closed dialogs/popups, inactive panels, and decorative skeletons are excluded. No competing mobile/desktop data representation was added and no mobile navigation redesign was performed.
14. **Contracts preserved.** All edits are under `client/`. Existing frontend API contract/privacy/eligibility tests pass. No live account mutation or backend request was used for browser checks: fixtures use an in-memory Axios adapter.
15. **Validation.** Production build passes (existing >500 kB bundle warning remains); lint passes without warnings. Twenty-six relevant existing smoke suites pass, including API contracts, forms, ticket/comment/file privacy, notifications/realtime deduplication, report/audit data, theme persistence, and loading/error primitives. The trusted-key Phase 17.14 browser suite passes. The new browser accessibility-tree suite passes relationships, names, required/invalid descriptions, dialog/modal state, manual tabs, combobox state, single announcements, chart alternatives, route focus/titles, responsive checks, and sampled contrast. This does not claim NVDA/JAWS/VoiceOver speech testing or a full production-data accessibility audit.

## Reproduce browser checks

Start the normal Vite dev server at `http://127.0.0.1:5173`, then an isolated Edge/Chromium instance with remote debugging port 9223. Run from `client/`:

```sh
node tests/accessibility.cdp.mjs
node tests/keyboard.cdp.mjs
npm run build
npm run lint
```

Run the browser suites sequentially because they drive foreground keyboard focus. `KEYBOARD_CDP_PORT` can override the port. Browser fixtures are test-only and are not imported by the application entry point.

## Changed file inventory

- [SCREEN_READER_ACCESSIBILITY.md](SCREEN_READER_ACCESSIBILITY.md)
- [index.html](index.html)
- [src/App.jsx](src/App.jsx)
- [src/components/DocumentTitle.jsx](src/components/DocumentTitle.jsx)
- [src/components/ErrorState.jsx](src/components/ErrorState.jsx)
- [src/components/FieldError.jsx](src/components/FieldError.jsx)
- [src/components/FilterBar.jsx](src/components/FilterBar.jsx)
- [src/components/Tabs.jsx](src/components/Tabs.jsx)
- [src/pages/admin/AdminAnalyticsPage.jsx](src/pages/admin/AdminAnalyticsPage.jsx)
- [src/pages/admin/AdminAuditLogsPage.jsx](src/pages/admin/AdminAuditLogsPage.jsx)
- [src/pages/admin/AdminKnowledgeBasePage.jsx](src/pages/admin/AdminKnowledgeBasePage.jsx)
- [src/pages/admin/AdminReportsPage.jsx](src/pages/admin/AdminReportsPage.jsx)
- [src/pages/admin/AdminTicketAssignment.jsx](src/pages/admin/AdminTicketAssignment.jsx)
- [src/pages/admin/AdminTicketMetadata.jsx](src/pages/admin/AdminTicketMetadata.jsx)
- [src/pages/admin/AdminTicketsPage.jsx](src/pages/admin/AdminTicketsPage.jsx)
- [src/pages/admin/CategoryFormPage.jsx](src/pages/admin/CategoryFormPage.jsx)
- [src/pages/admin/CategoryManagementPage.jsx](src/pages/admin/CategoryManagementPage.jsx)
- [src/pages/admin/CreateUserPage.jsx](src/pages/admin/CreateUserPage.jsx)
- [src/pages/admin/KbArticleFormPage.jsx](src/pages/admin/KbArticleFormPage.jsx)
- [src/pages/admin/KbCategoryEditor.jsx](src/pages/admin/KbCategoryEditor.jsx)
- [src/pages/admin/SlaSettingsPage.jsx](src/pages/admin/SlaSettingsPage.jsx)
- [src/pages/admin/UserManagementPage.jsx](src/pages/admin/UserManagementPage.jsx)
- [src/pages/auth/ChangePasswordPage.jsx](src/pages/auth/ChangePasswordPage.jsx)
- [src/pages/auth/LoginPage.jsx](src/pages/auth/LoginPage.jsx)
- [src/pages/auth/ProfilePage.jsx](src/pages/auth/ProfilePage.jsx)
- [src/pages/employee/KnowledgeBaseArticlePage.jsx](src/pages/employee/KnowledgeBaseArticlePage.jsx)
- [src/pages/employee/MyTicketsPage.jsx](src/pages/employee/MyTicketsPage.jsx)
- [src/pages/employee/TicketAttachments.jsx](src/pages/employee/TicketAttachments.jsx)
- [src/pages/employee/TicketConversation.jsx](src/pages/employee/TicketConversation.jsx)
- [src/pages/employee/TicketDetailsPage.jsx](src/pages/employee/TicketDetailsPage.jsx)
- [src/pages/employee/TicketRating.jsx](src/pages/employee/TicketRating.jsx)
- [src/pages/shared/NotificationsPage.jsx](src/pages/shared/NotificationsPage.jsx)
- [src/pages/technician/TechnicianTicketCards.jsx](src/pages/technician/TechnicianTicketCards.jsx)
- [src/pages/technician/TechnicianTicketDetailsPage.jsx](src/pages/technician/TechnicianTicketDetailsPage.jsx)
- [src/pages/technician/TicketInternalNotes.jsx](src/pages/technician/TicketInternalNotes.jsx)
- [src/pages/technician/TicketResolveControl.jsx](src/pages/technician/TicketResolveControl.jsx)
- [src/routes/AppRoutes.jsx](src/routes/AppRoutes.jsx)
- [src/routes/RoleHomeRedirect.jsx](src/routes/RoleHomeRedirect.jsx)
- [tests/accessibility.browser.html](tests/accessibility.browser.html)
- [tests/accessibility.cdp.mjs](tests/accessibility.cdp.mjs)
- [tests/accessibility.fixture.jsx](tests/accessibility.fixture.jsx)
- [tests/myTickets.smoke.mjs](tests/myTickets.smoke.mjs)
