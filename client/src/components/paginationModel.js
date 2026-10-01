// Normalize the three existing API metadata shapes; do not derive totals from rows.
export function paginationValues(metadata) {
  return {
    currentPage: metadata.currentPage ?? metadata.page,
    totalPages: metadata.totalPages,
    totalItems: metadata.totalRecords ?? metadata.totalItems ?? metadata.total,
    pageSize: metadata.limit,
  }
}

export function visiblePages(current, total) {
  if (total <= 7) return Array.from({ length: Math.max(0, total) }, (_, index) => index + 1)
  const start = Math.min(total - 3, Math.max(2, current - 1))
  const pages = [1, ...Array.from({ length: 3 }, (_, index) => start + index), total]
  const result = []
  for (const page of pages) {
    const previous = result.at(-1)
    if (typeof previous === 'number' && page - previous > 1) result.push('…')
    result.push(page)
  }
  return result
}
