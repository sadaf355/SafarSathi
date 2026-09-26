import { cn } from '@/lib/utils';

interface RiskBadgeProps {
  level: 'low' | 'medium' | 'high';
  percent?: number;
  className?: string;
}

export function RiskBadge({ level, percent, className }: RiskBadgeProps) {
  const colors = {
    low: 'text-safar-safe bg-safar-safe/10 border-safar-safe/30',
    medium: 'text-safar-risk bg-safar-risk/10 border-safar-risk/30',
    high: 'text-safar-broken bg-safar-broken/10 border-safar-broken/30',
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium', colors[level], className)}>
      {percent !== undefined && <span className="font-mono">{percent}%</span>}
      {level.toUpperCase()} RISK
    </span>
  );
}
