import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './AuthContext'
import { ROLES } from './roles'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
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

  const establishSession = useCallback((authenticatedUser) => {
    if (!authenticatedUser || typeof authenticatedUser !== 'object' || Array.isArray(authenticatedUser)) {
      throw new TypeError('establishSession requires an authenticated user object')
    }
    setUser(authenticatedUser)
    setAuthError(null)
    setInitializing(false)
  }, [])

  const clearSession = useCallback(() => {
    setUser(null)
    setAuthError(null)
    setInitializing(false)
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])
  const hasRole = useCallback((role) => Object.values(ROLES).includes(role) && user?.role === role, [user])

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isInitializing,
    authError,
    establishSession,
    clearSession,
    setAuthError,
    clearAuthError,
    setInitializing,
    hasRole,
  }), [user, isInitializing, authError, establishSession, clearSession, clearAuthError, hasRole])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
