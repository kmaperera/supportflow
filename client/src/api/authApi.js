import { getApiErrorMessage } from './apiError'
import api from './axios'
import { AUTH_ENDPOINTS } from './endpoints'

function sessionData(data) {
  if (data?.success !== true || !data.data?.user || typeof data.data.user !== 'object' || Array.isArray(data.data.user) ||
      typeof data.data.accessToken !== 'string' || !data.data.accessToken || /\s/.test(data.data.accessToken)) {
    throw new Error('Invalid authentication response')
  }
  // The caller establishes the in-memory session; the refresh cookie stays HttpOnly.
  return data.data
}

export async function login({ email, password }) {
  const { data } = await api.post(AUTH_ENDPOINTS.LOGIN, { email, password })
  return sessionData(data)
}

let refreshRequest = null
export async function logout() {
  // Let an existing rotation settle before revoking its resulting cookie.
  if (refreshRequest) await refreshRequest.catch(() => {})
  const { data } = await api.post(AUTH_ENDPOINTS.LOGOUT)
  if (data?.success !== true) throw new Error('Invalid logout response')
}

export async function logoutAllSessions() {
  // Use the latest cookie if a rotation was already underway.
  if (refreshRequest) await refreshRequest.catch(() => {})
  const { data } = await api.post(AUTH_ENDPOINTS.LOGOUT_ALL)
  if (data?.success !== true) throw new Error('Invalid logout-all response')
}

export function refreshSession() {
  // Startup and automatic recovery share the same cookie rotation request.
  if (!refreshRequest) {
    refreshRequest = api.post(AUTH_ENDPOINTS.REFRESH)
      .then(({ data }) => sessionData(data))
      .finally(() => { refreshRequest = null })
  }
  return refreshRequest
}

export function getLoginErrorMessage(error) {
  return getApiErrorMessage(error, 'Unable to sign in. Please try again.')
}

export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  const { data } = await api.patch(AUTH_ENDPOINTS.CHANGE_PASSWORD, { currentPassword, newPassword, confirmPassword })
  if (data?.success !== true) throw new Error('Invalid password-change response')
  return data
}

export function getPasswordChangeErrorMessage(error) {
  return getApiErrorMessage(error, 'Unable to change your password. Please try again.')
}
