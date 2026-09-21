export const attachmentTypes = {
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.png': ['image/png'], '.webp': ['image/webp'],
  '.pdf': ['application/pdf'], '.txt': ['text/plain'], '.csv': ['text/csv', 'application/csv', 'text/plain'],
  '.doc': ['application/msword'], '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'], '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
}
export function validateAttachment(file) {
  if (!file) return 'Choose a file to upload.'
  if (!file.name.trim() || file.name.length > 255) return 'The filename must be between 1 and 255 characters.'
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!attachmentTypes[extension] || !attachmentTypes[extension].includes(file.type)) return 'Unsupported file type or file type does not match its extension.'
  if (!file.size) return 'The file cannot be empty.'
  if (file.size > 10 * 1024 * 1024) return 'Maximum file size is 10 MB.'
  return null
}
export function formatAttachmentSize(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size < 0) return 'Size unavailable'
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`
}
