import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getSuggestedArticles } = await server.ssrLoadModule('/src/api/knowledgeBaseApi.js')
  const { hasSuggestionInput } = await server.ssrLoadModule('/src/api/knowledgeBaseApi.js')
  assert.equal(hasSuggestionInput('  ', ''), false)
  assert.equal(hasSuggestionInput('my', 'the and'), false)
  assert.equal(hasSuggestionInput('Printer', ''), true)
  assert.equal(hasSuggestionInput('', 'Cannot connect to network'), true)
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/knowledge-base/articles/suggestions')
    assert.deepEqual(JSON.parse(config.data), { title: 'Printer', description: 'Cannot print' })
    return { config, status: 200, headers: {}, data: { success: true, data: { articles: [{ id: 17, title: 'Printer help', categoryName: 'Hardware' }] } } }
  }
  assert.equal((await getSuggestedArticles({ title: 'Printer', description: 'Cannot print', priorityId: 1 }))[0].id, 17)
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { articles: [] } } })
  assert.deepEqual(await getSuggestedArticles({ title: 'Printer' }), [])
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {} })
  await assert.rejects(() => getSuggestedArticles({ title: 'Printer' }), /Invalid article suggestions/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getSuggestedArticles({ title: 'Printer' }, { signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  console.log('KB suggestion contract, meaningful input, empty response, invalid response and cancellation passed.')
} finally { await server.close() }
