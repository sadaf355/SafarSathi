import { useId } from 'react';
import { cn } from '@/lib/utils';

/** The Safar Sathi paper-plane mark. Shared by the sidebar, sign-in screen and favicon. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#1F6BFF" />
        </linearGradient>
      </defs>
      <polygon points="2,13.5 30,2 12.5,18.5" fill={`url(#${id})`} />
      <polygon points="12.5,18.5 30,2 20.5,29.5" fill="#1F6BFF" />
      <polygon points="12.5,18.5 14.8,27.5 17.6,21.4" fill="#1545C8" />
    </svg>
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="h-10 w-10 shrink-0" />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[22px] font-extrabold tracking-tight text-ink">Safar Sathi</div>
          <div className="text-[11px] font-medium text-ink-soft">Your Journey, Always with You</div>
        </div>
      )}
    </div>
  );
}

/** Handwritten brand line used in hero corners and the sidebar footer. */
export function ScriptTagline({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <div className={cn('pointer-events-none select-none font-script font-semibold leading-[1.05] text-ink/85', className)} aria-hidden="true">
      {lines.map((line, i) => (
        <div key={line} style={{ paddingLeft: `${i * 0.9}em` }}>{line}</div>
      ))}
    </div>
  );
}
