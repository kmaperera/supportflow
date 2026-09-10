import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext } from './AuthContext'
import { logout, logoutAllSessions, refreshSession } from '../api/authApi'
import { registerSessionHandlers } from './sessionBridge'
import { ROLES } from './roles'
import { setAccessToken, clearAccessToken } from './accessToken'

export function AuthProvider({ children }) {
  const [{ user, accessToken }, setSession] = useState({ user: null, accessToken: null })
  const [isInitializing, setInitializing] = useState(true)
  const [authError, setAuthError] = useState(null)

  const startupRequest = useRef(null)
  const sessionRevision = useRef(0)
  const logoutRequest = useRef(null)
  const [isLoggingOut, setLoggingOut] = useState(false)
  const [isLoggingOutAll, setLoggingOutAll] = useState(false)

  const establishSession = useCallback((authenticatedUser, token) => {
    if (!authenticatedUser || typeof authenticatedUser !== 'object' || Array.isArray(authenticatedUser)) {
      throw new TypeError('establishSession requires an authenticated user object')
    }
    setAccessToken(token)
    sessionRevision.current += 1
    setSession({ user: authenticatedUser, accessToken: token })
    setAuthError(null)
    setInitializing(false)
  }, [])

  const clearSession = useCallback(() => {
    sessionRevision.current += 1
    clearAccessToken()
    setSession({ user: null, accessToken: null })
    setAuthError(null)
    setInitializing(false)
  }, [])

  const logoutUser = useCallback(() => {
    if (logoutRequest.current) return logoutRequest.current
    // Invalidate startup restoration and interceptor recovery immediately.
    clearSession()
    setLoggingOut(true)
    logoutRequest.current = logout().catch(() => {
      setAuthError('Signed out locally. Server sign-out could not be confirmed.')
    }).finally(() => {
      logoutRequest.current = null
      setLoggingOut(false)
    })
    return logoutRequest.current
  }, [clearSession])

  const logoutAllUserSessions = useCallback(() => {
    if (logoutRequest.current) return logoutRequest.current
    setLoggingOutAll(true)
    logoutRequest.current = logoutAllSessions().then(() => {
      clearSession()
    }).finally(() => {
      logoutRequest.current = null
      setLoggingOutAll(false)
    })
    return logoutRequest.current
  }, [clearSession])

  useEffect(() => registerSessionHandlers({ establishSession, clearSession }), [establishSession, clearSession])

  useEffect(() => {
    let active = true
    const revision = sessionRevision.current
    // StrictMode replays effects on the same provider: subscribe to the same
    // promise instead of rotating its refresh cookie twice.
    if (!startupRequest.current) startupRequest.current = refreshSession()
    const isCurrent = () => active && sessionRevision.current === revision
    startupRequest.current.then(({ user: restoredUser, accessToken: token }) => {
      if (isCurrent()) establishSession(restoredUser, token)
    }).catch(error => {
      if (!isCurrent()) return
      clearSession()
      if (![401, 403].includes(error?.response?.status)) {
        setAuthError('Unable to restore your session. Please sign in again.')
      }
    }).finally(() => {
      if (isCurrent()) setInitializing(false)
    })
    return () => { active = false }
  }, [establishSession, clearSession])

  const clearAuthError = useCallback(() => setAuthError(null), [])
  const hasRole = useCallback((role) => Object.values(ROLES).includes(role) && user?.role === role, [user])

  const value = useMemo(() => ({
    user,
    accessToken,
    isAuthenticated: Boolean(user),
    isInitializing,
    isLoggingOut,
    isLoggingOutAll,
    logoutAllUserSessions,
    logoutUser,
    authError,
    establishSession,
    clearSession,
    setAuthError,
    clearAuthError,
    setInitializing,
    hasRole,
  }), [user, accessToken, isInitializing, isLoggingOut, isLoggingOutAll, logoutAllUserSessions, logoutUser, authError, establishSession, clearSession, clearAuthError, hasRole])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
