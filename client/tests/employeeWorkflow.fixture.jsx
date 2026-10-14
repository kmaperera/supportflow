// Actual Employee pages, auth, routes and state; HTTP backend is disposable.
/* oxlint-disable react/only-export-components */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from '../src/App'
import ThemeProvider from '../src/theme/ThemeProvider'
import ToastProvider from '../src/components/ToastProvider'
import { AuthProvider } from '../src/auth/AuthProvider'
import api from '../src/api/axios'
import { getAccessToken, setAccessToken } from '../src/auth/accessToken'
import '../src/index.css'

window.employeeFixture = { realm: crypto.randomUUID(), requests: [], failures: [], delay: 0,
  expireAccess: token => setAccessToken(token), hasToken: () => Boolean(getAccessToken()) }
const adapter = api.getAdapter ? api.getAdapter(api.defaults.adapter) : null
// Test-only controlled failure/delay, retaining the native HTTP adapter.
import axios from 'axios'
const nativeAdapter = adapter || axios.getAdapter(api.defaults.adapter)
api.defaults.adapter = async config => {
  window.employeeFixture.requests.push({ method: config.method, url: config.url })
  if (window.employeeFixture.delay) await new Promise(resolve => setTimeout(resolve, window.employeeFixture.delay))
  const index = window.employeeFixture.failures.findIndex(item => item.url === config.url && item.method === config.method)
  if (index >= 0) { window.employeeFixture.failures.splice(index, 1); throw { config, response: { status: 500, data: { success: false, message: 'Internal server error', errors: [] } } } }
  return nativeAdapter(config)
}
createRoot(document.getElementById('root')).render(<StrictMode><ThemeProvider><HashRouter><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></HashRouter></ThemeProvider></StrictMode>)
