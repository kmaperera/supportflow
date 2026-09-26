import api from './axios'
import { API_ENDPOINTS } from './endpoints'

const base = `${API_ENDPOINTS.TICKETS}/admin/categories`
const path = id => `${base}/${encodeURIComponent(id)}`
function valid(category) { return category?.id && typeof category.name === 'string' && typeof category.isActive === 'boolean' }
function categoryResponse(data) {
  if (data?.success !== true || !valid(data.data?.category)) throw new Error('Invalid category response')
  return data.data.category
}
export async function getCategories({ signal } = {}) {
  const { data } = await api.get(base, { signal })
  if (data?.success !== true || !Array.isArray(data.data?.categories) || !data.data.categories.every(valid)) throw new Error('Invalid category list')
  return data.data.categories
}
export async function getCategory(id, { signal } = {}) { return categoryResponse((await api.get(path(id), { signal })).data) }
export function categoryPayload({ name, description }) { return { name: name.trim(), description: description.trim() || null } }
export async function createCategory(values) { return categoryResponse((await api.post(base, categoryPayload(values))).data) }
export async function updateCategory(id, values) { return categoryResponse((await api.patch(path(id), categoryPayload(values))).data) }
export async function updateCategoryStatus(id, isActive) { return categoryResponse((await api.patch(`${path(id)}/status`, { isActive })).data) }
