import { useEffect, useRef } from 'react'
import { paginationValues, visiblePages } from './paginationModel'

export default function Pagination({ metadata, onPageChange, isLoading = false, disabled = false, label = 'Results', noun = 'results' }) {
  const { currentPage, totalPages, totalItems, pageSize } = paginationValues(metadata)
  const pending = useRef(false)
  useEffect(() => { if (!isLoading) pending.current = false }, [currentPage, isLoading, metadata])
  if (!totalItems || !Number.isInteger(currentPage) || !Number.isInteger(totalPages) || !Number.isInteger(pageSize) || pageSize < 1 || currentPage < 1 || currentPage > totalPages) return null
  const blocked = disabled || isLoading
  function go(page) {
    if (blocked || pending.current || page === currentPage || page < 1 || page > totalPages) return
    pending.current = true
    onPageChange(page)
  }
  const button = 'min-h-11 min-w-11 cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
  return <nav aria-label={`${label} pagination`} aria-busy={isLoading} className="flex min-w-0 flex-col gap-3 border-t border-slate-200 dark:border-slate-700 pt-4">
    <p className="break-words text-sm text-slate-600 dark:text-slate-300">{isLoading ? 'Previous results: ' : ''}Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems} {noun}</p>
    {totalPages > 1 && <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={blocked || currentPage === 1} onClick={() => go(currentPage - 1)}>Previous</button>
      <span className="text-sm sm:hidden">Page {currentPage} of {totalPages}</span>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">{visiblePages(currentPage, totalPages).map((page, index) => typeof page === 'number' ? <button key={page} type="button" className={`${button} ${page === currentPage ? 'border-teal-700 dark:border-teal-400 bg-teal-50 dark:bg-teal-950 ring-1 ring-teal-700 dark:ring-teal-400' : ''}`} aria-label={`Go to page ${page}`} aria-current={page === currentPage ? 'page' : undefined} disabled={blocked || page === currentPage} onClick={() => go(page)}>{page}</button> : <span key={`gap-${index}`} aria-hidden="true" className="px-1">…</span>)}</div>
      <button type="button" className={button} disabled={blocked || currentPage === totalPages} onClick={() => go(currentPage + 1)}>Next</button>
    </div>}
  </nav>
}
