// Focus only after a failed submit, never while someone is typing.
export function focusFirstError(errors, idForField) {
  for (const field of Object.keys(errors)) {
    if (!errors[field]) continue
    const input = document.getElementById(idForField(field))
    if (input && !input.disabled) { input.focus(); return }
  }
}

// Field names are an explicit allowlist. Server text is never rendered verbatim.
export function mapFieldErrors(error, labels) {
  const body = error?.response?.data
  if (error?.response?.status !== 422 || body?.success === true || !Array.isArray(body?.errors)) return {}
  const result = {}
  for (const item of body.errors) {
    if (typeof item?.field === 'string' && Object.hasOwn(labels, item.field)) result[item.field] = `Please check ${labels[item.field]}.`
  }
  return result
}
