import { useEffect } from 'react'

// Commit search and its page reset together; selects remain immediate.
export default function useDebouncedSearch(search, appliedSearch, setQuery) {
  useEffect(() => {
    const normalized = search.trim()
    if (normalized === (appliedSearch || '')) return
    const timer = setTimeout(() => setQuery(previous =>
      (previous.search || '') === normalized ? previous : { ...previous, search: normalized, page: 1 }
    ), 350)
    return () => clearTimeout(timer)
  }, [search, appliedSearch, setQuery])
}
