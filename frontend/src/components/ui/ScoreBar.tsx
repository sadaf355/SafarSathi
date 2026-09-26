import { cn } from '@/lib/utils';

interface ScoreBarProps {
  label: string;
  value: number;
  max?: number;
  color?: 'emerald' | 'amber' | 'red' | 'cyan' | 'blue';
  className?: string;
}

export function ScoreBar({ label, value, max = 100, color = 'cyan', className }: ScoreBarProps) {
  const percent = Math.min((value / max) * 100, 100);
  const colors = {
    emerald: 'bg-safar-safe',
    amber: 'bg-safar-risk',
    red: 'bg-safar-broken',
    cyan: 'bg-safar-sky',
    blue: 'bg-safar-blue',
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-slate-700">{label}</span>
        <span className="font-mono text-slate-900">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', colors[color])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
