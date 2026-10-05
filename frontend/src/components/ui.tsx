import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-card text-foreground border border-border hover:bg-brand-50 dark:hover:bg-white/5 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50',
  ghost: 'text-brand-700 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-white/5 disabled:opacity-50',
};
const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-base',
  lg: 'px-5 py-3.5 text-lg',
};
const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed';

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}
export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button {...rest} disabled={disabled || loading} className={cx(base, variants[variant], sizes[size], className)}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'primary', size = 'md', className, children, ...rest }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>) {
  return (
    <Link href={href} {...rest} className={cx('btn', base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-xl border border-border bg-card p-4 shadow-sm', className)}>
      {children}
    </div>
  );
}

const fieldBase = 'w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60';

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ className, ...rest }: React.ComponentProps<'input'>) {
  return <input {...rest} className={cx(fieldBase, className)} />;
}
export function Select({ className, children, ...rest }: React.ComponentProps<'select'>) {
  return (
    <select {...rest} className={cx(fieldBase, className)}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...rest }: React.ComponentProps<'textarea'>) {
  return <textarea {...rest} className={cx(fieldBase, 'min-h-24', className)} />;
}

const tones = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  brand: 'bg-brand-100 text-brand-900 dark:bg-brand-500/20 dark:text-brand-100',
};
export type Tone = keyof typeof tones;
export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

const alertTones: Record<'info' | 'success' | 'warning' | 'error', string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
  error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100',
};
export function Alert({ tone = 'info', children, className }: { tone?: keyof typeof alertTones; children: ReactNode; className?: string }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-lg border px-4 py-3 text-sm', alertTones[tone], className)}>
      {children}
    </div>
  );
}

export function PageContainer({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cx('mx-auto w-full px-4 py-6 sm:px-6', narrow ? 'max-w-xl' : 'max-w-5xl', className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-lg bg-slate-200 dark:bg-white/10', className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted">{children}</p>;
}
