import { getApiErrorMessage } from '../../api/apiError'

export const categoryButton = 'inline-flex min-h-11 w-fit cursor-pointer items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50'
export const categoryInput = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50'
export function validateCategory(values) {
  const errors = {}
  const length = Array.from(values.name.trim()).length
  if (!length || length > 100) errors.name = 'Name must be 1 to 100 characters.'
  if (Array.from(values.description.trim()).length > 255) errors.description = 'Description must be at most 255 characters.'
  return errors
}
export function categoryError(error) {
  if (error?.response?.status === 409) return 'A category with this name already exists.'
  if (error?.response?.status === 404) return 'Category not found.'
  return getApiErrorMessage(error, 'Unable to save category. Please try again.')
}
