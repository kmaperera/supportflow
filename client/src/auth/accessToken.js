// Narrow in-memory bridge for non-React API code. Session actions own writes.
let accessToken = null

export function setAccessToken(token) {
  if (typeof token !== 'string' || !token || /\s/.test(token)) {
    throw new TypeError('A nonempty access token without whitespace is required')
  }
  accessToken = token
}

export function getAccessToken() { return accessToken }
export function clearAccessToken() { accessToken = null }
