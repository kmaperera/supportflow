import { useEffect, useState } from 'react'

// The caller supplies a stable loader so only query changes and explicit retries reload.
export default function useKbResource(loader) {
  const [state, setState] = useState({ data: null, error: false, loader: null, attempt: -1 })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data, error: false, loader, attempt })
    }).catch(() => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, error: true, loader, attempt }))
    })
    return () => controller.abort()
  }, [loader, attempt])
  const loading = state.loader !== loader || state.attempt !== attempt
  return { data: state.data, loading, error: !loading && state.error, reload: () => setAttempt(value => value + 1) }
}
