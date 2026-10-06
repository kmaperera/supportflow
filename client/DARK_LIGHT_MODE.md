# Phase 17.13 — Dark/Light Mode

Implemented only inside client/. No backend, API, schema, authentication behavior, ticket workflow, SLA calculation, report/export semantics, navigation redesign or later-phase work.

## Theme layer and control

- `src/theme/ThemeProvider.jsx` mounts once in `main.jsx`, outside the existing router/auth/toast providers.
- `src/theme/ThemeContext.js` exports `useTheme()` with `theme`, `resolvedTheme`, and `setTheme`.
- `src/theme/theme.js` centralizes supported values, safe preference reads and root appearance application.
- Light and Dark are explicit choices. System is the default and follows device appearance. Media-query changes update resolved appearance without rewriting the saved System preference. Listener cleanup occurs on unmount.
- Only `supportflow-theme` is written to localStorage. Missing/invalid values fall back to System. Storage failures are caught; the app renders and manual selection still works in memory.
- Storage events synchronize preferences across tabs, including preference removal/clear. No backend preference storage or theme toast.
- Shared Profile includes the full Appearance selector for Light, Dark and System. No extra header control or layout redesign.

## Startup and CSS

`public/theme-init.js` is a small classic script loaded in the document head before the application module. It applies the saved/resolved root `dark` class and native color-scheme before React renders. It uses the same accepted values/defaults as the provider and tolerates unavailable storage. `index.css` defines Tailwind 4's class-driven dark variant and theme variables for the page and charts.

All role layouts, auth screens and shared panels now have explicit dark surface, border and text variants. Main, secondary and muted text retain their hierarchy. Existing dark login branding is preserved; uploaded images and icons are not inverted.

## Coverage

- Employee, Technician and Admin page backgrounds, sidebars, headers, active/hover navigation, profile areas and current mobile navigation.
- Forms, inputs, textareas, selects, date controls, assignment comboboxes, validation messages/borders, focus indicators, disabled controls and search/filter bars. Clear filters retains pointer/not-allowed cursors and neutral styling.
- Tables, headers, dividers, summaries, cards, nested comment/note surfaces, attachments, timelines, resolution sections, KB articles/editor/category management, notification states and audit metadata/pre blocks.
- Shared status/priority/state badges keep their mappings and text, with muted dark backgrounds and readable colored foregrounds.
- Loading spinner, skeletons, empty/error states, all toast variants, pagination and confirmation dialogs follow the root theme, including portal dialogs and their backdrop. Existing semantics and behavior remain intact.
- Internal notes retain their explicit internal wording and distinct amber surface; notifications retain read/unread labels.
- Report criteria/results/export controls are themed; backend-generated CSV/PDF files are unchanged.
- Recharts axes, grid, tooltip surface/text, hover cursor and series colors use CSS variables. The same chart implementations serve both themes; labels and datasets are unchanged.
- Native color-scheme is set for controls, popup menus and browser-managed form appearance. No fragile autofill override was introduced. Real saved-credential autofill was not exercised in the isolated browser fixture.

## Verification

- Production build passed; existing bundle-size warning remains.
- Lint and git diff --check passed.
- `tests/theme.smoke.mjs` passed startup matrix coverage for explicit modes, System, missing/invalid values, blocked storage and native color-scheme.
- `tests/theme.browser.html` passed in headless Edge: early saved-dark application, persistence, Light/Dark/System, OS changes without overriding System, explicit preference precedence, cross-tab events, invalid/blocked storage, listener cleanup, changing surfaces, retained Clear filters cursors and fixture no-overflow checks at 320/375/768/1440 px in both themes.
- 13 existing smoke suites passed: profile, employeeLayout, roleRoutes, changePassword, emptyStates, errorStates, skeletons, pagination, formValidation, adminAnalytics, reports, notifications, searchFilters. Profile's fixture now includes the application theme provider and checks the Appearance options.
- Legacy `technicianLayout.smoke.mjs` fails its assertion requiring `Coming in Phase ...` placeholders on already completed pages. Theme changes only alter color classes in that layout; the stale assertion was not changed.
- Responsive browser checks cover shared appearance/form/panel/badge/feedback controls, not every authenticated page or a live backend session.

## File inventory

