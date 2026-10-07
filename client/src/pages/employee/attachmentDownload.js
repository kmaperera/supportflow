// Keep the object URL alive long enough for the browser to consume the file.
export function saveAttachment(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = filename || 'attachment'
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

export function openAttachment(blob, preview) {
  // Object URLs inherit this app's origin. Never navigate to HTML/SVG or an
  // unknown active-document type, even if API metadata calls it a safe file.
  const type = blob.type.split(';', 1)[0].trim().toLowerCase()
  const passiveTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv']
  if (!passiveTypes.includes(type)) throw new Error('This file type is download-only')
  // CSV is text here, not a document for the browser to infer or execute.
  const resource = type === 'text/csv' ? new Blob([blob], { type: 'text/plain' }) : blob
  const url = URL.createObjectURL(resource)
  try {
    preview.location.replace(url)
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  // Keep previews usable until their tab closes, including PDF viewers.
  const cleanup = setInterval(() => {
    if (preview.closed) {
      URL.revokeObjectURL(url)
      clearInterval(cleanup)
    }
  }, 1000)
}
