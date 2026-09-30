import { useEffect, useRef, useState } from 'react'
import { saveKbCategory } from '../../api/adminKnowledgeBaseApi'
import AuthFeedback from '../../auth/AuthFeedback'
import { kbButton as button, kbInput as input, kbCard, kbError, kbFieldErrors, validateKb } from './kbPresentation'

export default function KbCategoryEditor({ category, onSaved, onCancel }) {
  const [values, setValues] = useState({ name: category?.name || '', description: category?.description || '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const next = validateKb(values)
    setErrors(next); setError('')
    if (Object.keys(next).length) return
    pending.current = true; setSaving(true)
    try { await saveKbCategory(category?.id, values); if (mounted.current) onSaved() }
    catch (cause) {
      if (mounted.current) {
        setError(kbError(cause, 'Unable to save KB category.'))
        setErrors(cause?.response?.status === 409 && cause.response.data?.message === 'Knowledge Base category already exists' ? { name: 'A KB category with this name already exists.' } : kbFieldErrors(cause, ['name', 'description']))
      }
    } finally { pending.current = false; if (mounted.current) setSaving(false) }
  }
  return <form noValidate onSubmit={submit} className={kbCard}>
    <h2 className="text-lg font-semibold">{category ? 'Edit KB Category' : 'Add KB Category'}</h2>
    {error && <AuthFeedback>{error}</AuthFeedback>}
    {['name', 'description'].map(field => <div key={field}><label className="text-sm font-semibold" htmlFor={`kb-category-${field}`}>{field === 'name' ? 'Name *' : 'Description (optional)'}</label>
      {field === 'name' ? <input id={`kb-category-${field}`} required className={input} disabled={saving} value={values[field]} onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); setErrors(previous => ({ ...previous, [field]: null })) }} aria-invalid={Boolean(errors[field])} aria-describedby={`kb-category-${field}-error`} /> : <textarea id={`kb-category-${field}`} rows={3} className={input} disabled={saving} value={values[field]} onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); setErrors(previous => ({ ...previous, [field]: null })) }} aria-invalid={Boolean(errors[field])} aria-describedby={`kb-category-${field}-error`} />}
      <p id={`kb-category-${field}-error`} role={errors[field] ? 'alert' : undefined} className="mt-1 text-sm text-red-700">{errors[field]}</p>
    </div>)}
    <div className="layout-actions"><button className={button} disabled={saving}>{saving ? category ? 'Saving...' : 'Creating...' : category ? 'Save KB Category' : 'Create KB Category'}</button><button type="button" className={button} disabled={saving} onClick={onCancel}>Cancel</button></div>
  </form>
}
