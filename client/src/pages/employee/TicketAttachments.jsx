import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import { useEffect, useRef, useState } from 'react'
import { getTicketAttachments, uploadTicketAttachment, downloadTicketAttachment } from '../../api/attachmentApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from './ticketFormatting'
import { attachmentTypes, validateAttachment, formatAttachmentSize } from './attachmentFormatting'
import { saveAttachment, openAttachment } from './attachmentDownload'

export default function TicketAttachments({ ticketId, status, canUpload = true, disabled = false, onUploadingChange, onAccessChanged }) {
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
  const allowed = canUpload && ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'].includes(status)
  async function submit(event) {
    event.preventDefault()
    if (pending.current || disabled || !allowed) return
    const validation = validateAttachment(file)
    if (validation) { setError(validation); input.current?.focus(); return }
    pending.current = true
    setUploading(true)
    onUploadingChange?.(true)
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
      if (active.current && [403, 404, 409].includes(cause?.response?.status)) await onAccessChanged?.()
    } finally { pending.current = false; onUploadingChange?.(false); if (active.current) setUploading(false) }
  }
  return <section aria-labelledby="attachments-heading" className="min-w-0 layout-panel">
    <h2 id="attachments-heading" className="text-lg font-semibold">Attachments</h2>
    {list.loading ? <ContentSkeleton initial={attempt === 0 && !list.attachments.length} variant="rows">Loading attachments...</ContentSkeleton> : list.error ? <ErrorState compact className="mt-4" title="Unable to load attachments."><button type="button" onClick={reload} className="mt-2 rounded text-teal-800 dark:text-teal-300 underline focus-visible:outline-2">Retry attachments</button></ErrorState> : !list.attachments.length ? <EmptyState compact title="No attachments yet." /> : <ul className="mt-4 space-y-3">{list.attachments.map(attachment => <AttachmentRow key={attachment.id} attachment={attachment} ticketId={ticketId} />)}</ul>}
    {allowed ? <form onSubmit={submit} noValidate className="mt-6 space-y-3">
      <label htmlFor="ticket-attachment" className="block text-sm font-semibold">Add attachment <span aria-hidden="true">*</span></label>
      <input ref={input} id="ticket-attachment" type="file" required aria-invalid={Boolean(error)} accept={Object.keys(attachmentTypes).join(',')} disabled={uploading || disabled} onChange={event => { setFile(event.target.files?.[0] || null); setError(null); setSuccess(false) }} aria-describedby="attachment-help attachment-error" className="block w-full min-w-0 text-sm focus-visible:outline-2 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-slate-300 dark:file:border-slate-700 file:px-3 file:py-2" />
      <p id="attachment-help" className="text-xs text-slate-500 dark:text-slate-400">One file, maximum 10 MB. JPG/JPEG, PNG, WEBP, PDF, TXT, CSV, DOC/DOCX, XLS/XLSX.</p>
      <div id="attachment-error">{error && <AuthFeedback>{error}</AuthFeedback>}</div>
      <button type="submit" disabled={uploading || disabled} className="cursor-pointer rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{uploading ? 'Uploading...' : 'Upload Attachment'}</button>
      {success && <AuthFeedback variant="success">Attachment uploaded successfully.</AuthFeedback>}
    </form> : <div className="mt-6 text-sm text-slate-600 dark:text-slate-300"><p>{canUpload ? 'This ticket does not accept new attachments in its current status.' : 'Attachments are read-only unless this ticket is assigned to you.'}</p>{error && <AuthFeedback>{error}</AuthFeedback>}</div>}
  </section>
}

function AttachmentRow({ attachment, ticketId }) {
  const [downloading, setDownloading] = useState(null)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  async function download(mode = 'download') {
    if (pending.current) return
    pending.current = true
    setDownloading(mode)
    setError(null)
    let preview
    try {
      if (mode === 'open') {
        // Open synchronously during the click so popup blockers can allow it.
        preview = window.open('about:blank', '_blank')
        if (!preview) throw new Error('Preview blocked')
        preview.opener = null
        preview.document.title = 'Loading attachment...'
      }
      const blob = await downloadTicketAttachment(ticketId, attachment)
      if (mode === 'open') {
        if (!preview.closed) openAttachment(blob, preview)
      } else saveAttachment(blob, attachment.originalName)
    } catch {
      preview?.close()
      setError(mode === 'open' ? 'Unable to open attachment. Allow pop-ups or use Download.' : 'Unable to download attachment.')
    }
    finally { pending.current = false; setDownloading(null) }
  }
  const name = [attachment.uploadedBy?.firstName, attachment.uploadedBy?.lastName].filter(value => typeof value === 'string' && value.trim()).join(' ')
  return <li className="min-w-0 rounded-xl bg-slate-50 dark:bg-slate-950 p-4">
    <p className="break-all text-sm font-semibold">{attachment.originalName}</p>
    <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">{attachment.mimeType} · {formatAttachmentSize(attachment.fileSize)}</p>
    <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{name ? `Uploaded by ${name} · ` : ''}{formatTicketDate(attachment.createdAt)}</p>
    <div className="mt-3 flex flex-wrap gap-4">
      {['open', 'download'].map(mode => <button key={mode} type="button" disabled={Boolean(downloading)} onClick={() => download(mode)} aria-label={`${mode === 'open' ? 'Open' : 'Download'} ${attachment.originalName}`} className="cursor-pointer rounded text-sm font-semibold text-teal-800 dark:text-teal-300 underline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60">{mode === 'open' ? downloading === 'open' ? 'Opening...' : 'Open' : downloading === 'download' ? 'Downloading...' : 'Download'}</button>)}
    </div>
    {error && <AuthFeedback>{error}</AuthFeedback>}
  </li>
}
