'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const push = useCallback((text: string, tone: ToastItem['tone']) => {
    const id = next.current++;
    setItems((cur) => [...cur, { id, text, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), tone === 'error' ? 8000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(() => ({ success: (t) => push(t, 'ok'), error: (t) => push(t, 'error') }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={i.tone === 'error' ? 'toast err' : 'toast'}>
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
