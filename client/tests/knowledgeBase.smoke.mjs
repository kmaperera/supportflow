import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
 const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
 const { getPublishedArticles, getKnowledgeBaseArticle } = await server.ssrLoadModule('/src/api/knowledgeBaseApi.js')
 const article = { id: 71, title: 'Network help', content: '<b>Plain text</b>', status: 'PUBLISHED', categoryName: 'Help' }
 api.defaults.adapter = async config => {
  assert.equal(config.method, 'get')
  if (config.url.endsWith('/71')) return { config, status: 200, headers: {}, data: { success: true, data: { article } } }
  assert.equal(config.url, '/knowledge-base/articles')
  assert.deepEqual(config.params, { page: 2, limit: 10, search: 'network' })
  return { config, status: 200, headers: {}, data: { success: true, data: { articles: [article], pagination: { currentPage: 2 } } } }
 }
 assert.equal((await getPublishedArticles({ page: 2, search: ' network ' })).articles[0].id, 71)
 assert.deepEqual(await getKnowledgeBaseArticle('71'), article)
 api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { article: { ...article, status: 'DRAFT' }, articles: [{ ...article, status: 'DRAFT' }], pagination: {} } } })
 await assert.rejects(() => getKnowledgeBaseArticle('71'), /Invalid article response/)
 await assert.rejects(() => getPublishedArticles(), /Invalid article list response/)
 console.log('KB list/search/page contract, ID detail and defensive draft rejection passed.')
} finally { await server.close() }
