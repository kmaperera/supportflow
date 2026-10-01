import FieldError from '../../components/FieldError'
import { focusFirstError } from '../../components/formValidation'
import ErrorState from '../../components/ErrorState'
import LoadingState from '../../components/LoadingState'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAdminArticle, getKbCategories, saveKbArticle } from '../../api/adminKnowledgeBaseApi'
import AuthFeedback from '../../auth/AuthFeedback'
import useKbResource from './useKbResource'
import { kbButton as button, kbInput as input, kbCard, kbError, kbFieldErrors, validateKb } from './kbPresentation'

export default function KbArticleFormPage() {
  const { articleId } = useParams()
  return <ArticleForm key={articleId || 'new'} id={articleId} />
}
function ArticleForm({ id }) {
  const navigate = useNavigate()
  const loader = useCallback(signal => Promise.all([getKbCategories({ signal }), id ? getAdminArticle(id, { signal }) : Promise.resolve(null)]), [id])
  const resource = useKbResource(loader)
  return <div className="layout-narrow layout-page">
    <h1 className="text-2xl font-semibold">{id ? 'Edit Article' : 'Add Article'}</h1>
    {resource.loading ? <LoadingState>Loading article form...</LoadingState> : resource.error ? <ErrorState title="Unable to load the article form."><button className={button} onClick={resource.reload}>Retry</button></ErrorState> : <ArticleEditor id={id} categories={resource.data[0]} article={resource.data[1]} onSaved={() => navigate('/admin/knowledge-base', { replace: true, state: { kbMessage: id ? 'Article updated successfully.' : 'Article created successfully.' } })} />}
    <Link className={button} to="/admin/knowledge-base">Back to KB Articles</Link>
  </div>
}
function ArticleEditor({ id, categories, article, onSaved }) {
  const [values, setValues] = useState({ title: article?.title || '', content: article?.content || '', categoryId: article ? String(article.categoryId) : '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const available = categories.filter(category => category.isActive || String(category.id) === String(article?.categoryId))
  function change(field, value) { setValues(previous => ({ ...previous, [field]: value })); setErrors(previous => ({ ...previous, [field]: null })) }
  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const next = validateKb(values, true)
    setErrors(next); setError('')
    if (Object.keys(next).length) { focusFirstError(next, field => `kb-${field}`); return }
    pending.current = true; setSaving(true)
    try { await saveKbArticle(id, values); if (mounted.current) onSaved() }
    catch (cause) { if (mounted.current) { setError(kbError(cause, 'Unable to save article.')); setErrors(kbFieldErrors(cause, ['title', 'categoryId', 'content'])) } }
    finally { pending.current = false; if (mounted.current) setSaving(false) }
  }
  return <form noValidate onSubmit={submit} className={kbCard}>
    <p className="text-sm text-slate-600">{id ? 'Saving preserves the current publication status. Changes to published content are visible to readers immediately.' : 'New articles are saved as drafts. Publish them from KB Articles when ready.'}</p>
    {error && <AuthFeedback>{error}</AuthFeedback>}
    {['title', 'categoryId', 'content'].map(field => <div key={field}>
      <label className="text-sm font-semibold" htmlFor={`kb-${field}`}>{({ title: 'Title', categoryId: 'KB Category', content: 'Content' })[field]} *</label>
      {field === 'categoryId' ? <select id={`kb-${field}`} required disabled={saving} className={input} value={values[field]} onChange={event => change(field, event.target.value)} aria-invalid={Boolean(errors[field])} aria-describedby={`kb-${field}-error`}>
        <option value="">Select a KB category</option>{available.map(category => <option key={category.id} value={String(category.id)}>{category.name}{!category.isActive ? ' (inactive — current category)' : ''}</option>)}
      </select> : field === 'content' ? <textarea id={`kb-${field}`} required rows={14} disabled={saving} className={input} value={values[field]} onChange={event => change(field, event.target.value)} aria-invalid={Boolean(errors[field])} aria-describedby={`kb-${field}-error`} /> : <input id={`kb-${field}`} maxLength={200} required disabled={saving} className={input} value={values[field]} onChange={event => change(field, event.target.value)} aria-invalid={Boolean(errors[field])} aria-describedby={`kb-${field}-error`} />}
      <FieldError id={`kb-${field}-error`}>{errors[field]}</FieldError>
    </div>)}
    {!available.length && <p role="status" className="text-sm text-slate-600">Create or activate a KB category before adding an article.</p>}
    <button type="submit" className={button} disabled={saving || !available.length}>{saving ? id ? 'Saving...' : 'Creating...' : id ? 'Save Article' : 'Create Article'}</button>
  </form>
}
