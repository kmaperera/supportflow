// Actual auth components/provider/interceptor; only the workspace is a fixture.
// This standalone test entry mounts its local probes rather than exporting them.
/* oxlint-disable react/only-export-components */
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../src/auth/AuthProvider'
import { useAuth } from '../src/auth/useAuth'
import { getAccessToken, setAccessToken } from '../src/auth/accessToken'
import api from '../src/api/axios'
import LoginRoute from '../src/routes/LoginRoute'
import ProtectedRoute from '../src/routes/ProtectedRoute'
import ChangePasswordRoute from '../src/routes/ChangePasswordRoute'
import LoginPage from '../src/pages/auth/LoginPage'
import ChangePasswordPage from '../src/pages/auth/ChangePasswordPage'
import SessionActions from '../src/auth/SessionActions'
import ToastProvider from '../src/components/ToastProvider'
import ThemeProvider from '../src/theme/ThemeProvider'
import '../src/index.css'

api.defaults.baseURL = 'http://localhost:5098/api/v1'
window.authFixture = {
  refreshCalls: 0, loginCalls: 0, initialMemoryToken: Boolean(getAccessToken()), hasToken: () => Boolean(getAccessToken()),
  concurrentRecovery: async token => {
    setAccessToken(token)
    const results = await Promise.allSettled([api.get('/auth/me'), api.get('/auth/me'), api.get('/auth/me')])
    return results.map(result => result.status === 'fulfilled' ? result.value.status : result.reason.response?.status)
  },
}
api.interceptors.request.use(config => {
  if (config.url === '/auth/refresh') window.authFixture.refreshCalls++
  if (config.url === '/auth/login') window.authFixture.loginCalls++
  return config
})
function Probe() {
  const auth = useAuth()
  useEffect(() => {
    window.authFixture.state = { initializing: auth.isInitializing, authenticated: auth.isAuthenticated, role: auth.user?.role ?? null }
  }, [auth.isInitializing, auth.isAuthenticated, auth.user])
  return null
}
function Workspace() { return <main><h1>Authentication workspace fixture</h1><SessionActions /></main> }
createRoot(document.getElementById('root')).render(<StrictMode><ThemeProvider><ToastProvider><HashRouter><AuthProvider><Probe /><Routes>
  <Route element={<LoginRoute />}><Route path="/login" element={<LoginPage />} /></Route>
  <Route element={<ProtectedRoute />}>
    <Route element={<ChangePasswordRoute />}><Route path="/change-password" element={<ChangePasswordPage />} /></Route>
    <Route path="/employee" element={<Workspace />} />
  </Route>
  <Route path="*" element={<LoginPage />} />
</Routes></AuthProvider></HashRouter></ToastProvider></ThemeProvider></StrictMode>)
