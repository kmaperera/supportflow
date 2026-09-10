# Protected routes (Phase 13.7)

The existing ProtectedRoute layout in AppRoutes now reads isInitializing and
isAuthenticated from useAuth. It waits with a simple accessible Checking session
status, then renders Outlet for authenticated users or Navigate to /login with
replace and state.from containing the attempted router location (path/query/hash).
It never reads storage or tokens, makes no API calls, and adds no redirects after
login. Startup restoration remains responsible for resolving initialization.

Existing protected placeholders: /employee/dashboard, /technician/dashboard,
/admin/dashboard. /login and the not-found route remain public. The RoleRoute
placeholder is unchanged: any authenticated user can enter any dashboard at this
phase. Role policy is Phase 13.8, mustChangePassword enforcement is Phase 13.9.
This is UI navigation protection; backend authorization remains authoritative.
