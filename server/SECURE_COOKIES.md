# Phase 18.7 — Secure cookie review

## Outcome and inventory

The existing production cookie implementation already meets the current same-site architecture's requirements. **No production cookie, authentication, frontend or deployment configuration was changed.** This phase adds regression tests and documents decisions/limits rather than changing correct behavior.

Only one application cookie was found: `refreshToken`, used to restore/rotate authenticated sessions. Login and refresh set it; refresh, logout and logout-all read it through `req.cookies`; logout, logout-all and successful password change clear it. `cookie-parser` is mounted before those routes. There is no access-token cookie, session middleware cookie, cookie-based theme setting or client `document.cookie` access in production source.

## Options: before and after (unchanged)

| Property | Value and reason |
| --- | --- |
| HttpOnly | true; browser JavaScript cannot read the refresh credential |
| Secure | true only when `NODE_ENV=production`; local development/test HTTP remains usable |
| SameSite | Lax; current localhost origins differ by port but are same-site |
| Path | `/api/v1/auth`, covering every cookie consumer and deletion route |
| Domain | omitted; host-only rather than shared with all subdomains |
| Expiry | `expires` from the issued refresh JWT's `exp`; no conflicting maxAge |
| Name | `refreshToken`, preserved to avoid an unnecessary migration |

`getRefreshTokenCookieOptions()` reuses `getClearRefreshTokenCookieOptions()` and adds only expiry. Clear options contain no expires/maxAge; Express sends an expired cookie with the same path, SameSite, Secure and HttpOnly attributes. No new helper is needed because this is already centralized in `src/utils/authCookie.js`.

Login derives expiry from the issued token; rotation returns the replacement token's expiry. The refresh-token repository stores that same expiry. Existing `JWT_REFRESH_EXPIRES_IN` remains authoritative (the example is 7 days); no lifetime was invented. Tests compare real JWT expiry, stored fixture expiry and actual Set-Cookie expiry to the second.

`__Host-` would require Path=/, conflicting with the narrower auth path. No prefix change was justified. Cookie Path reduces transmission but is not a security boundary against same-origin scripts.

## Lifecycle and failure decisions

- Successful login/refresh returns an access token and user in JSON; raw refresh credentials appear only in Set-Cookie.
- Rotation/revocation logic is unchanged. Logout clears even when the refresh token has no active stored record. Logout-all validates the current token, revokes the user's sessions, and clears the current browser cookie on success.
- Invalid/expired refresh responses do not automatically clear cookies. A stale concurrent request can finish after a successful rotation; unconditional clearing could delete the valid replacement. This preserves existing behavior. A stale cookie grants no access, expires normally and can be cleared through ordinary logout. Logout-all validation failures likewise preserve current behavior; ordinary logout handles stale credentials.
- Transient server/revocation failures are not silently reported as successful logout. No new cleanup-on-error policy or token/session redesign was added.
- Failed password, unknown account, inactive account, malformed login and login-quota 429 responses issue no session cookie.

## Frontend, logging and CSRF

Shared Axios has `withCredentials: true` for login, refresh, logout and normal API calls. Refresh posts without a raw token body/header; the browser supplies the cookie. No direct frontend fetch bypass was found in production source. Access tokens remain in the React session and the in-memory `accessToken.js` bridge; only the harmless theme preference is persisted to localStorage. No production auth use of sessionStorage or JavaScript cookie reads was found.

Morgan's existing dev/combined formats do not include Cookie, Set-Cookie, Authorization or request bodies. Auth/JWT code has no raw-token/cookie logging. Error responses do not serialize request cookies or token values. No broad logging redesign was performed.

SameSite=Lax was intentionally retained: auth mutations use POST, so ordinary cross-site cookie-bearing POST requests are restricted while normal same-site credentialed calls work. Different localhost ports are different origins, not different sites. HTTPS `app.example.com` and `api.example.com` are also ordinarily same-site, and the cookie can remain host-only on the API. No actual production domain configuration is present; **same-site HTTPS production is an explicit assumption**, not a verified deployment fact.

Lax is defense in depth, not complete CSRF protection. Same-site untrusted sibling origins are not excluded by SameSite. Login CSRF also needs separate consideration because login can create a cookie without receiving an existing one; existing form-body parsing and absence of an Origin/CSRF check remain relevant. CORS alone does not prevent every form submission. HttpOnly prevents token reads, not malicious script actions as the user. These remaining concerns are recorded for deployment/CORS/session review; no blanket cross-site support or CSRF library was added without a confirmed topology.

If production frontend/API are genuinely cross-site, current Lax refresh requests will not work as intended. That deployment would require an explicit design for SameSite=None **with Secure**, browser third-party-cookie restrictions and CSRF defenses. Do not change Lax merely because ports differ. See [MDN's cookie attribute reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Production requires HTTPS and `NODE_ENV=production`. Do not disable Secure to accommodate a misconfigured deployment. Proxy/CORS settings and token lifetimes were not changed in this phase.

## Verification

- `tests/authCookie.test.js` uses the real app, auth controllers, validation, password comparison, JWT generation, rotation/revocation and cookie serializer, with only persistence replaced by isolated memory records. No real passwords, signing secrets or tokens are committed; fixture signing secrets are generated at runtime.
- HTTP tests passed for development and production: successful cookie issuance, HttpOnly/Secure/Lax/path/domain, JWT/cookie/database-fixture expiry alignment, bearer-authenticated call, rotation, stale-token failure, logout, stale-cookie logout, logout-all invalidating both sessions, and every failed-login category including 429 issuing no cookie. Secure production behavior is checked on response headers, not misrepresented as a production HTTPS browser deployment test.
- `node tests/authCookie.cdp.mjs` passed in an isolated headless Edge profile using a tiny frontend document on localhost:5197 and the real app with fixture persistence on localhost:5097. Browser inspection confirmed HttpOnly, Lax, development Secure=false, host/path/expiry; `document.cookie` did not expose refreshToken even on a matching host/path. Requests outside the auth path did not receive it. Cross-port credentialed login, page reload losing the memory token, refresh rotation, authenticated API access, logout/logout-all deletion and subsequent refresh 401 all passed. The test uses a minimal browser harness, not a complete React UI walkthrough; localhost ports differ from the usual 5173/5000 but exercise the same site relationship.
- Existing frontend `refreshSession.smoke.mjs` and `refreshInterceptor.smoke.mjs` passed, covering credentials, normal contracts and automatic 401 refresh/retry behavior.
- Full backend `node --test tests/*.test.js`: **332 passed, 1 skipped, 0 failed** (333 tests).
- Normal `npm start` on temporary port 5098 connected to MySQL and reached listening state. No live user sessions or production cookies were mutated.
- No backend lint/build script exists. Client code/config did not change, so frontend build/lint was not rerun.

Browser rerun: launch an isolated Chromium/Edge debugging instance on port 9223 (override with `COOKIE_CDP_PORT`), then run `node tests/authCookie.cdp.mjs` from server/. It starts/closes local fixture servers on ports 5097/5197 and its own browser tab; use an isolated profile because it clears that profile's cookies.

Files added: `server/tests/authCookie.test.js`, `server/tests/authCookie.cdp.mjs`, `server/tests/helpers/cookieApp.js`, and this document. No cookie options, CORS, JWT/session algorithms/rotation, uploads, audit tables, Remember Me feature or new dependencies were changed.
