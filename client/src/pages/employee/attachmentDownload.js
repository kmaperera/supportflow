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
  const url = URL.createObjectURL(blob)
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
