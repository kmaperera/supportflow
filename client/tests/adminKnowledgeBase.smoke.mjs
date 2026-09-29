import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const kb = await server.ssrLoadModule('/src/api/adminKnowledgeBaseApi.js')
  const { validateKb, kbError, kbFieldErrors } = await server.ssrLoadModule('/src/pages/admin/kbPresentation.js')
  const article = { id: 8, categoryId: 17, title: 'Help article', content: 'Plain text', status: 'DRAFT' }
  const category = { id: 17, name: 'Help', description: null, isActive: false }
  let expected
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/knowledge-base' + expected.path)
    assert.equal(config.method, expected.method || 'get')
    if (expected.params) assert.deepEqual(config.params, expected.params)
    if (expected.payload) assert.deepEqual(JSON.parse(config.data), expected.payload)
    else assert.equal(config.data, undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: expected.data } }
  }
  expected = { path: '/categories', data: { categories: [category] } }
  assert.deepEqual(await kb.getKbCategories(), [category])
  expected = { path: '/articles', params: { page: 1, limit: 10 }, data: { articles: [article], pagination: { currentPage: 1 } } }
  assert.deepEqual((await kb.getAdminArticles()).articles, [article]) // Admin drafts are allowed.
  expected.params = { page: 3, limit: 10, search: 'printer', categoryId: '17' }
  await kb.getAdminArticles({ page: 3, search: ' printer ', categoryId: '17' })
  expected = { path: '/articles/8', data: { article } }
  assert.deepEqual(await kb.getAdminArticle(8), article)
  for (const id of [undefined, 8]) {
    expected = { path: id ? '/articles/8' : '/articles', method: id ? 'patch' : 'post', payload: { title: 'Help article', content: 'Plain text', categoryId: 17 }, data: { article } }
    await kb.saveKbArticle(id, { title: ' Help article ', content: ' Plain text ', categoryId: '17', status: 'PUBLISHED', createdBy: 2 })
  }
  for (const action of ['publish', 'unpublish', 'archive']) {
    expected = { path: `/articles/8/${action}`, method: 'patch', data: { article } }
    await kb.changeArticlePublication(8, action)
  }
  await assert.rejects(kb.changeArticlePublication(8, 'delete'))
  for (const id of [undefined, 17]) {
    expected = { path: id ? '/categories/17' : '/categories', method: id ? 'patch' : 'post', payload: { name: 'Help', description: null }, data: { category } }
    await kb.saveKbCategory(id, { name: ' Help ', description: ' ', isActive: false })
  }
  expected = { path: '/categories/17/status', method: 'patch', payload: { isActive: true }, data: { category } }
  await kb.changeKbCategoryStatus(17, true)
  assert.deepEqual(validateKb({ title: 'Help', content: 'Text', categoryId: '17' }, true), {})
  assert.deepEqual(Object.keys(validateKb({ title: ' ', content: ' ', categoryId: '' }, true)), ['title', 'content', 'categoryId'])
  assert.ok(validateKb({ name: 'A', description: 'x'.repeat(256) }).description)
  assert.ok(validateKb({ name: 'A', description: '' }).name)
  assert.equal(kbError({ response: { status: 500, data: { success: false, message: 'internal SQL error' } } }, 'Safe fallback'), 'Safe fallback')
  assert.equal(kbError({ response: { status: 409, data: { success: false, message: 'Knowledge Base category already exists' } } }, 'Fallback'), 'Knowledge Base category already exists')
  assert.deepEqual(kbFieldErrors({ response: { status: 422, data: { errors: [{ field: 'title', message: 'unsafe' }] } } }, ['title']), { title: 'Please check the title.' })
  console.log('Admin KB API contracts, draft reads, payload allowlists, validation and safe errors passed.')
} finally { await server.close() }
