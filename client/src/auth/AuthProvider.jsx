import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './AuthContext'
import { ROLES } from './roles'
import { setAccessToken, clearAccessToken } from './accessToken'

export function AuthProvider({ children }) {
  const [{ user, accessToken }, setSession] = useState({ user: null, accessToken: null })
  const [isInitializing, setInitializing] = useState(true)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    // Phase 13.1 only: complete the initial state without restoring a session.
    // Phase 13.5 replaces this isolated step with backend session restoration.
    let active = true
    queueMicrotask(() => {
      if (active) setInitializing(false)
    })
    return () => { active = false }
  }, [])

  const establishSession = useCallback((authenticatedUser, token) => {
    if (!authenticatedUser || typeof authenticatedUser !== 'object' || Array.isArray(authenticatedUser)) {
      throw new TypeError('establishSession requires an authenticated user object')
    }
    setAccessToken(token)
    setSession({ user: authenticatedUser, accessToken: token })
    setAuthError(null)
    setInitializing(false)
  }, [])

  const clearSession = useCallback(() => {
    clearAccessToken()
    setSession({ user: null, accessToken: null })
    setAuthError(null)
    setInitializing(false)
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])
  const hasRole = useCallback((role) => Object.values(ROLES).includes(role) && user?.role === role, [user])

  const value = useMemo(() => ({
    user,
    accessToken,
    isAuthenticated: Boolean(user),
    isInitializing,
    authError,
    establishSession,
    clearSession,
    setAuthError,
    clearAuthError,
    setInitializing,
    hasRole,
  }), [user, accessToken, isInitializing, authError, establishSession, clearSession, clearAuthError, hasRole])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
