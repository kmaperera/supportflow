# Access-token handling (Phase 13.4)

AuthProvider owns one React session object containing user and accessToken.
establishSession(user, accessToken) validates the token, updates the narrow
accessToken.js bridge synchronously, then updates React session state. The exact
backend user object is preserved, including mustChangePassword. clearSession()
clears both stores and makes no backend call. Components must use these semantic
actions rather than write the bridge directly.

The existing Axios instance reads the bridge in a request interceptor. It sets
Authorization: Bearer <token> when present and deletes any stale Authorization
header when absent. No token is assigned to Axios defaults. The bridge uses no
React hooks and stores no refresh credentials. Login now consumes both data.user
and data.accessToken through establishSession.

Tokens live only in JavaScript memory, not storage, cookies, URLs, or UI. Reloading
the page intentionally loses the session at this phase. Phase 13.5 will restore it
through the backend HttpOnly refresh cookie. withCredentials remains enabled.
No refresh calls, response interception/retries, redirects, or route enforcement
are added. The 13.1/13.3 notes describe their earlier phase behavior; this phase
supersedes the deferred access-token handoff.

Run the mocked bridge/request smoke with node tests/accessToken.smoke.mjs. It uses
Vite's existing module loader, no new test dependency or live credentials/network.
