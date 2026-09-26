import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const categories = await server.ssrLoadModule('/src/api/categoryApi.js')
  const { validateCategory } = await server.ssrLoadModule('/src/pages/admin/categoryPresentation.js')
  assert.deepEqual(validateCategory({ name: ' A ', description: '' }), {})
  assert.ok(validateCategory({ name: ' ', description: '' }).name)
  assert.ok(validateCategory({ name: 'a'.repeat(101), description: 'b'.repeat(256) }).description)
  const category = { id: 8, name: 'Network', description: null, isActive: false }
  const base = '/tickets/admin/categories'
  const cases = [
    ['get', base, undefined, () => categories.getCategories(), { categories: [category] }],
    ['get', `${base}/8`, undefined, () => categories.getCategory(8), { category }],
    ['post', base, { name: 'Network', description: null }, () => categories.createCategory({ name: ' Network ', description: ' ', id: 999 }), { category }],
    ['patch', `${base}/8`, { name: 'Network', description: 'Text' }, () => categories.updateCategory(8, { name: 'Network', description: ' Text ' }), { category }],
    ['patch', `${base}/8/status`, { isActive: false }, () => categories.updateCategoryStatus(8, false), { category }],
  ]
  for (const [method, url, payload, action, data] of cases) {
    api.defaults.adapter = async config => {
      assert.equal(config.method, method); assert.equal(config.url, url)
      assert.deepEqual(config.data ? JSON.parse(config.data) : undefined, payload)
      return { config, status: 200, headers: {}, data: { success: true, data } }
    }
    assert.deepEqual(await action(), data.categories || category)
  }
  const failure = Object.assign(new Error('Conflict'), { response: { status: 409 } })
  api.defaults.adapter = async () => { throw failure }
  await assert.rejects(categories.createCategory({ name: 'Network', description: '' }), error => error === failure)
  console.log('Category validation, five API contracts, inactive records, payload allowlist and error propagation passed.')
} finally { await server.close() }
