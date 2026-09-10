# Startup session restoration (Phase 13.5)

AuthProvider initially has isInitializing=true and starts POST /auth/refresh with
no body through the existing credentialed Axios instance. Backend responds with
{success, message, data: {accessToken, user}} and rotates the refreshToken HttpOnly
cookie (SameSite=Lax, /api/v1/auth path, Secure in production). No /auth/me request
is needed. No cookie is read or supplied manually by frontend code.

The provider keeps a single startup promise in a ref. React StrictMode's effect
cleanup/replay subscribes again to that promise rather than issuing a second
rotation. Cleanup prevents state writes after unmount. A session revision guard
prevents stale startup success/failure from replacing a newer established/cleared
session. This is startup-only, not a request retry/concurrency queue.

Success uses establishSession(user, accessToken), preserving the backend profile,
role and mustChangePassword while updating the existing memory bridge. 401 (no,
expired, invalid or revoked session) and 403 (inactive account) clear state quietly.
Unexpected/network failures clear state and set a generic restoration error.
Initialization ends through session actions/finally. Login inputs/submission wait
until startup completes to avoid overlapping login and refresh cookie changes.

Access tokens and user state remain memory-only; reload now restores them using the
backend cookie if valid. No token persistence, logout calls, refresh-on-401,
response interceptor, retry, route enforcement or redirect is added.

Verification: node tests/refreshSession.smoke.mjs checks the mocked API contract;
node tests/accessToken.smoke.mjs checks existing session actions/bridge/headers.
These checks send no real backend requests. StrictMode behavior is implemented via
one per-provider promise plus per-effect cleanup, not by disabling StrictMode.
