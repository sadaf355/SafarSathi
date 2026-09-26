import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/AppContext';
import { disruptionTypes } from '@/data/mockData';
import * as api from '@/services/api';
import {
  Clock,
  XCircle,
  Link2Off,
  Bed,
  CalendarX,
  PlaneLanding,
  CloudLightning,
  AlertTriangle,
  ArrowRight,
  Zap,
  Loader2,
} from 'lucide-react';
import type { DisruptionType } from '@/types';

const iconMap: Record<string, typeof Clock> = {
  clock: Clock,
  'x-circle': XCircle,
  'link-x': Link2Off,
  bed: Bed,
  'calendar-x': CalendarX,
  'plane-landing': PlaneLanding,
  'cloud-lightning': CloudLightning,
};

const DELAY_BASED_TYPES = new Set(['flight-delay', 'activity-delay']);

interface DisruptionModalProps {
  open: boolean;
  onClose: () => void;
}

export function DisruptionModal({ open, onClose }: DisruptionModalProps) {
  const { triggerDisruption, tripId, isBusy, trip } = useApp();
  const [selected, setSelected] = useState<DisruptionType['id']>('flight-delay');
  const [delayHours, setDelayHours] = useState(3);
  const [preview, setPreview] = useState<api.PropagationResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [smartText, setSmartText] = useState('');
  const [understood, setUnderstood] = useState<{ label: string; nodeId?: string } | null>(null);

  const delayMinutes = DELAY_BASED_TYPES.has(selected) ? delayHours * 60 : undefined;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewLoading(true);
    api
      .simulateDisruption(tripId, { type: selected, delayMinutes })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tripId, selected, delayMinutes]);


  const analyzeSmartReport = () => {
    const text = smartText.toLowerCase();
    const hoursMatch = text.match(/(\d+(?:\.5)?)\s*(?:hour|hours|hr|hrs|h)/);
    const minutesMatch = text.match(/(\d+)\s*(?:minute|minutes|min|mins|m)/);
    const minutes = hoursMatch ? Math.round(Number(hoursMatch[1]) * 60) : minutesMatch ? Number(minutesMatch[1]) : 180;
    const node = trip.nodes.find((n) => text.includes(n.title.toLowerCase()) || text.includes(n.label.toLowerCase()) || text.includes(n.provider.toLowerCase()));
    const isWeather = /storm|snow|fog|flood|cyclone|weather|monsoon|blizzard/.test(text);
    const type = isWeather ? 'weather-disruption' : text.includes('cancel') ? 'flight-cancellation' : text.includes('miss') && text.includes('connection') ? 'missed-connection' : text.includes('hotel') ? 'hotel-conflict' : 'flight-delay';
    setSelected(type as DisruptionType['id']);
    if (DELAY_BASED_TYPES.has(type)) setDelayHours(Math.max(1, Math.min(6, Math.round(minutes / 60))));
    setUnderstood({ label: node ? `${node.title} · ${DELAY_BASED_TYPES.has(type) ? `Delayed by ${Math.round(minutes/60)}h` : 'Disruption detected'}` : `${type.split('-').join(' ')} · ${Math.round(minutes/60)}h`, nodeId: node?.id });
  };

  const handleTrigger = async () => {
    onClose();
    await triggerDisruption(selected, { delayMinutes, primaryNodeId: understood?.nodeId });
  };

  const affectedCount = preview ? preview.impacts.filter((i) => i.status !== 'healthy').length : null;

  return (
    <Modal open={open} onClose={onClose} title="Report a problem" subtitle="Tell SafarSathi what happened — we will translate it into a disruption." className="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-safar-blue/20 bg-safar-blue/5 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-safar-blue">Smart reporting</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">What happened?</div>
          <div className="mt-3 flex gap-2">
            <textarea value={smartText} onChange={(e)=>{setSmartText(e.target.value);setUnderstood(null)}} rows={2} placeholder="e.g. My Mumbai to Delhi flight is delayed by 3 hours." className="min-h-20 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-safar-blue focus:outline-none"/>
            <button onClick={analyzeSmartReport} disabled={!smartText.trim()} className="self-end rounded-xl bg-safar-blue px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Analyze</button>
          </div>
          {understood && <div className="mt-3 rounded-lg border border-safar-safe/20 bg-white p-3 text-xs"><div className="font-semibold text-slate-900">I understood</div><div className="mt-1 text-slate-600">{understood.label}</div><div className="mt-2 text-[10px] text-slate-500">Review the details below before confirming.</div></div>}
        </div>

        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Or report manually</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {disruptionTypes.map((dt) => {
            const Icon = iconMap[dt.icon] ?? AlertTriangle;
            const active = selected === dt.id;
            return (
              <button
                key={dt.id}
                onClick={() => setSelected(dt.id)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all',
                  active ? 'border-safar-blue/40 bg-safar-blue/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-safar-blue' : 'text-slate-600')} />
                <div>
                  <div className={cn('text-xs font-medium', active ? 'text-slate-900' : 'text-slate-800')}>{dt.label}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500 line-clamp-2">{dt.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {DELAY_BASED_TYPES.has(selected) && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-900">Delay by</span>
              <span className="text-lg font-bold text-safar-blue">{delayHours}h</span>
            </div>
            <input
              type="range"
              min={1}
              max={6}
              value={delayHours}
              onChange={(e) => setDelayHours(Number(e.target.value))}
              className="w-full" style={{ accentColor: '#2563EB' }}
            />
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>1h</span>
              <span>3h (recommended demo)</span>
              <span>6h</span>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Computed impact preview</div>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running propagation engine...
            </div>
          ) : preview ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-slate-500">Impact level</div>
                <div className={cn('text-sm font-semibold', preview.disruption.impactLevel === 'low' ? 'text-safar-safe' : preview.disruption.impactLevel === 'medium' ? 'text-safar-risk' : 'text-safar-broken')}>
                  {preview.disruption.impactLevel.toUpperCase()}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Downstream</div>
                <div className="text-sm text-slate-900">{affectedCount} node(s) affected</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Could not reach the backend to preview this scenario.</div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-safar-risk/5 border border-safar-risk/20 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-safar-risk" />
          <p className="text-[11px] text-slate-700">
            This will trigger the disruption cascade animation and generate recovery strategies from the backend.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-900">
            Cancel
          </button>
          <button
            onClick={handleTrigger}
            disabled={isBusy}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition',
              !isBusy
                ? 'bg-gradient-to-r from-safar-broken to-safar-saffron hover:brightness-110 shadow-card'
                : 'bg-slate-300 cursor-not-allowed opacity-50'
            )}
          >
            <Zap className="h-4 w-4" />
            Confirm Disruption
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