Added:
- public/theme-init.js
- src/theme/ThemeProvider.jsx
- src/theme/ThemeContext.js
- src/theme/theme.js
- src/theme/AppearanceSettings.jsx
- tests/theme.smoke.mjs
- tests/theme.browser.html
- DARK_LIGHT_MODE.md

Updated:
- index.html
- src/auth/AuthFeedback.jsx
- src/auth/LogoutButton.jsx
- src/auth/SessionActions.jsx
- src/components/Badges.jsx
- src/components/ConfirmDialog.jsx
- src/components/ContentSkeleton.jsx
- src/components/EmptyState.jsx
- src/components/ErrorState.jsx
- src/components/FieldError.jsx
- src/components/FilterBar.jsx
- src/components/LoadingState.jsx
- src/components/Pagination.jsx
- src/components/ToastProvider.jsx
- src/index.css
- src/layouts/AdminLayout.jsx
- src/layouts/EmployeeLayout.jsx
- src/layouts/MetadataList.jsx
- src/layouts/PageHeader.jsx
- src/layouts/SummaryCard.jsx
- src/layouts/TechnicianLayout.jsx
- src/layouts/WorkspaceHeader.jsx
- src/main.jsx
- src/pages/admin/AdminAnalyticsPage.jsx
- src/pages/admin/AdminAuditLogsPage.jsx
- src/pages/admin/AdminDashboardPage.jsx
- src/pages/admin/AdminKnowledgeBasePage.jsx
- src/pages/admin/AdminPlaceholderPage.jsx
- src/pages/admin/AdminReportsPage.jsx
- src/pages/admin/AdminTechnicianWorkloadPage.jsx
- src/pages/admin/AdminTicketAssignment.jsx
- src/pages/admin/AdminTicketDetailsPage.jsx
- src/pages/admin/AdminTicketsPage.jsx
- src/pages/admin/CategoryManagementPage.jsx
- src/pages/admin/CreateUserPage.jsx
- src/pages/admin/KbArticleFormPage.jsx
- src/pages/admin/ReportExportActions.jsx
- src/pages/admin/ReportResults.jsx
- src/pages/admin/SlaSettingsPage.jsx
- src/pages/admin/TechnicianManagementPage.jsx
- src/pages/admin/UserManagementPage.jsx
- src/pages/admin/categoryPresentation.js
- src/pages/admin/kbPresentation.js
- src/pages/auth/ChangePasswordPage.jsx
- src/pages/auth/LoginPage.jsx
- src/pages/auth/ProfilePage.jsx
- src/pages/employee/CloseTicketButton.jsx
- src/pages/employee/CreateTicketPage.jsx
- src/pages/employee/EditTicketForm.jsx
- src/pages/employee/EmployeeDashboardPage.jsx
- src/pages/employee/EmployeePlaceholderPage.jsx
- src/pages/employee/KnowledgeBaseArticlePage.jsx
- src/pages/employee/KnowledgeBasePage.jsx
- src/pages/employee/MyTicketsPage.jsx
- src/pages/employee/ReopenTicketButton.jsx
- src/pages/employee/SuggestedArticles.jsx
- src/pages/employee/TicketAttachments.jsx
- src/pages/employee/TicketConversation.jsx
- src/pages/employee/TicketDetailsPage.jsx
- src/pages/employee/TicketFilters.jsx
- src/pages/employee/TicketRating.jsx
- src/pages/employee/TicketStatusTimeline.jsx
- src/pages/shared/NotificationsPage.jsx
- src/pages/technician/MyAssignedTicketsPage.jsx
- src/pages/technician/QueueFilters.jsx
- src/pages/technician/TechnicianDashboardPage.jsx
- src/pages/technician/TechnicianPlaceholderPage.jsx
- src/pages/technician/TechnicianTicketCards.jsx
- src/pages/technician/TechnicianTicketDetailsPage.jsx
- src/pages/technician/TechnicianWorkloadPage.jsx
- src/pages/technician/TicketInternalNotes.jsx
- src/pages/technician/TicketPriorityControl.jsx
- src/pages/technician/TicketResolveControl.jsx
- src/pages/technician/TicketSlaTimers.jsx
- src/pages/technician/TicketStatusActions.jsx
- src/pages/technician/UnassignedTicketsPage.jsx
- src/routes/RoleHomeRedirect.jsx
- src/routes/SessionLoading.jsx
- tests/profile.smoke.mjs
