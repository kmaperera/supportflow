import api from './axios'
import { API_ENDPOINTS } from './endpoints'

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

