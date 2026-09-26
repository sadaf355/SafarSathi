import { useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { ItineraryGraph } from '@/components/graph/ItineraryGraph';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { Calendar, Map, GitBranch, Plane, Hotel, Car, Mountain, X, ArrowRight, AlertTriangle, Plus } from 'lucide-react';
import { AddFlightModal } from '@/components/trip/AddFlightModal';
import { AddAccommodationModal } from '@/components/trip/AddAccommodationModal';
import { AddActivityModal } from '@/components/trip/AddActivityModal';
import type { ItineraryNodeData } from '@/types';

interface JourneyPageProps { onNavigate: (page: string) => void; }
const iconFor = { flight: Plane, hotel: Hotel, transfer: Car, activity: Mountain, connection: ArrowRight, return: Plane };

export function JourneyPage({ onNavigate }: JourneyPageProps) {
  const { trip } = useApp();
  const [view, setView] = useState<'timeline' | 'graph' | 'map'>('timeline');
  const [selected, setSelected] = useState<ItineraryNodeData | null>(null);
  const [adding, setAdding] = useState<'flight' | 'hotel' | 'activity' | null>(null);
  const closeAdd = () => setAdding(null);
  const coordinates = trip.nodes.filter((n) => n.lat != null && n.lng != null);
  const mapBounds = useMemo(() => {
    if (!coordinates.length) return { minLng: 68, minLat: 7, maxLng: 90, maxLat: 37 };
    const lats = coordinates.map((n) => n.lat!); const lngs = coordinates.map((n) => n.lng!);
    return { minLng: Math.min(...lngs) - 3, maxLng: Math.max(...lngs) + 3, minLat: Math.min(...lats) - 3, maxLat: Math.max(...lats) + 3 };
  }, [coordinates]);
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds.minLng},${mapBounds.minLat},${mapBounds.maxLng},${mapBounds.maxLat}&layer=mapnik`;

  return <div>
    <PageHeader title="Your Journey" description="See your itinerary, live status and dependencies in one calm view." crumbs={['Home', 'Journey']} onNavigate={onNavigate} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-card">
      <div className="flex rounded-xl bg-slate-100 p-1">
        {([['timeline','Timeline',Calendar],['graph','Dependencies',GitBranch],['map','Map',Map]] as const).map(([id,label,Icon]) => <button key={id} onClick={() => setView(id)} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold', view === id ? 'bg-white text-safar-blue shadow-sm' : 'text-slate-600 hover:text-slate-900')}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="px-2 text-xs text-slate-500">{trip.nodes.length} bookings · {trip.days.length} days</span>
        {([['flight','Flight'],['hotel','Hotel'],['activity','Activity']] as const).map(([kind,label]) => <button key={kind} onClick={() => setAdding(kind)} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-safar-blue/40 hover:bg-safar-blue/5 hover:text-slate-900"><Plus className="h-3.5 w-3.5" />{label}</button>)}
      </div>
    </div>
    <AddFlightModal open={adding === 'flight'} onClose={closeAdd} onAdded={closeAdd} />
    <AddAccommodationModal open={adding === 'hotel'} onClose={closeAdd} onAdded={closeAdd} />
    <AddActivityModal open={adding === 'activity'} onClose={closeAdd} onAdded={closeAdd} />

    {trip.nodes.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No bookings yet. Add a flight, hotel or activity above to start monitoring this trip.</div>}

    {view === 'timeline' && <div className="space-y-3">{trip.nodes.map((node, index) => <button key={node.id} onClick={() => setSelected(node)} className="group flex w-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-card transition hover:border-safar-blue/30 hover:-translate-y-0.5">
      <div className="flex w-14 shrink-0 flex-col items-center"><span className="rounded-xl bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Day {node.day}</span>{index < trip.nodes.length - 1 && <span className="mt-2 h-10 w-px bg-slate-200" />}</div>
      <div className="flex min-w-0 flex-1 items-start gap-3"><div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', node.status === 'at-risk' ? 'bg-safar-saffron/10 text-safar-saffron' : node.status === 'broken' ? 'bg-safar-broken/10 text-safar-broken' : 'bg-safar-blue/10 text-safar-blue')}>{(() => { const Icon = iconFor[node.category]; return <Icon className="h-5 w-5" />; })()}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{node.title}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', node.status === 'healthy' ? 'bg-safar-safe/10 text-safar-safe' : node.status === 'at-risk' ? 'bg-safar-saffron/10 text-safar-saffron' : node.status === 'broken' ? 'bg-safar-broken/10 text-safar-broken' : 'bg-slate-100 text-slate-600')}>{node.status === 'healthy' ? 'On track' : node.status.replace('-', ' ')}</span></div><div className="mt-1 text-xs text-slate-500">{node.provider} · {node.scheduledTime}</div><div className="mt-2 text-xs text-slate-600 line-clamp-2">{node.description || node.location}</div></div></div><ArrowRight className="mt-2 h-4 w-4 text-slate-400 transition group-hover:text-safar-blue" /></button>)}</div>}

    {view === 'graph' && <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card"><div className="mb-3 flex items-center justify-between px-2"><div><h2 className="font-semibold text-slate-900">Dependency view</h2><p className="text-xs text-slate-500">Use this view when you want to understand why one booking affects another.</p></div><button onClick={() => onNavigate('impact')} className="text-xs font-semibold text-safar-blue">Open impact analysis →</button></div><div className="h-[600px]"><ItineraryGraph nodes={trip.nodes} edges={trip.edges} /></div></div>}

    {view === 'map' && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><div className="relative h-[600px]"><iframe title="SafarSathi live journey map" src={mapUrl} className="h-full w-full border-0" loading="lazy"/><svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="none"><polyline fill="none" stroke="#2563EB" strokeWidth="4" strokeDasharray="10 8" points={coordinates.map(n=>{const x=((n.lng!-mapBounds.minLng)/(mapBounds.maxLng-mapBounds.minLng))*1000;const y=(1-(n.lat!-mapBounds.minLat)/(mapBounds.maxLat-mapBounds.minLat))*600;return `${x},${y}`}).join(' ')}/></svg>{coordinates.map(n=>{const x=((n.lng!-mapBounds.minLng)/(mapBounds.maxLng-mapBounds.minLng))*100;const y=(1-(n.lat!-mapBounds.minLat)/(mapBounds.maxLat-mapBounds.minLat))*100;return <button key={n.id} onClick={()=>setSelected(n)} className={cn('absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white p-1.5 shadow-lg',n.status==='at-risk'?'bg-safar-saffron':n.status==='broken'?'bg-safar-broken':'bg-safar-blue')} style={{left:`${x}%`,top:`${y}%`}} aria-label={`Open ${n.title}`}><span className="block h-2 w-2 rounded-full bg-white"/></button>})}<div className="absolute left-4 top-4 rounded-xl bg-white/95 p-3 shadow-card"><div className="text-xs font-semibold text-slate-900">Live journey map</div><div className="mt-1 text-[11px] text-slate-500">Real coordinates · OpenStreetMap tiles</div></div><div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto">{coordinates.map(n => <button key={n.id} onClick={() => setSelected(n)} className="shrink-0 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-left shadow-card"><div className="text-xs font-semibold text-slate-900">{n.title}</div><div className="text-[10px] text-slate-500">{n.lat?.toFixed(2)}, {n.lng?.toFixed(2)}</div></button>)}</div></div></div>}

    {selected && <div className="fixed inset-0 z-[120] bg-safar-navy/10" onClick={() => setSelected(null)}><aside className="absolute right-0 top-0 h-full w-full max-w-md animate-slide-in-right border-l border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Booking details</div><h2 className="mt-1 text-xl font-bold text-slate-900">{selected.title}</h2></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><Detail label="Provider" value={selected.provider} /><Detail label="Scheduled" value={selected.scheduledTime} /><Detail label="Location" value={selected.location} /><Detail label="Cost" value={`₹${selected.cost.toLocaleString('en-IN')}`} /><Detail label="Dependencies" value={`${selected.dependencyCount} downstream`} />{selected.reason && <div className="rounded-xl border border-safar-saffron/30 bg-safar-saffron/5 p-4"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-safar-saffron"/><div><div className="text-xs font-semibold text-slate-900">Why this is at risk</div><p className="mt-1 text-xs leading-5 text-slate-600">{selected.reason}</p></div></div></div>}<button onClick={() => onNavigate('impact')} className="w-full rounded-xl bg-safar-blue py-3 text-sm font-semibold text-white">View impact analysis</button></div></aside></div>}
  </div>;
}
function Detail({label,value}:{label:string;value:string}) { return <div className="flex items-center justify-between border-b border-slate-100 pb-3"><span className="text-xs text-slate-500">{label}</span><span className="text-sm font-medium text-slate-900">{value}</span></div>; }
