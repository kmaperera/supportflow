import { mapFieldErrors } from '../../components/formValidation'
import { getApiErrorMessage } from '../../api/apiError'

export const kbButton = 'inline-flex min-h-11 w-fit max-w-full cursor-pointer items-center justify-center rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:cursor-not-allowed disabled:opacity-50'
export const kbInput = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:opacity-50'
export const kbCard = 'min-w-0 space-y-4 layout-panel'
export const publicationLabel = status => ({ DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' })[status] || status
const safeMessages = new Set([
  'Knowledge Base category already exists', 'Knowledge Base category not found', 'Knowledge Base category is inactive',
  'Knowledge Base article not found', 'Archived Knowledge Base article cannot be published',
  'Archived Knowledge Base article cannot be unpublished', 'Knowledge Base article category is missing',
  'Knowledge Base article cannot be published from its current status', 'Knowledge Base article cannot be unpublished from its current status',
])
export function kbError(error, fallback) {
  const body = error?.response?.data
  if (error?.response?.status < 500 && body?.success === false && safeMessages.has(body.message)) return body.message
  return getApiErrorMessage(error, fallback)
}
export function validateKb(values, article = false) {
  const errors = {}
  const length = value => Array.from(value.trim()).length
  if (article) {
    if (length(values.title) < 3 || length(values.title) > 200) errors.title = 'Title must be between 3 and 200 characters.'
    if (!values.content.trim()) errors.content = 'Content is required.'
    if (!/^[1-9]\d*$/.test(values.categoryId) || !Number.isSafeInteger(Number(values.categoryId))) errors.categoryId = 'Select a KB category.'
  } else {
    if (length(values.name) < 2 || length(values.name) > 100) errors.name = 'Name must be between 2 and 100 characters.'
    if (length(values.description) > 255) errors.description = 'Description must not exceed 255 characters.'
  }
  return errors
}
export function kbFieldErrors(error, fields) {
  const labels = { title: 'the title', content: 'the content', categoryId: 'the KB category', name: 'the name', description: 'the description' }
  return mapFieldErrors(error, Object.fromEntries(fields.filter(field => Object.hasOwn(labels, field)).map(field => [field, labels[field]])))
}
