import assert from 'node:assert/strict'
import { mapFieldErrors, focusFirstError } from '../src/components/formValidation.js'
import { validateCreateUser } from '../src/pages/admin/createUserValidation.js'
import { validateReportDates } from '../src/pages/admin/reportValidation.js'
const error = { response: { status: 422, data: { success: false, errors: [null, { field: 'email', message: 'SQL secret' }, { field: 'unexpected' }] } } }
assert.deepEqual(mapFieldErrors(error, { email: 'email address' }), { email: 'Please check email address.' })
assert.deepEqual(mapFieldErrors({ response: { status: 500, data: error.response.data } }, { email: 'email' }), {})
let focused = ''
globalThis.document = { getElementById: id => ({ disabled: id === 'form-firstName', focus: () => { focused = id } }) }
focusFirstError({ firstName: 'Required', lastName: 'Required' }, field => `form-${field}`)
assert.equal(focused, 'form-lastName')
delete globalThis.document
assert.ok(validateCreateUser({ firstName:' ',lastName:' ',email:'bad',role:'OWNER',password:'',confirmPassword:'',phone:'',department:'' }).role)
assert.ok(validateReportDates('date-range', { startDate:'2026-02-30',endDate:'2026-01-01' }).startDate)
assert.ok(validateReportDates('date-range', { startDate:'2026-03-01',endDate:'2026-01-01' }).endDate)
assert.deepEqual(validateReportDates('tickets', { startDate:'',endDate:'' }), {})
console.log('Safe backend field mapping, first enabled invalid field, role allowlist and date validation passed.')
