# Role routes (Phase 13.8)

ProtectedRoute remains the authentication guard. Nested RoleRoute checks the
backend user's role against an explicit ROLES value. /employee, /technician and
/admin use the existing minimal dashboard placeholders. Their /dashboard paths
remain available with the same role restrictions. No real dashboards are added.

roleHome.js is the single role-to-home mapping. Root redirects logged-out visitors
to /login and authenticated users to their home. LoginRoute keeps /login public
while logged out and redirects after login or restored authentication. Wrong-role
visits return to the user's own home, never to another role area. Unknown roles
render Access unavailable rather than defaulting to a role or looping. Unknown
URLs retain the existing 404. No /app alias is introduced.

Root/login guards and ProtectedRoute wait for initialization before redirecting;
valid restored role pages render in place. The existing state.from is preserved by
ProtectedRoute but not used for redirect-back yet. mustChangePassword is retained
but not enforced in this phase. Backend role middleware is still the security
boundary. Token/refresh behavior, logout and backend code are unchanged.
