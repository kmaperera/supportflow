# Authentication state foundation (Phase 13.1)

AuthProvider in src/auth/AuthProvider.jsx wraps App inside the existing BrowserRouter
in main.jsx. useAuth throws outside the provider. No routing policy is added.

State: user=null, isInitializing=true, authError=null; isAuthenticated derives from
Boolean(user). The initial effect schedules initialization completion in a microtask
with unmount/StrictMode cleanup. It performs no backend request. Phase 13.5 should
replace this isolated effect with session restoration and complete initialization
when that work finishes.

establishSession(user) stores the supplied backend user object intact, preserving
role and mustChangePassword, clears errors and completes initialization.
clearSession() clears user/error state and completes initialization without making
logout calls. setAuthError/clearAuthError and setInitializing support later flows.
hasRole accepts known ROLES values and compares the current user's role. It is a
UI helper, not route enforcement or a substitute for backend authorization.

No access/refresh tokens, browser persistence, auth API requests, interceptors,
redirects, login form changes or new route enforcement are included. Existing Axios
configuration (withCredentials and VITE_API_BASE_URL) and placeholder pages remain.
