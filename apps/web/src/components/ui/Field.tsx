import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Already translated. */
  error?: string | null | undefined;
  required?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label + hint + error wired to one control with ids, so screen readers announce all three. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['field', error ? 'has-error' : '', className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(required ? { 'aria-required': true as const } : {}),
      })}
      {hint ? (
        <div id={hintId} className="hint">
          {hint}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} className="field-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

type Common = Omit<FieldProps, 'children'>;

export function TextField({ label, hint, error, required, className, ...input }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(c) => <input {...c} {...input} />}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...select
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(c) => (
        <select {...c} {...select}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({ label, hint, error, required, className, ...area }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(c) => <textarea {...c} {...area} />}
    </Field>
  );
}

export function CheckboxField({
  label,
  hint,
  error,
  className,
  ...input
}: { label: ReactNode; hint?: ReactNode; error?: string | null; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={['check', error ? 'has-error' : '', className ?? ''].filter(Boolean).join(' ')}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        {...input}
      />
      <label htmlFor={id}>
        {label}
        {hint ? (
          <span id={hintId} className="hint block">
            {hint}
          </span>
        ) : null}
        {error ? (
          <span id={errorId} className="field-error block">
            {error}
          </span>
        ) : null}
      </label>
    </div>
  );
}
