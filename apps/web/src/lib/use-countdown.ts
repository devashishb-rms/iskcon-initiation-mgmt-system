'use client';

import { useCallback, useEffect, useState } from 'react';

/** Counts down whole seconds from `start()`; used for the "ask for a new code" cooldown. */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const start = useCallback((seconds: number) => setLeft(seconds), []);
  return { left, start };
}
