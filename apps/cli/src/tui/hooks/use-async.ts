import { useState, useCallback } from 'react';

interface AsyncState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

export function useAsync<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    loading: false,
    error: null,
    data: null,
  });

  const run = useCallback(async (fn: () => Promise<T>): Promise<T | null> => {
    setState({ loading: true, error: null, data: null });
    try {
      const result = await fn();
      setState({ loading: false, error: null, data: result });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ loading: false, error: message, data: null });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, error: null, data: null });
  }, []);

  return { ...state, run, reset };
}
