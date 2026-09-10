# Forced password-change routing (Phase 13.9)

/change-password is inside ProtectedRoute and ChangePasswordRoute. Known-role
users with the exact backend boolean mustChangePassword=true see a minimal
placeholder. Logged-out visitors go to /login; initialization waits. Users without
the flag return to their normal role home. Unknown roles retain Access unavailable.

RoleHomeRedirect is the shared destination for root, authenticated /login, and
wrong-role visits. It now prioritizes /change-password for known roles with the
flag. RoleRoute also blocks flagged users from rendering any role-area outlet,
including the existing /dashboard aliases. This applies after startup restoration
and later user-state updates, not just after login. No redirect-back is added.

The user object/flag is never mutated by routing. No password form, API call, skip
control, logout, token or interceptor change is included. The placeholder has no
role-area links. Backend security remains authoritative; Phase 13.10 implements
the actual password-change form and API behavior.
