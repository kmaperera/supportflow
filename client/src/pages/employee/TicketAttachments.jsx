import { useEffect, useRef, useState } from 'react'
import { getTicketAttachments, uploadTicketAttachment, downloadTicketAttachment } from '../../api/attachmentApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from './ticketFormatting'
import { attachmentTypes, validateAttachment, formatAttachmentSize } from './attachmentFormatting'

export default function TicketAttachments({ ticketId, status }) {
  const [list, setList] = useState({ loading: true, attachments: [], error: false })
  const [attempt, setAttempt] = useState(0)
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const pending = useRef(false)
  const input = useRef(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    getTicketAttachments(ticketId, { signal: controller.signal }).then(attachments => {
      if (!controller.signal.aborted) setList({ loading: false, attachments, error: false })
    }).catch(() => { if (!controller.signal.aborted) setList({ loading: false, attachments: [], error: true }) })
    return () => controller.abort()
  }, [ticketId, attempt])
  function reload() {
    setList(previous => ({ ...previous, loading: true, error: false }))
    setAttempt(value => value + 1)
  }
  const allowed = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'].includes(status)
  async function submit(event) {
    event.preventDefault()
    if (pending.current || !allowed) return
    const validation = validateAttachment(file)
    if (validation) { setError(validation); return }
    pending.current = true
    setUploading(true)
    setError(null)
    setSuccess(false)
    try {
      await uploadTicketAttachment(ticketId, file)
      if (!active.current) return
      setFile(null)
      input.current.value = ''
      setSuccess(true)
      reload()
    } catch (cause) {
      if (active.current) setError(cause?.response?.status === 413 ? 'Maximum file size is 10 MB.' :
        cause?.response?.status === 415 ? 'Unsupported file type or file type does not match its extension.' :
        cause?.response?.status === 409 ? 'This ticket no longer accepts attachments.' :
        [403, 404].includes(cause?.response?.status) ? 'This attachment or ticket is not available.' :
        getApiErrorMessage(cause, 'Unable to upload attachment. Please check the file and try again.'))
    } finally { pending.current = false; if (active.current) setUploading(false) }
  }
  return <section aria-labelledby="attachments-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
    <h2 id="attachments-heading" className="text-lg font-semibold">Attachments</h2>
    {list.loading ? <p role="status" className="mt-4 text-sm">Loading attachments...</p> : list.error ? <div className="mt-4"><AuthFeedback>Unable to load attachments.</AuthFeedback><button type="button" onClick={reload} className="mt-2 rounded text-teal-800 underline focus-visible:outline-2">Retry attachments</button></div> : !list.attachments.length ? <p className="mt-4 text-sm text-slate-600">No attachments yet.</p> : <ul className="mt-4 space-y-3">{list.attachments.map(attachment => <AttachmentRow key={attachment.id} attachment={attachment} ticketId={ticketId} />)}</ul>}
    {allowed ? <form onSubmit={submit} noValidate className="mt-6 space-y-3">
      <label htmlFor="ticket-attachment" className="block text-sm font-semibold">Add attachment</label>
      <input ref={input} id="ticket-attachment" type="file" accept={Object.keys(attachmentTypes).join(',')} disabled={uploading} onChange={event => { setFile(event.target.files?.[0] || null); setError(null); setSuccess(false) }} aria-describedby="attachment-help attachment-error" className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:px-3 file:py-2" />
      <p id="attachment-help" className="text-xs text-slate-500">One file, maximum 10 MB. JPG/JPEG, PNG, WEBP, PDF, TXT, CSV, DOC/DOCX, XLS/XLSX.</p>
      <div id="attachment-error">{error && <AuthFeedback>{error}</AuthFeedback>}</div>
      <button type="submit" disabled={uploading} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{uploading ? 'Uploading...' : 'Upload'}</button>
      <p role="status" className="text-sm text-teal-800">{success ? 'Attachment uploaded successfully.' : uploading ? 'Uploading attachment...' : ''}</p>
    </form> : <p className="mt-6 text-sm text-slate-600">This ticket does not accept new attachments in its current status.</p>}
  </section>
}

function AttachmentRow({ attachment, ticketId }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  async function download() {
    if (pending.current) return
    pending.current = true
    setDownloading(true)
    setError(null)
    try {
      const blob = await downloadTicketAttachment(ticketId, attachment)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachment.originalName || 'attachment'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(getApiErrorMessage(cause, 'Unable to download attachment. Please try again.')) }
    finally { pending.current = false; setDownloading(false) }
  }
  const name = [attachment.uploadedBy?.firstName, attachment.uploadedBy?.lastName].filter(value => typeof value === 'string' && value.trim()).join(' ')
  return <li className="min-w-0 rounded-xl bg-slate-50 p-4">
    <p className="break-all text-sm font-semibold">{attachment.originalName}</p>
    <p className="mt-1 break-words text-xs text-slate-600">{attachment.mimeType} · {formatAttachmentSize(attachment.fileSize)}</p>
    <p className="mt-1 break-words text-xs text-slate-500">{name ? `Uploaded by ${name} · ` : ''}{formatTicketDate(attachment.createdAt)}</p>
    <button type="button" disabled={downloading} onClick={download} aria-label={`Download ${attachment.originalName}`} className="mt-3 rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2 disabled:opacity-60">{downloading ? 'Downloading...' : 'Download'}</button>
    {error && <AuthFeedback>{error}</AuthFeedback>}
  </li>
}
