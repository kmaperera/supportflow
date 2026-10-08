// Explicit local smoke test: creates only disposable token-hash rows, then deletes them.
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
const require = createRequire(import.meta.url)
require('dotenv').config({ quiet: true })
const pool = require('../src/config/database')
const repository = require('../src/modules/auth/refreshToken.repository')
const hashes = Array.from({ length: 4 }, () => randomBytes(32).toString('hex'))
try {
  const [users] = await pool.execute('SELECT id FROM users WHERE is_active = TRUE LIMIT 1')
  assert.ok(users.length, 'An existing active local user is required; no user is created or changed')
  const userId = users[0].id, expiresAt = new Date(Date.now() + 60000)
  const old = await repository.create({ userId, tokenHash: hashes[0], expiresAt })
  const results = await Promise.all(hashes.slice(1, 3).map(tokenHash => repository.rotate(old, { userId, tokenHash, expiresAt })))
  assert.equal(results.filter(Boolean).length, 1)
  assert.equal(await repository.findActiveByHash(hashes[0]), null)
  const original = await repository.create({ userId, tokenHash: hashes[3], expiresAt })
  await assert.rejects(repository.rotate(original, { userId, tokenHash: null, expiresAt }))
  assert.ok(await repository.findActiveByHash(hashes[3]), 'Failed replacement must leave original active')
  console.log('PASS: MySQL rotation has one concurrent winner and rolls back revocation on failed insertion.')
} finally {
  try { await pool.execute('DELETE FROM refresh_tokens WHERE token_hash IN (?, ?, ?, ?)', hashes) }
  finally { await pool.end() }
}
