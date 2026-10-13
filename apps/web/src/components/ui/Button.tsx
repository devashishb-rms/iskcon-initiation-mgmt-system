import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const cls = (variant: Variant, small?: boolean, extra?: string) =>
  ['btn', variant === 'primary' && 'primary', variant === 'danger' && 'danger', variant === 'ghost' && 'ghost', small && 'small', extra].filter(Boolean).join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  small?: boolean;
  loading?: boolean;
}

export function Button({ variant = 'secondary', small, loading, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls(variant, small, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner inline /> : null}
      {children}
    </button>
  );
}

interface LinkProps {
  href: string;
  variant?: Variant;
  small?: boolean;
  children: ReactNode;
  className?: string;
}

/** An in-app link that looks like a button. */
export function ButtonLink({ href, variant = 'secondary', small, className, children }: LinkProps) {
  return (
    <Link href={href} className={cls(variant, small, className)}>
      {children}
    </Link>
  );
}

/** A plain anchor for files and API URLs (downloads, PDFs): the browser sends the session cookie. */
export function FileLink({
  href,
  variant = 'secondary',
  small,
  className,
  children,
  ...rest
}: LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>) {
  return (
    <a href={href} className={cls(variant, small, className)} {...rest}>
      {children}
    </a>
  );
}
