# Phase 20.6 — Vercel frontend readiness

No deployment performed. Create/select a separate frontend project with root `client/`, Framework Preset Vite, install `npm ci`, build `npm run build`, and output `dist`. Use Node satisfying the declared >=22.12.0 engine and installed Vite requirements. `npm run dev` remains unchanged. The backend remains a separate Node project; do not use its Vercel configuration for the frontend.

## Public build configuration

Set only `VITE_API_BASE_URL` to the actual backend HTTPS origin followed by `/api/v1`, without a trailing slash. Do not copy a sample hostname into production. This value is public, embedded at build time; rebuild when it changes. No production hostname is hardcoded or inferred from the frontend hostname. The local `.env.example` deliberately retains localhost for development. Existing local env files are not changed by this preparation.

Axios uses that base with `withCredentials:true`; startup refresh, login, logout, and recovery calls use the same client. Access tokens remain in memory. AuthProvider waits for its single-flight startup refresh before protected-route decisions, and stale restoration cannot overwrite logout. Backend/frontend origin and HttpOnly cookie SameSite/Secure policies still need coordinated configuration; Vercel hosting alone does not prove credentialed refresh works across the chosen domains.

Notifications derive the Socket.IO backend origin from the API base (without `/api/v1`) and use `/socket.io/`. Production builds force WebSocket transport with reconnection; reconnect/refocus fetches authoritative REST notifications. No VITE_SOCKET_URL is necessary. Cross-instance realtime is still best effort as described in [backend notes](VERCEL_BACKEND.md).

Do not provide DB/JWT/SMTP/Cloudinary secrets or INITIAL_ADMIN credentials through VITE variables or the client build environment. Source env usage is restricted to public VITE_API_BASE_URL and Vite's built-in PROD flag. Production source maps are not enabled. Build tools run with dev dependencies available; static deployment needs no Node server runtime.

## Direct URL and SPA handling

BrowserRouter requires index.html for frontend paths. `client/vercel.json` first serves existing files, then falls back to index.html for frontend paths including `/login`, `/forgot-password`, `/reset-password`, `/change-password`, `/employee/*`, `/technician/*`, `/admin/*`, and unknown frontend paths handled by React Router.

The fallback explicitly excludes `/api` and `/socket.io` paths. No frontend API proxy/rewrite is configured: API and sockets go directly to the environment-configured backend. Requests accidentally made to those paths on the static frontend should fail instead of receiving HTML. Existing hashed assets are served through the filesystem routing phase.

Reset token query parameters remain available to the reset-password page; SPA routing must not discard them. Missing/invalid tokens use the existing safe error UI. Protected direct URLs pass through existing role/session/forced-change guards. The backend CLIENT_URL controls reset-email links and exact credentialed CORS origins; set it to the final frontend origin in the appropriate backend configuration phase. Keep token query strings out of deployment logs and analytics.

See [Vercel Vite deep linking](https://vercel.com/docs/frameworks/frontend/vite) and [Vercel routing configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Verification limits and release checklist

Preparation results: production build and lint passed; all 61 existing frontend smoke scripts passed. Local preview and dev services served all requested deep links, including reset-password with a harmless query parameter. Static routing checks confirmed API/socket exclusions. Known backend secret values were absent from built text assets and no source maps were emitted. The local API setting remains development HTTP; the actual HTTPS Vercel backend URL must be supplied in the deployment build environment. No env values were changed.

Run build, lint, and existing frontend smoke scripts locally. Configuration checks verify that frontend route prefixes match the fallback while API/socket prefixes do not. The deployed Vercel router itself cannot be confirmed until a later deployment: refresh each role path, login/recovery/reset URL, and verify actual assets/API content types.

Before deploying, set VITE_API_BASE_URL in the Vercel production environment to the real backend and rebuild. A local build using the development env does not prove production URLs. Then verify session restoration/refresh cookies, login/logout, forced password change, reset links, production WebSocket connection/reconnect, final backend CORS/cookie domains, and failed API requests. No production API authentication or email delivery is performed during these static frontend checks. Phase 20.7 has not begun.
