import FieldError from '../../components/FieldError'
import { focusFirstError } from '../../components/formValidation'
import ErrorState from '../../components/ErrorState'
import LoadingState from '../../components/LoadingState'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createCategory, getCategory, updateCategory } from '../../api/categoryApi'
import AuthFeedback from '../../auth/AuthFeedback'
import { categoryButton as button, categoryInput as input, categoryError, validateCategory } from './categoryPresentation'

export default function CategoryFormPage() {
  const { categoryId } = useParams()
  return <CategoryForm key={categoryId || 'new'} id={categoryId} />
}
function CategoryForm({ id }) {
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: '', description: '' })
  const [loaded, setLoaded] = useState(!id)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    getCategory(id, { signal: controller.signal }).then(category => {
      if (!controller.signal.aborted) { setValues({ name: category.name, description: category.description || '' }); setLoaded(true) }
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true) })
    return () => controller.abort()
  }, [id, attempt])
  async function submit(event) {
    event.preventDefault()
    if (pending.current || !loaded) return
    const next = validateCategory(values)
    setErrors(next); setError(null)
    if (Object.keys(next).length) { focusFirstError(next, field => `category-${field}`); return }
    pending.current = true; setSaving(true)
    try {
      if (id) await updateCategory(id, values); else await createCategory(values)
      if (mounted.current) navigate('/admin/categories', { replace: true, state: { categorySaved: id ? 'updated' : 'created' } })
    } catch (cause) {
      if (!mounted.current) return
      setError(categoryError(cause))
      if (cause?.response?.status === 409) setErrors({ name: categoryError(cause) })
      if (cause?.response?.status === 422 && Array.isArray(cause.response.data?.errors)) {
        const fields = {}
        for (const item of cause.response.data.errors) if (['name', 'description'].includes(item.field)) fields[item.field] = `Please check the ${item.field}.`
        setErrors(fields)
      }
    } finally { pending.current = false; if (mounted.current) setSaving(false) }
  }
  return <div className="layout-narrow layout-page">
    <h1 className="text-2xl font-semibold">{id ? 'Edit Category' : 'Add Category'}</h1>
    {!loaded ? loadError ? <ErrorState title="Unable to load category."><button className={button} onClick={() => { setLoadError(false); setAttempt(value => value + 1) }}>Retry</button><button className={`${button} ml-3`} onClick={() => navigate('/admin/categories')}>Cancel</button></ErrorState> : <LoadingState>Loading category...</LoadingState> : <form onSubmit={submit} noValidate className="space-y-4 layout-panel">
      {error && <AuthFeedback>{error}</AuthFeedback>}
      {['name', 'description'].map(field => <div key={field}><label htmlFor={`category-${field}`} className="text-sm font-semibold">{field === 'name' ? 'Name *' : 'Description (optional)'}</label>{field === 'name' ? <input id="category-name" required className={input} value={values.name} disabled={saving} aria-invalid={Boolean(errors.name)} aria-describedby="category-name-error" onChange={event => { setValues(previous => ({ ...previous, name: event.target.value })); setErrors(previous => ({ ...previous, name: null })) }} /> : <textarea id="category-description" rows={3} className={input} disabled={saving} value={values.description} aria-invalid={Boolean(errors.description)} aria-describedby="category-description-error" onChange={event => { setValues(previous => ({ ...previous, description: event.target.value })); setErrors(previous => ({ ...previous, description: null })) }} />}<div id={`category-${field}-error`}>{errors[field] && <FieldError>{errors[field]}</FieldError>}</div></div>)}
      <div className="layout-actions"><button className={button} type="submit" disabled={saving}>{saving ? id ? 'Saving...' : 'Creating...' : id ? 'Save Category' : 'Create Category'}</button><button className={button} type="button" disabled={saving} onClick={() => navigate('/admin/categories')}>Cancel</button></div>
    </form>}
  </div>
}
