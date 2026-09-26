import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { CreateTripModal } from '@/components/trip/CreateTripModal';
import { formatCurrency } from '@/lib/status';
import * as api from '@/services/api';
import { Plane, MapPin, Calendar, ArrowRight, Plus, AlertTriangle } from 'lucide-react';

interface TripsProps {
  onNavigate: (page: string) => void;
}

function statusFor(status: string): 'healthy' | 'recovered' | 'broken' {
  return status === 'operational' ? 'healthy' : status === 'recovered' ? 'recovered' : 'broken';
}

export function Trips({ onNavigate }: TripsProps) {
  const { trip, tripId, switchTrip, noTripFound } = useApp();
  const [summaries, setSummaries] = useState<api.TripSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const hasCurrentTrip = !noTripFound;

  const loadTrips = () => {
    let cancelled = false;
    setLoadError(null);
    api
      .listTrips()
      .then((data) => {
        if (!cancelled) setSummaries(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setSummaries(null);
          setLoadError(err instanceof api.ApiError ? err.message : 'Could not load your other trips.');
        }
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(loadTrips, [trip.healthScore]);
  // Re-fetch when the active trip's health score changes so the "current
  // trip" summary card (if it appears in the other-trips list too) stays
  // in sync without a manual refresh.

  const otherTrips = hasCurrentTrip ? (summaries ?? []).filter((s) => s.id !== tripId) : (summaries ?? []);

  const handleSwitch = (id: string) => {
    switchTrip(id);
    onNavigate('journey');
  };

  return (
    <div>
      <PageHeader title="My Trips" description="Manage your journeys and choose which trip SafarSathi should monitor." crumbs={['Home','Trips']} onNavigate={onNavigate} />
      <div className="flex items-center justify-end mb-5">
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-safar-blue/40 hover:bg-safar-blue/5 hover:text-slate-900"
        >
          <Plus className="h-3.5 w-3.5" />
          New Trip
        </button>
      </div>

      <CreateTripModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          loadTrips();
          onNavigate('journey');
        }}
      />

      {hasCurrentTrip && (
        <div className="glass rounded-xl p-5 hover:border-slate-500/40 transition cursor-pointer" onClick={() => onNavigate('journey')}>
          <div className="flex items-start gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-safar-blue/20 to-safar-blue/10 border border-safar-blue/20">
              <Plane className="h-7 w-7 text-safar-blue" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-900">{trip.name}</h2>
                <StatusBadge status={statusFor(trip.status)} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {trip.route}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {trip.startDate} — {trip.endDate}</span>
                <span>{trip.nodes.length} nodes · {trip.edges.length} dependencies</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <TripStat label="Trip value" value={formatCurrency(trip.tripValue)} />
                <TripStat label="Nodes" value={`${trip.nodes.length}`} />
                <TripStat label="Days" value={`${trip.days.length}`} />
                <TripStat label="Status" value={trip.status === 'operational' ? 'Operational' : trip.status === 'recovered' ? 'Recovered' : 'Disrupted'} valueClass={trip.status === 'operational' ? 'text-safar-safe' : trip.status === 'recovered' ? 'text-safar-blue' : 'text-safar-broken'} />
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <ScoreRing score={trip.healthScore} size={80} strokeWidth={6} label="Health" />
              <button onClick={() => onNavigate('journey')} className="flex items-center gap-1 text-[10px] text-safar-blue transition hover:text-safar-blue">
                View details <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="glass flex flex-col items-center gap-3 rounded-xl border border-safar-broken/20 p-8 text-center">
          <AlertTriangle className="h-6 w-6 text-safar-broken" />
          <p className="text-sm text-slate-900">{loadError}</p>
          <button
            onClick={loadTrips}
            className="rounded-lg border border-safar-broken/30 px-3 py-1.5 text-xs font-medium text-safar-broken transition hover:bg-safar-broken/10"
          >
            Retry
          </button>
        </div>
      ) : summaries === null ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : otherTrips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white">
            <Plus className="h-5 w-5 text-slate-500" />
          </div>
          <p className="text-sm text-slate-600">{hasCurrentTrip ? 'No other trips planned yet.' : "You don't have any trips yet."}</p>
          <p className="mt-1 text-xs text-slate-500">Add a new trip to start monitoring its dependencies.</p>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{hasCurrentTrip ? 'Other Trips' : 'Your Trips'}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {otherTrips.map((summary) => (
              <button
                key={summary.id}
                onClick={() => handleSwitch(summary.id)}
                className="glass flex items-start gap-3 rounded-xl p-4 text-left transition hover:border-slate-500/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-safar-blue/20 to-safar-blue/10 border border-safar-blue/20">
                  <Plane className="h-5 w-5 text-safar-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{summary.name}</span>
                    <StatusBadge status={statusFor(summary.status)} size="sm" />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {summary.route}</span>
                    <span>{summary.startDate} — {summary.endDate}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-600">
                    <span>{formatCurrency(summary.tripValue)}</span>
                    <span>{summary.nodeCount} nodes</span>
                    <span className={cn('font-medium', summary.healthScore >= 70 ? 'text-safar-safe' : summary.healthScore >= 40 ? 'text-safar-risk' : 'text-safar-broken')}>
                      {summary.healthScore}/100 health
                    </span>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TripStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/60 p-2.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold', valueClass ?? 'text-slate-900')}>{value}</div>
    </div>
  );
}
