import api from './axios'
import { API_ENDPOINTS } from './endpoints'

const base = API_ENDPOINTS.KNOWLEDGE_BASE
function result(data, key) {
  if (data?.success !== true || !data.data?.[key]) throw new Error('Invalid knowledge base response')
  return data.data[key]
}
export async function getKbCategories({ signal } = {}) {
  const categories = result((await api.get(`${base}/categories`, { signal })).data, 'categories')
  if (!Array.isArray(categories)) throw new Error('Invalid categories')
  return categories
}
export async function getAdminArticles({ page = 1, search = '', categoryId = '', signal } = {}) {
  const params = { page, limit: 10 }
  if (search.trim()) params.search = search.trim()
  if (categoryId) params.categoryId = categoryId
  const { data } = await api.get(`${base}/articles`, { params, signal })
  const articles = result(data, 'articles')
  if (!Array.isArray(articles) || !data.data.pagination) throw new Error('Invalid article list')
  return data.data
}
export async function getAdminArticle(id, { signal } = {}) {
  return result((await api.get(`${base}/articles/${encodeURIComponent(id)}`, { signal })).data, 'article')
}
export async function saveKbArticle(id, { title, content, categoryId }) {
  const payload = { title: title.trim(), content: content.trim(), categoryId: Number(categoryId) }
  const response = id ? await api.patch(`${base}/articles/${encodeURIComponent(id)}`, payload) : await api.post(`${base}/articles`, payload)
  return result(response.data, 'article')
}
export async function changeArticlePublication(id, action) {
  if (!['publish', 'unpublish', 'archive'].includes(action)) throw new Error('Invalid publication action')
  return result((await api.patch(`${base}/articles/${encodeURIComponent(id)}/${action}`)).data, 'article')
}
export async function saveKbCategory(id, { name, description }) {
  const payload = { name: name.trim(), description: description.trim() || null }
  const response = id ? await api.patch(`${base}/categories/${encodeURIComponent(id)}`, payload) : await api.post(`${base}/categories`, payload)
  return result(response.data, 'category')
}
export async function changeKbCategoryStatus(id, isActive) {
  return result((await api.patch(`${base}/categories/${encodeURIComponent(id)}/status`, { isActive })).data, 'category')
}
