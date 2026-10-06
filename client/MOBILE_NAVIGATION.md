# Phase 17.16 — Mobile navigation

Frontend-only scope. No routes, authorization rules, API calls, backend code, or business workflows changed. Phase 17.17 visual polish is not included.

1. **Audit and files.** Previously, Employee/Technician expanded their menus into the page, Admin used an overlaid dropdown, and a separate mobile identity/header block consumed space. All three now use the same drawer structure. The full changed-file inventory is below.
2. **Shared components/config.** `WorkspaceShell` owns common layout structure, `MobileNavigation` owns the native modal drawer, `NavigationLinks` shares exact route ordering and active styling, and `NavigationIcon` supplies decorative inline SVG hamburger/close icons. Existing Employee/Technician/Admin navigation arrays are reused. Admin's existing prefix-match choices are now explicit `end: false` values in its array; route guards remain authoritative. No icon dependency was installed.
3. **Employee.** Dashboard, Create Ticket, My Tickets, Knowledge Base, Notifications, and Profile retain their existing order and paths. Logout remains a separate action.
4. **Technician.** Dashboard, My Assigned Tickets, Unassigned Queue, Notifications, Workload, and Profile retain their existing order and paths. No Admin destinations are added.
5. **Admin.** All 12 existing destinations remain in order. Branding/close stay at the top while one internal scroll area holds links, user details, and separated Logout. Long menus and names wrap without reducing touch targets. Existing Technician Workload deep links remain unchanged.
6. **Header/theme.** Below `lg`, one sticky compact header contains the menu button, SupportFlow text, and the existing Light/Dark toggle. Full user name and role appear inside the drawer. Desktop keeps the existing page-context title, user info, and theme toggle. Standalone Profile's shared header behavior is unchanged.
7. **Open/close.** The drawer enters from the left, is 85vw wide up to `max-w-xs`, and uses dynamic viewport height. It closes on link selection (including the current destination), route/location changes, backdrop click, Escape, its close button, Logout, or transition to desktop width. The existing logout action and navigation remain intact; its optional callback only dismisses the drawer.
8. **Focus/backdrop.** Opening focuses the close button. Tab and Shift+Tab wrap within the drawer; regular navigation links keep native semantics. Native `showModal()` makes the background inactive. Closing restores the menu trigger; navigation then preserves Phase 17.14 main-content focus, and resizing to desktop falls back to main when the trigger becomes hidden. Clicks inside the panel do not dismiss it. The native backdrop dims the remaining page.
9. **Breakpoints/responsiveness.** Existing Tailwind `lg` is preserved: drawer below 1024px, persistent 16rem sidebar at 1024px and above. JavaScript only watches that same breakpoint to close a modal that would otherwise become invisible. Main content uses the full mobile width and has no desktop sidebar offset. The sticky header remains in normal layout flow. No bottom navigation, swipe behavior, or custom breakpoint system was introduced.
10. **Scrolling/stacking.** `lockBodyScroll` gives native dialogs a shared, reference-counted lock for body/root overflow. It restores the original inline styles after the last modal closes, including unmount. `ConfirmDialog` uses the same lock to prevent accidental background unlocking during modal overlap. Normal content sits below the sticky header (`z-20`); the drawer/backdrop use the browser's modal top layer. A subsequently opened confirmation dialog becomes the sole interactive top modal, avoiding competing focus traps. Existing toasts remain at their current offset below the compact header; background toasts do not override a modal drawer.
11. **Light/Dark and motion.** Header, drawer, backdrop, border, user text, close button, active navigation, and Logout retain theme-aware colors. The 200ms horizontal entry animation is disabled by `prefers-reduced-motion`. Closing is immediate so focus and route changes are not delayed.
12. **Accessibility.** Menu controls have the exact Open/Close navigation menu labels, expanded state, and a real controls target. Each role uses the same labeled navigation in desktop/mobile, with `aria-current="page"` and the existing active background/ring/font treatment. Desktop navigation is `display:none` below `lg`; the closed native dialog and its links are excluded from the accessibility tree. SVG icons are decorative. Main/skip-link behavior is retained, links and menu controls have approximately 44px minimum targets, and Profile/Logout remain directly accessible.
13. **Desktop preservation.** Existing sidebar width, branding, link order, active treatment, header context, and role-specific Logout placement are preserved. Employee keeps Logout after its links; Technician keeps its bottom placement; Admin retains separately scrolling links and footer. Checks cover the 1024px boundary and the existing 1440px desktop keyboard/accessibility scenarios.
14. **Validation.** `npm run build` and `npm run lint` pass; the pre-existing >500 kB bundle warning remains. Six existing smoke suites pass: Employee layout, Technician layout, Profile, role routing, Logout, and theme persistence. The Technician test's menu-name expectation was updated and its obsolete Notifications placeholder assertion now checks the already-implemented route. The Phase 17.14 keyboard and Phase 17.15 accessibility-tree suites pass with selectors updated for modal navigation. New CDP tests cover all three roles at 320/375/430/768 in both themes (24 combinations), short-height drawers, rotation to 768×320, closing at 1024, body-scroll prevention/restoration, backdrop, route changes, focus trapping/restoration, role-specific destinations, Logout, nested confirmation dialogs, reduced motion, and unmount cleanup. Narrow Light-mode header and short Dark-mode Admin drawer screenshots were inspected. Testing used isolated Chromium viewport/keyboard/accessibility-tree tooling and local fixtures, not physical devices or screen-reader speech output.

