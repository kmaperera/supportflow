import assert from 'node:assert/strict'
import { getSlaDisplayState } from '../src/pages/technician/slaDisplayState.js'

const base = { created: 0, deadline: 100000, completed: null, stopped: false, recordedBreach: false, now: 0 }
const state = overrides => getSlaDisplayState({ ...base, ...overrides })
assert.equal(state({ now: 79999 }), 'on-track')
assert.equal(state({ now: 80000 }), 'warning')
assert.equal(state({ now: 99999 }), 'warning')
assert.equal(state({ now: 100000 }), 'on-track') // Backend uses strictly overdue, positive warning time.
assert.equal(state({ now: 100001 }), 'breached')
assert.equal(state({ completed: 100000, now: 200000 }), 'met')
assert.equal(state({ completed: 100001 }), 'breached')
assert.equal(state({ completed: 90000, recordedBreach: true }), 'breached')
assert.equal(state({ stopped: true, now: 200000 }), 'unavailable')
assert.equal(state({ stopped: true, completed: 90000 }), 'met')
assert.equal(state({ deadline: null }), 'unavailable')
assert.equal(state({ created: null }), 'unavailable')
assert.equal(state({ deadline: 0 }), 'unavailable')
assert.equal(state({ completionProvided: true }), 'unavailable')
assert.equal(state({ completed: -1 }), 'unavailable')
// Reopened tickets clear resolvedAt but retain the original deadline.
assert.equal(state({ completed: null, now: 200000 }), 'breached')
// Priority updates change the actual server deadline, never a cached derived state.
assert.equal(state({ now: 90000, deadline: 200000 }), 'on-track')
console.log('SLA warning boundaries, late/on-time completion, recorded breach, missing data, reopened and priority-change states passed.')
