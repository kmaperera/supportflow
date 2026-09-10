export const API_ENDPOINTS = {
  AUTH: '/auth',
  USERS: '/users',
  TICKETS: '/tickets',
  CATEGORIES: '/categories',
  PRIORITIES: '/priorities',
  SLA_POLICIES: '/sla-policies',
  NOTIFICATIONS: '/notifications',
  KNOWLEDGE_BASE: '/knowledge-base',
  DASHBOARD: '/dashboard',
  REPORTS: '/reports',
  HEALTH: '/health',
}

// Relative to VITE_API_BASE_URL, which already includes /api/v1.
export const AUTH_ENDPOINTS = {
  LOGIN: `${API_ENDPOINTS.AUTH}/login`,
  REFRESH: `${API_ENDPOINTS.AUTH}/refresh`,
  CHANGE_PASSWORD: `${API_ENDPOINTS.AUTH}/change-password`,
  LOGOUT: `${API_ENDPOINTS.AUTH}/logout`,
  LOGOUT_ALL: `${API_ENDPOINTS.AUTH}/logout-all`,
  CURRENT_USER: `${API_ENDPOINTS.AUTH}/me`,
}
