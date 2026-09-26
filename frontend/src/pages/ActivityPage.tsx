import { useApp } from '@/store/AppContext';
import { cn } from '@/lib/utils';
import { Radio, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

export function ActivityPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { activityLog } = useApp();

  const typeIcons = {
    monitoring: 'bg-safar-safe',
    risk: 'bg-safar-risk',
    recovery: 'bg-safar-sky',
    booking: 'bg-safar-sky',
    system: 'bg-slate-600',
    disruption: 'bg-safar-broken',
  };

  const typeLabels = {
    monitoring: 'MONITORING',
    risk: 'RISK',
    recovery: 'RECOVERY',
    booking: 'BOOKING',
    system: 'SYSTEM',
    disruption: 'DISRUPTION',
  };

  return (
    <div>
      <PageHeader title="Activity" description="A clear history of what SafarSathi detected, changed and recovered." crumbs={['More','Activity']} onNavigate={onNavigate} />
      <div className="mb-5 flex items-center justify-end">
        <div className="flex items-center gap-2 rounded-lg border border-safar-safe/20 bg-safar-safe/5 px-3 py-1.5">
          <Radio className="h-3.5 w-3.5 text-safar-safe animate-pulse-soft" />
          <span className="text-xs font-medium text-safar-safe">Live feed</span>
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        {activityLog.length === 0 ? (
          <div className="p-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-safar-safe"/><div className="mt-3 text-sm font-semibold text-slate-900">Nothing to review yet</div><p className="mt-1 text-xs text-slate-600">SafarSathi will record disruptions, risk alerts and recovery actions here.</p></div>
        ) : (
          <div className="divide-y divide-slate-200">
            {activityLog.map((event, i) => (
              <div
                key={event.id}
                className="flex items-start gap-4 p-4 transition hover:bg-slate-50 animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex flex-col items-center shrink-0">
                  <span className={cn('h-2.5 w-2.5 rounded-full', typeIcons[event.type])} />
                  {i < activityLog.length - 1 && <span className="h-8 w-px bg-slate-200 mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider',
                      event.type === 'disruption' ? 'bg-safar-broken/10 text-safar-broken' :
                      event.type === 'recovery' ? 'bg-safar-blue/10 text-safar-blue' :
                      event.type === 'risk' ? 'bg-safar-risk/10 text-safar-risk' :
                      event.type === 'booking' ? 'bg-safar-blue/10 text-safar-blue' :
                      event.type === 'monitoring' ? 'bg-safar-safe/10 text-safar-safe' :
                      'bg-slate-200 text-slate-500'
                    )}>
                      {typeLabels[event.type]}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{event.message}</span>
                  </div>
                  {event.detail && <p className="mt-1 text-xs text-slate-600">{event.detail}</p>}
                </div>
                <span className="text-xs font-mono text-slate-500 shrink-0">{event.timestamp}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
