# Change password (Phase 13.10)

The protected forced-only /change-password route now renders the real form.
PATCH /api/v1/auth/change-password requires currentPassword, newPassword and
confirmPassword. Backend requires 8+ characters, uppercase, lowercase and a digit,
matching confirmation, and a password different from the current password.
Client validation mirrors those rules without trimming password values. Fields,
visibility, submitting/error state stay local. A synchronous pending guard prevents
duplicate requests; inline errors focus the first invalid field.

The existing Axios client attaches the in-memory token and handles eligible 401
recovery. No separate refresh logic is added. Expected 4xx messages are displayed
as text; network/5xx failures use generic messages and do not independently clear
the session. Password values and credentials are never logged or persisted.

Backend success returns success/message only, revokes all refresh tokens and
clears the refresh cookie. It issues no replacement session. Therefore success
clears local password fields, calls clearSession and replaces navigation to /login.
A passwordChanged boolean in router state selects a fixed confirmation message;
LoginPage consumes the state marker and clears the local message on submission.
No passwords, tokens or arbitrary server messages enter navigation state.

The backend is solely responsible for clearing mustChangePassword. This page does
not forge the flag or grant access. No skip controls, voluntary profile settings,
explicit logout or logout-all UI/API calls are added.
