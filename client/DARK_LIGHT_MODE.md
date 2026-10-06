# SupportFlow Light/Dark Mode

## Current behavior

The only supported preferences are `light` and `dark`. Missing, invalid and legacy `system` preferences fall back to Light. Only the preference is persisted under `supportflow-theme`; unavailable storage does not prevent in-memory switching. Storage events synchronize tabs, including preference deletion. There is no OS preference lookup or media-query listener.

`ThemeProvider` is mounted once near the root. `useTheme()` exposes `theme` and `setTheme`. The head script `public/theme-init.js` applies saved Dark before React renders, preserving startup flash prevention. The provider maintains the root dark class and native color-scheme.

## Header toggle

`ThemeToggle` is the sole user-facing theme control. It appears in the shared Employee/Technician/Admin header beside user information, the standalone Profile header, and the forced-password screen header. The Profile Appearance section and its component have been removed.

The control is a compact 80 by 44 px rounded pill with a subtle border, soft surface, shadow and a sliding thumb. Inline SVG sun/moon icons replace any need for an icon dependency. The current side is emphasized. A native button switches immediately to the other mode, with a destination-specific accessible label/title, visible focus outline and pointer cursor. The 200 ms transform transition respects reduced-motion preferences. There is no popup, dropdown, monitor icon or theme toast.

## Preserved presentation

Existing dark variants remain on role layouts, forms, cards, tables, badges, skeletons, loading/empty/error states, dialogs, toasts, ticket/KB content, notifications, reports and audit logs. Recharts already uses CSS variables controlled by the root dark class; no resolved-theme dependency or chart-data change was necessary. No backend, API, auth behavior, workflow or navigation redesign changes.

## Verification

- Build and lint pass; existing bundle-size warning remains.
- Startup smoke checks cover saved modes, missing/invalid/legacy preferences, blocked storage, and independence from device appearance.
- Profile checks verify no Appearance section and a header toggle.
- Headless Edge checks pass single-click switching, destination labels, persistence, startup, cross-tab sync, legacy fallback, blocked storage, no OS access and no header overflow at 320/375/768/1440 px in both themes.
- Browser checks use the shared header fixture rather than a live authenticated backend session.

## Simplification file inventory

Updated: `src/theme/ThemeProvider.jsx`, `src/theme/theme.js`, `src/theme/ThemeToggle.jsx`, `src/theme/ThemeIcon.jsx`, `public/theme-init.js`, `src/pages/auth/ProfilePage.jsx`, `src/pages/auth/ChangePasswordPage.jsx`, `tests/theme.smoke.mjs`, `tests/theme.browser.html`, `tests/profile.smoke.mjs`, and this document.

Deleted: `src/theme/AppearanceSettings.jsx`.

The existing `src/layouts/WorkspaceHeader.jsx` integration and `src/theme/ThemeContext.js` hook are reused without changes.
