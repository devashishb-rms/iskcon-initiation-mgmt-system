'use client';

import { useCallback } from 'react';
import { useT } from '@/i18n/provider';
import { isApiError } from './api/errors';
import { errorKey, fieldErrorKey } from './error-keys';

/** Maps a thrown value to a translated sentence from its error code. */
export function useErrorText() {
  const { msg } = useT();
  return useCallback(
    (error: unknown): string => {
      if (isApiError(error)) {
        return msg({ code: errorKey(error.code, error.params), params: error.params });
      }
      return msg({ code: 'error.UNKNOWN' });
    },
    [msg],
  );
}

/** Text for one field error from a 4xx `errors[]` entry (`error.field.<code>` with `error.<code>` fallback). */
export function useFieldErrorText() {
  const { msg } = useT();
  return useCallback(
    (e: { code: string; params?: Record<string, string | number> | undefined }): string => {
      return msg({ code: fieldErrorKey(e.code), params: e.params });
    },
    [msg],
  );
}