## Reproduce

Start Vite at `http://127.0.0.1:5173` and an isolated Edge/Chromium instance with remote debugging port 9223. From `client/`, run the browser suites sequentially because they use foreground keyboard focus:

```sh
node tests/mobileNavigation.cdp.mjs
node tests/keyboard.cdp.mjs
node tests/accessibility.cdp.mjs
npm run build
npm run lint
```

`KEYBOARD_CDP_PORT` overrides the browser port. The new fixture renders real layouts against a local auth stub without API calls. Its screenshots are written to ignored `node_modules/.cache/mobile-navigation-shots/`.

## Changed files

- [MOBILE_NAVIGATION.md](MOBILE_NAVIGATION.md)
- [src/auth/LogoutButton.jsx](src/auth/LogoutButton.jsx)
- [src/components/ConfirmDialog.jsx](src/components/ConfirmDialog.jsx)
- [src/components/lockBodyScroll.js](src/components/lockBodyScroll.js)
- [src/index.css](src/index.css)
- [src/layouts/AdminLayout.jsx](src/layouts/AdminLayout.jsx)
- [src/layouts/EmployeeLayout.jsx](src/layouts/EmployeeLayout.jsx)
- [src/layouts/MobileNavigation.jsx](src/layouts/MobileNavigation.jsx)
- [src/layouts/NavigationIcon.jsx](src/layouts/NavigationIcon.jsx)
- [src/layouts/NavigationLinks.jsx](src/layouts/NavigationLinks.jsx)
- [src/layouts/TechnicianLayout.jsx](src/layouts/TechnicianLayout.jsx)
- [src/layouts/WorkspaceHeader.jsx](src/layouts/WorkspaceHeader.jsx)
- [src/layouts/WorkspaceShell.jsx](src/layouts/WorkspaceShell.jsx)
- [src/layouts/adminNavigation.js](src/layouts/adminNavigation.js)
- [src/layouts/useWorkspaceMenu.js](src/layouts/useWorkspaceMenu.js)
- [tests/accessibility.cdp.mjs](tests/accessibility.cdp.mjs)
- [tests/keyboard.cdp.mjs](tests/keyboard.cdp.mjs)
- [tests/mobileNavigation.browser.html](tests/mobileNavigation.browser.html)
- [tests/mobileNavigation.cdp.mjs](tests/mobileNavigation.cdp.mjs)
- [tests/mobileNavigation.fixture.jsx](tests/mobileNavigation.fixture.jsx)
- [tests/technicianLayout.smoke.mjs](tests/technicianLayout.smoke.mjs)
