'use client';

import { isApiError } from '@/lib/api/errors';
import { useErrorText } from '@/lib/use-error-text';

/** Shows a translated message for any thrown value. Raw server text is never displayed. */
export function FormError({ error }: { error: unknown }) {
  const text = useErrorText();
  if (!error) return null;
  return (
    <div className="note-box bad" role="alert" data-code={isApiError(error) ? error.code : undefined}>
      {text(error)}
    </div>
  );
}
