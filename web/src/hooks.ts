import { useEffect, useRef, useState } from 'react';
import api from './api';

export function useLookups() {
  const [data, setData] = useState<import('./types').LookupSet | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => api.get('/lookups')
    .then(({ data }) => setData(data))
    .finally(() => setLoading(false));
  useEffect(() => {
    load();
    window.addEventListener('lookups:refresh', load);
    return () => window.removeEventListener('lookups:refresh', load);
  }, []);
  return { data, loading };
}

export function useLiveEvents(onEvent: (event: string, payload: unknown) => void) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  useEffect(() => {
    const source = new EventSource('/api/events');
    const types = ['session:open', 'session:closed', 'attendance:created', 'attendance:violation', 'student:profile-updated', 'lecture:created', 'lecture:deleted', 'photos:cleaned', 'attendance:deleted'];
    const listeners = types.map((type) => {
      const listener = (event: MessageEvent) => {
        try { callback.current(type, JSON.parse(event.data)); } catch { /* ignore */ }
      };
      source.addEventListener(type, listener);
      return { type, listener };
    });
    return () => {
      listeners.forEach(({ type, listener }) => source.removeEventListener(type, listener));
      source.close();
    };
  }, []);
}
