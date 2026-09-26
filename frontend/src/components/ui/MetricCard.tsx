import { cn } from '@/lib/utils';
import { CountUp } from '@/components/ui/CountUp';

interface MetricCardProps {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  icon?: React.ReactNode;
  accent?: 'default' | 'green' | 'amber' | 'red' | 'cyan';
  animate?: boolean;
  className?: string;
}

export function MetricCard({ value, label, prefix = '', suffix = '', icon, accent = 'default', animate = true, className }: MetricCardProps) {
  const accents = {
    default: 'text-slate-900',
    green: 'text-safar-safe',
    amber: 'text-safar-risk',
    red: 'text-safar-broken',
    cyan: 'text-safar-blue',
  };
  const iconBadges = {
    default: 'bg-slate-50 border-slate-300 text-slate-600',
    green: 'bg-safar-safe/10 border-safar-safe/30 text-safar-safe',
    amber: 'bg-safar-risk/10 border-safar-risk/30 text-safar-risk',
    red: 'bg-safar-broken/10 border-safar-broken/30 text-safar-broken',
    cyan: 'bg-safar-blue/10 border-safar-blue/30 text-safar-blue',
  };

  return (
    <div
      className={cn(
        'glass rounded-xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-500/40 hover:shadow-lg',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className={cn('text-2xl font-bold tracking-tight', accents[accent])}>
            {animate ? <CountUp value={value} prefix={prefix} suffix={suffix} /> : `${prefix}${value.toLocaleString('en-IN')}${suffix}`}
          </div>
          <div className="mt-1 text-xs text-slate-600">{label}</div>
        </div>
        {icon && (
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', iconBadges[accent])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
