import api from './axios'
import { API_ENDPOINTS } from './endpoints'

function sessionData(data) {
  if (data?.success !== true || !data.data?.user || typeof data.data.user !== 'object' || Array.isArray(data.data.user) ||
      typeof data.data.accessToken !== 'string' || !data.data.accessToken || /\s/.test(data.data.accessToken)) {
    throw new Error('Invalid authentication response')
  }
  // The caller establishes the in-memory session; the refresh cookie stays HttpOnly.
  return data.data
}

export async function login({ email, password }) {
  const { data } = await api.post(`${API_ENDPOINTS.AUTH}/login`, { email, password })
  return sessionData(data)
}

let refreshRequest = null
export function refreshSession() {
  // Startup and automatic recovery share the same cookie rotation request.
  if (!refreshRequest) {
    refreshRequest = api.post(`${API_ENDPOINTS.AUTH}/refresh`)
      .then(({ data }) => sessionData(data))
      .finally(() => { refreshRequest = null })
  }
  return refreshRequest
}

export function getLoginErrorMessage(error) {
  if (error?.isAxiosError && !error.response) {
    return 'Unable to connect to the server. Please try again.'
  }
  const status = error?.response?.status
  const body = error?.response?.data
  if (status >= 400 && status < 500 && body?.success === false &&
      typeof body.message === 'string' && body.message.trim() && body.message.length <= 300) {
    return body.message
  }
  return 'Unable to sign in. Please try again.'
}
