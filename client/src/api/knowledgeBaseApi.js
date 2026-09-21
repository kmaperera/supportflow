import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function getPublishedArticles({ page = 1, search = '', signal } = {}) {
  const params = { page, limit: 10 }
  if (search.trim()) params.search = search.trim()
  const { data } = await api.get(`${API_ENDPOINTS.KNOWLEDGE_BASE}/articles`, { params, signal })
  if (data?.success !== true || !Array.isArray(data.data?.articles) || !data.data.pagination || data.data.articles.some(article => article.status !== 'PUBLISHED')) throw new Error('Invalid article list response')
  return data.data
}
export async function getKnowledgeBaseArticle(id) {
  const { data } = await api.get(`${API_ENDPOINTS.KNOWLEDGE_BASE}/articles/${encodeURIComponent(id)}`)
  if (data?.success !== true || data.data?.article?.status !== 'PUBLISHED') throw new Error('Invalid article response')
  return data.data.article
}

export async function getSuggestedArticles({ title, description }, { signal } = {}) {
  const { data } = await api.post(`${API_ENDPOINTS.KNOWLEDGE_BASE}/articles/suggestions`, { title, description }, { signal })
  const articles = data?.data?.articles
  if (data?.success !== true || !Array.isArray(articles)) throw new Error('Invalid article suggestions response')
  return articles.slice(0, 5)
}

export function hasSuggestionInput(title, description) {
  const stopWords = new Set(['the', 'a', 'an', 'to', 'is', 'my', 'and', 'or', 'of', 'for', 'in', 'on'])
  return (`${title} ${description}`.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .some(term => Array.from(term).length >= 3 && !stopWords.has(term))
}
