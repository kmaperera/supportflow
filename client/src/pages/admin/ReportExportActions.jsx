import { useToast } from '../../components/toastContext'
import { useEffect, useRef, useState } from 'react'
import { exportReport, reportExportError } from '../../api/reportExportApi'
import { saveAttachment } from '../employee/attachmentDownload'
import { validateReportDates } from './reportValidation'
import AuthFeedback from '../../auth/AuthFeedback'

export default function ReportExportActions({ type, criteria, disabled }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  const invalid = Object.keys(validateReportDates(type, criteria)).length > 0
  async function download(format) {
    if (pending.current || disabled || invalid) return
    pending.current = true; setBusy(format); setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const { blob, filename } = await exportReport(type, format, criteria, { signal: controller.signal })
      if (!controller.signal.aborted) { saveAttachment(blob, filename); toast.success(`${format.toUpperCase()} download started.`) }
    } catch (cause) {
      const message = await reportExportError(cause)
      if (!controller.signal.aborted) { setError(message); toast.error(message) }
    } finally { pending.current = false; if (!controller.signal.aborted) setBusy(null) }
  }
  return <div className="space-y-2">
    <div className="layout-actions">{(type === 'tickets' ? ['csv', 'pdf'] : ['csv']).map(format => <button key={format} type="button" disabled={Boolean(busy) || disabled || invalid} onClick={() => download(format)} className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{busy === format ? `Exporting ${format.toUpperCase()}...` : `Export ${format.toUpperCase()}`}</button>)}</div>
    <p className="text-xs text-slate-500 dark:text-slate-400">Exports include the complete report matching the generated criteria, not just this page. Data is read again when exporting.</p>
    {error && <AuthFeedback>{error}</AuthFeedback>}
  </div>
}
