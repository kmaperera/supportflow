# Axios refresh recovery (Phase 13.6)

The single existing Axios client installs one response interceptor at module load.
Eligible 401s require an in-memory token and a registered AuthProvider. Requests
without a session pass through. Login, refresh, logout and logout-all are excluded
by normalized endpoint paths. Other statuses (especially 403) pass through unchanged.
Each original config receives _authRetry and is retried at most once using
api.request(config), preserving method/body/params/headers. The request interceptor
replaces Authorization with the current token. No JWT timers or navigation occur.

One recovery promise coordinates concurrent failures. refreshSession itself shares
one HTTP rotation promise with startup restoration; locks reset in finally. Late
401s sent with an older token can retry using the token already refreshed. Refresh
errors reject all waiters and invoke clearSession, clearing user/token together.
A newer login or provider lifecycle change is not overwritten by stale recovery.

AuthProvider registers establishSession/clearSession callbacks with sessionBridge
and unregisters on cleanup. Axios never calls hooks. StrictMode does not stack
interceptors or callback handlers. Refresh uses the existing response normalization,
retaining role/mustChangePassword and the browser-managed HttpOnly cookie. Tokens
remain memory-only. No protected routes or role/password redirects added.

Mocked regression: node tests/refreshInterceptor.smoke.mjs. Also run the existing
refreshSession and accessToken smoke scripts. No real credentials or network calls
are used by these tests.
