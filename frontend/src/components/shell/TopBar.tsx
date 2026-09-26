import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/AppContext';
import * as api from '@/services/api';
import {
  Bell,
  ChevronDown,
  Sparkles,
  Plane,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Info,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { PageId } from '@/components/shell/Sidebar';

interface TopBarProps {
  current: PageId;
  onOpenAI: () => void;
  onRunDemo: () => void;
  onReset: () => void;
}

const pageLabels: Record<PageId, string> = {
  overview: 'Home',
  journey: 'Journey',
  risk: 'Risks',
  trips: 'Trips',
  sathi: 'Sathi AI',
  more: 'More',
  impact: 'Impact',
  recovery: 'Recovery',
};

export function TopBar({ current, onOpenAI, onRunDemo, onReset }: TopBarProps) {
  const { trip, tripId, switchTrip, phase, notifications, unreadCount, markNotificationsRead, demoRunning } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [otherTrips, setOtherTrips] = useState<api.TripSummary[] | null>(null);
  const [otherTripsError, setOtherTripsError] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const tripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (tripRef.current && !tripRef.current.contains(e.target as Node)) setTripOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!tripOpen) return;
    let cancelled = false;
    setOtherTripsError(false);
    api
      .listTrips()
      .then((data) => {
        if (!cancelled) setOtherTrips(data.filter((t) => t.id !== tripId));
      })
      .catch(() => {
        if (!cancelled) {
          setOtherTrips(null);
          setOtherTripsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tripOpen, tripId]);

  const phaseLabel = {
    idle: { text: 'Monitoring normally', color: 'text-safar-safe', dot: 'bg-safar-safe' },
    disrupted: { text: 'Disruption detected', color: 'text-safar-broken', dot: 'bg-safar-broken' },
    analyzing: { text: 'Analyzing impact', color: 'text-safar-risk', dot: 'bg-safar-risk' },
    recovering: { text: 'Recovery options ready', color: 'text-safar-blue', dot: 'bg-safar-sky' },
    recovered: { text: 'Recovery applied', color: 'text-safar-blue', dot: 'bg-safar-sky' },
  }[phase];

  const notifIcons = {
    high: <AlertTriangle className="h-4 w-4 text-safar-broken" />,
    medium: <AlertTriangle className="h-4 w-4 text-safar-risk" />,
    low: <Info className="h-4 w-4 text-slate-600" />,
    system: <CheckCircle2 className="h-4 w-4 text-safar-safe" />,
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-slate-50/90 backdrop-blur-xl px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">{pageLabels[current]}</span>
        </div>

        <div className="hidden h-5 w-px bg-slate-300 sm:block" />

        <div ref={tripRef} className="relative">
          <button
            onClick={() => setTripOpen(!tripOpen)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition hover:bg-slate-50"
          >
            <Plane className="h-4 w-4 text-safar-blue" />
            <span className="text-sm font-medium text-slate-900">{trip.name}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-slate-600 transition', tripOpen && 'rotate-180')} />
          </button>
          {tripOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 glass-strong rounded-xl shadow-2xl p-3 animate-scale-in">
              <div className="px-2 py-1.5">
                <div className="text-xs font-medium text-slate-900">{trip.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                  <MapPin className="h-3 w-3" />
                  {trip.route} · {trip.startDate} — {trip.endDate}
                </div>
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2">
                <div className="px-2 py-1.5 text-[11px] text-slate-500">Other trips</div>
                {otherTripsError ? (
                  <div className="px-2 py-2 text-xs text-safar-broken">Couldn't load other trips.</div>
                ) : otherTrips === null ? (
                  <div className="px-2 py-2 text-xs text-slate-600 italic">Loading...</div>
                ) : otherTrips.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-slate-600 italic">No other trips planned</div>
                ) : (
                  <div className="space-y-0.5">
                    {otherTrips.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          switchTrip(t.id);
                          setTripOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50"
                      >
                        <Plane className="h-3.5 w-3.5 shrink-0 text-safar-blue" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-slate-900">{t.name}</div>
                          <div className="truncate text-[10px] text-slate-500">{t.route}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 md:flex">
          <span className={cn('h-2 w-2 rounded-full', phaseLabel.dot, 'animate-pulse-soft')} />
          <span className={cn('text-xs font-medium', phaseLabel.color)}>{phaseLabel.text}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {trip.resettable && phase !== 'idle' && !demoRunning && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Reset trip"
            title="Reset trip to healthy state"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        )}

        {trip.resettable && <button
          onClick={onRunDemo}
          disabled={demoRunning}
          className={cn(
            'hidden items-center gap-2 rounded-lg border border-safar-blue/30 bg-safar-blue/10 px-3 py-1.5 text-xs font-medium text-safar-blue transition hover:bg-safar-blue/20 sm:flex',
            demoRunning && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Play className="h-3.5 w-3.5" />
          {demoRunning ? 'Demo Running...' : 'Run Disruption Demo'}
        </button>}

        <div ref={notifRef} className="relative">
          <button
            onClick={() => {
              setNotifOpen(!notifOpen);
              if (!notifOpen) markNotificationsRead();
            }}
            className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-safar-sky opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-safar-sky" />
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 glass-strong rounded-xl shadow-2xl animate-scale-in overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Notifications</div>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {notifications.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-slate-500">You're all caught up - no notifications.</div>
                )}
                {notifications.map((n) => (
                  <div key={n.id} className="border-b border-slate-200 px-4 py-3 last:border-0 transition hover:bg-slate-50">
                    <div className="flex items-start gap-3">
                      {notifIcons[n.severity]}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-900">{n.title}</div>
                        <div className="mt-0.5 text-[11px] text-slate-600 line-clamp-2">{n.message}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{n.timestamp}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onOpenAI}
          aria-label="Ask Sathi"
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-safar-blue to-safar-blue px-3 py-1.5 text-xs font-medium text-white shadow-card transition hover:brightness-110"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ask Sathi</span>
        </button>
      </div>
    </header>
  );
}
