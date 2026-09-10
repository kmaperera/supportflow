import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function login({ email, password }) {
  const { data } = await api.post(`${API_ENDPOINTS.AUTH}/login`, { email, password })
  if (data?.success !== true || !data.data?.user || typeof data.data.user !== 'object' || Array.isArray(data.data.user)) {
    throw new Error('Invalid login response')
  }
  // Phase 13.4 handoff: accessToken is returned here but is not retained,
  // persisted, or applied to Axios by this phase. The refresh cookie is HttpOnly.
  return data.data
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
