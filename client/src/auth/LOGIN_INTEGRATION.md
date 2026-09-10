# Login integration (Phase 13.3)

POST /api/v1/auth/login accepts email/password and returns
{ success, message, data: { accessToken, user } }. authApi.js uses the existing
Axios base URL and withCredentials configuration. Only email/password are sent.
The HttpOnly refresh cookie is handled by the browser, never read by this code.

LoginPage validates locally, trims email (not password), clears prior auth errors,
and disables the form during submission. A synchronous ref guard prevents duplicate
requests before React renders the disabled state. Success calls establishSession
with the exact returned user, preserving mustChangePassword and other profile fields,
clears the password, and displays a neutral confirmation without navigation.
Expected 4xx JSON messages are displayed as text; network and server failures receive
generic messages. No credentials or tokens are logged.

The API wrapper returns data.accessToken as an isolated Phase 13.4 handoff. This phase
intentionally does not retain it or configure Authorization headers. Consequently,
authenticated API calls/session restoration are not implemented yet. No token/user
persistence, refresh call, interceptor, route enforcement, or role/password redirect
is included. The Login form stores no duplicate backend profile state.
