import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data from the backend.
 *   const q = useFetch(() => api.scheduler.queue(), [], { intervalMs: 5000 });
 * - q.reload()      manual refresh (shows "loading" state while it runs)
 * - intervalMs > 0  silent polling: refreshes in the background without flicker; a failed poll keeps
 *                   the old data and only sets q.pollError, so one network hiccup never blanks the page
 * - q.updatedAt     time of the last successful load
 */
export default function useFetch(fetcher, deps = [], { intervalMs = 0 } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: null, pollError: null, updatedAt: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);        // ignore answers that arrive out of order
  const mounted = useRef(true);

  const load = useCallback((silent) => {
    const mine = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    return fetcherRef.current()
      .then((data) => {
        if (mounted.current && mine === seq.current) {
          setState({ data, loading: false, error: null, pollError: null, updatedAt: new Date() });
        }
      })
      .catch((e) => {
        if (!mounted.current || mine !== seq.current) return;
        if (silent) setState((s) => ({ ...s, pollError: e.message }));
        else setState((s) => ({ ...s, data: null, loading: false, error: e.message }));
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    load(false);
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!intervalMs) return undefined;
    const id = setInterval(() => load(true), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, load]);

  const reload = useCallback(() => load(false), [load]);
  return { ...state, reload };
}
