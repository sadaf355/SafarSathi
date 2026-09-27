import type {
  ActivityEvent,
  Alert,
  Booking,
  Disruption,
  DependencyEdgeData,
  ItineraryNodeData,
  Notification,
  RecoveryOption,
  TravelerPreferences,
  Trip,
  TripDay,
} from '@/types';
import type { DigitalTwinApplyResult, DigitalTwinSimulation, RiskAnalysis, WeatherScenarioRequest } from '@/services/api';
import { defaultPreferences } from '@/data/mockData';
import { nodeKind, parseEndpoints } from '@/lib/journey';
import { liveSignals, simulateTwin, tripWeather } from '@/services/demoTwin';

/** Offline demo data source. It implements the same contract as the FastAPI
 * backend (see services/api.ts) over in-memory state, so every screen stays
 * interactive when the backend is unreachable. It is only used when the
 * traveler explicitly chooses "Explore offline demo"; live sessions always
 * talk to the real API. */

export class DemoNotFoundError extends Error {}
/** The request conflicts with the trip's current state (HTTP 409 on the live API). */
export class DemoConflictError extends Error {}

const DEMO_PROFILE = {
  travelerId: 'demo-traveler',
  name: 'Aayush Sharma',
  email: 'aayush@safarsathi.demo',
  homeAirport: 'Mumbai (BOM)',
  loyaltyTier: 'Premium',
};

interface DemoEdge extends DependencyEdgeData { requiredBuffer: number }
const toEdgeData = (e: DemoEdge): DependencyEdgeData => ({ id: e.id, source: e.source, target: e.target, status: e.status, label: e.label, animated: e.animated });
interface DemoTripState {
  trip: Trip;
  edges: DemoEdge[];
  disruption: Disruption | null;
  options: RecoveryOption[];
  activity: ActivityEvent[];
  notifications: Notification[];
  preferences: TravelerPreferences;
  build: () => Pick<DemoTripState, 'trip' | 'edges'>;
}

// ---- Time helpers ------------------------------------------------------------

const DAY = 86_400_000;
function at(dayOffset: number, hh: number, mm = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + dayOffset * DAY + (hh * 60 + mm) * 60_000);
}
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const dateLabel = (d: Date) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const nowStamp = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const wait = (ms = 320) => new Promise<void>((r) => setTimeout(r, ms));

type NodeSeed = Omit<ItineraryNodeData, 'scheduledTime' | 'scheduledStart' | 'scheduledEnd' | 'riskLevel' | 'dependencyCount' | 'status' | 'day'> & {
  start: Date; end: Date; dayOffset: number; tripStart: number;
};
function node(seed: NodeSeed): ItineraryNodeData {
  const { start, end, dayOffset, tripStart, ...rest } = seed;
  const sameDay = start.toDateString() === end.toDateString();
  return {
    ...rest,
    scheduledStart: iso(start),
    scheduledEnd: iso(end),
    scheduledTime: sameDay ? `${dayLabel(start)} · ${hm(start)}–${hm(end)}` : `${dayLabel(start)} · ${hm(start)} — ${dayLabel(end)} · ${hm(end)}`,
    riskLevel: 12,
    dependencyCount: 0,
    status: 'healthy',
    day: dayOffset - tripStart + 1,
    actualStart: null,
    actualEnd: null,
    reason: null,
    causedBy: null,
  };
}

function finalizeTrip(base: Omit<Trip, 'nodes' | 'edges' | 'days'>, nodes: ItineraryNodeData[], edges: DemoEdge[], startOffset: number, days: number): Pick<DemoTripState, 'trip' | 'edges'> {
  const downstream = (id: string, seen = new Set<string>()): number => {
    edges.filter((e) => e.source === id && !seen.has(e.target)).forEach((e) => { seen.add(e.target); downstream(e.target, seen); });
    return seen.size;
  };
  nodes.forEach((n) => { n.dependencyCount = downstream(n.id); });
  const tripDays: TripDay[] = Array.from({ length: days }, (_, i) => {
    const d = at(startOffset + i, 0);
    const dayNodes = nodes.filter((n) => n.day === i + 1);
    return { day: i + 1, date: dayLabel(d), title: dayNodes[0]?.title ?? 'Free day', summary: dayNodes.map((n) => n.label).join(' · ') || 'Explore at your own pace', nodeIds: dayNodes.map((n) => n.id) };
  });
  return { trip: { ...base, nodes, edges: edges.map(toEdgeData), days: tripDays }, edges };
}

// ---- Demo trips ----------------------------------------------------------------

function buildGoldenTriangle() {
  const s = 0;
  const nodes = [
    node({ id: 'bom-del', category: 'flight', label: 'BOM → DEL', title: 'Mumbai → Delhi', subtitle: 'IndiGo 6E 2173', location: 'Mumbai (BOM)', provider: 'IndiGo', confirmation: '6E2173-QX4', cost: 6400, cancellationPolicy: 'Refundable up to 24h before departure', refundable: true, refundAmount: 3200, icon: 'plane', lat: 19.0896, lng: 72.8656, start: at(s, 8, 0), end: at(s, 10, 15), dayOffset: s, tripStart: s }),
    node({ id: 'del-connection', category: 'connection', label: 'DEL → NDLS', title: 'Delhi Airport → New Delhi Station', subtitle: 'Airport Express Metro', location: 'Delhi (DEL) T1', provider: 'Delhi Metro', cost: 0, cancellationPolicy: 'N/A', refundable: false, icon: 'timer', lat: 28.5562, lng: 77.1, start: at(s, 10, 15), end: at(s, 11, 5), dayOffset: s, tripStart: s }),
    node({ id: 'del-agc', category: 'train', label: 'NDLS → AGC', title: 'Delhi → Agra', subtitle: 'Gatimaan Express 12050', location: 'New Delhi (NDLS)', provider: 'Indian Railways', confirmation: 'PNR 482 331 9087', cost: 1450, cancellationPolicy: 'Partial refund up to 4h before departure', refundable: true, refundAmount: 725, icon: 'train', lat: 28.6431, lng: 77.2197, start: at(s, 13, 25), end: at(s, 15, 5), dayOffset: s, tripStart: s }),
    node({ id: 'agc-transfer', category: 'transfer', label: 'AGC → Hotel', title: 'Agra Cantt → Taj Hotel', subtitle: 'Private car · Agra Cabs', location: 'Agra (AGC)', provider: 'Agra Cabs', confirmation: 'AC-7731', cost: 850, cancellationPolicy: 'Free cancellation up to 1h before', refundable: true, refundAmount: 850, icon: 'car', lat: 27.1592, lng: 77.9905, start: at(s, 15, 20), end: at(s, 15, 50), dayOffset: s, tripStart: s }),
    node({ id: 'taj-hotel', category: 'hotel', label: 'Taj Hotel', title: 'Taj Hotel & Convention Centre', subtitle: 'Check-in 16:00', location: 'Agra', provider: 'Taj Hotels', confirmation: 'TAJ-55190', cost: 21600, cancellationPolicy: 'Free until 48h before check-in', refundable: true, refundAmount: 16200, icon: 'bed', lat: 27.1649, lng: 78.0445, start: at(s, 16, 0), end: at(s + 3, 11, 0), dayOffset: s, tripStart: s }),
    node({ id: 'taj-sunrise', category: 'activity', label: 'Taj Mahal', title: 'Taj Mahal Sunrise Tour', subtitle: 'Guided · 06:00 start', location: 'Agra', provider: 'Agra Heritage Walks', confirmation: 'AHW-2210', cost: 2200, cancellationPolicy: 'Strict. No refund within 24h.', refundable: false, refundAmount: 0, icon: 'mountain', lat: 27.1751, lng: 78.0421, start: at(s + 1, 6, 0), end: at(s + 1, 9, 0), dayOffset: s + 1, tripStart: s }),
    node({ id: 'agra-fort', category: 'activity', label: 'Agra Fort', title: 'Agra Fort & Mehtab Bagh', subtitle: 'Afternoon tour', location: 'Agra', provider: 'Agra Heritage Walks', confirmation: 'AHW-2211', cost: 1600, cancellationPolicy: 'Moderate. 50% refund within 24h.', refundable: true, refundAmount: 800, icon: 'mountain', lat: 27.1795, lng: 78.0211, start: at(s + 2, 14, 0), end: at(s + 2, 18, 0), dayOffset: s + 2, tripStart: s }),
    node({ id: 'agr-bom', category: 'return', label: 'AGR → BOM', title: 'Agra → Mumbai', subtitle: 'IndiGo 6E 5042', location: 'Agra (AGR)', provider: 'IndiGo', confirmation: '6E5042-PL2', cost: 5900, cancellationPolicy: 'Refundable up to 24h before departure', refundable: true, refundAmount: 2950, icon: 'plane', lat: 27.1557, lng: 77.9609, start: at(s + 3, 15, 30), end: at(s + 3, 17, 40), dayOffset: s + 3, tripStart: s }),
  ];
  const edges: DemoEdge[] = [
    { id: 'gt-e1', source: 'bom-del', target: 'del-connection', status: 'healthy', requiredBuffer: 0 },
    { id: 'gt-e2', source: 'del-connection', target: 'del-agc', status: 'healthy', requiredBuffer: 30 },
    { id: 'gt-e3', source: 'del-agc', target: 'agc-transfer', status: 'healthy', requiredBuffer: 10 },
    { id: 'gt-e4', source: 'agc-transfer', target: 'taj-hotel', status: 'healthy', requiredBuffer: 0 },
    { id: 'gt-e5', source: 'taj-hotel', target: 'taj-sunrise', status: 'healthy', requiredBuffer: 0 },
    { id: 'gt-e6', source: 'taj-hotel', target: 'agra-fort', status: 'healthy', requiredBuffer: 0 },
    { id: 'gt-e7', source: 'taj-hotel', target: 'agr-bom', status: 'healthy', requiredBuffer: 0 },
  ];
  return finalizeTrip({ id: 'demo-golden-triangle', name: 'Golden Triangle Getaway', travelerName: 'Aayush', route: 'Mumbai → Delhi → Agra', origin: 'Mumbai', destination: 'Agra', startDate: dateLabel(at(s, 0)), endDate: dateLabel(at(s + 3, 0)), tripValue: 40000, healthScore: 94, status: 'operational' }, nodes, edges, s, 4);
}

function buildRiviera() {
  const s = 13;
  const nodes = [
    node({ id: 'del-cdg', category: 'flight', label: 'DEL → CDG', title: 'Delhi → Paris', subtitle: 'Air France AF 225', location: 'Delhi (DEL)', provider: 'Air France', confirmation: 'AF225-K8M', cost: 48200, cancellationPolicy: 'Changeable with fee. 60% refundable.', refundable: true, refundAmount: 28900, icon: 'plane', lat: 28.5562, lng: 77.1, start: at(s, 13, 20), end: at(s, 19, 10), dayOffset: s, tripStart: s }),
    node({ id: 'cdg-transfer', category: 'transfer', label: 'CDG → City', title: 'CDG Airport → Hotel', subtitle: 'Private transfer · Blacklane', location: 'Paris (CDG)', provider: 'Blacklane', confirmation: 'BL-90231', cost: 6200, cancellationPolicy: 'Free cancellation up to 1h before', refundable: true, refundAmount: 6200, icon: 'car', lat: 49.0097, lng: 2.5479, start: at(s, 20, 10), end: at(s, 21, 10), dayOffset: s, tripStart: s }),
    node({ id: 'paris-hotel', category: 'hotel', label: 'Hôtel Le Marais', title: 'Hôtel Le Marais', subtitle: 'Check-in 21:30', location: 'Paris', provider: 'Hôtel Le Marais', confirmation: 'HLM-3321', cost: 38400, cancellationPolicy: 'Free until 3 days before', refundable: true, refundAmount: 38400, icon: 'bed', lat: 48.8566, lng: 2.3522, start: at(s, 21, 30), end: at(s + 3, 10, 0), dayOffset: s, tripStart: s }),
    node({ id: 'paris-nice', category: 'train', label: 'PLY → NCE', title: 'Paris → Nice', subtitle: 'TGV INOUI 6173', location: 'Paris Gare de Lyon', provider: 'SNCF', confirmation: 'SNCF-QD72LP', cost: 9800, cancellationPolicy: 'Exchangeable until departure', refundable: true, refundAmount: 7350, icon: 'train', lat: 48.8443, lng: 2.3744, start: at(s + 3, 11, 15), end: at(s + 3, 17, 2), dayOffset: s + 3, tripStart: s }),
    node({ id: 'negresco', category: 'hotel', label: 'Negresco', title: 'Hôtel Negresco, Nice', subtitle: 'Check-in 18:00', location: 'Nice', provider: 'Hôtel Negresco', confirmation: 'NEG-88410', cost: 64500, cancellationPolicy: 'Free until 7 days before', refundable: true, refundAmount: 64500, icon: 'bed', lat: 43.6948, lng: 7.2583, start: at(s + 3, 18, 0), end: at(s + 8, 11, 0), dayOffset: s + 3, tripStart: s }),
    node({ id: 'nce-del', category: 'return', label: 'NCE → DEL', title: 'Nice → Delhi', subtitle: 'Emirates EK 78 via DXB', location: 'Nice (NCE)', provider: 'Emirates', confirmation: 'EK78-ZZ31', cost: 51800, cancellationPolicy: 'Changeable with fee', refundable: true, refundAmount: 25900, icon: 'plane', lat: 43.6584, lng: 7.2159, start: at(s + 8, 15, 0), end: at(s + 9, 7, 30), dayOffset: s + 8, tripStart: s }),
  ];
  const edges: DemoEdge[] = [
    { id: 'rv-e1', source: 'del-cdg', target: 'cdg-transfer', status: 'healthy', requiredBuffer: 45 },
    { id: 'rv-e2', source: 'cdg-transfer', target: 'paris-hotel', status: 'healthy', requiredBuffer: 0 },
    { id: 'rv-e3', source: 'paris-hotel', target: 'paris-nice', status: 'healthy', requiredBuffer: 0 },
    { id: 'rv-e4', source: 'paris-nice', target: 'negresco', status: 'healthy', requiredBuffer: 0 },
    { id: 'rv-e5', source: 'negresco', target: 'nce-del', status: 'healthy', requiredBuffer: 0 },
  ];
  return finalizeTrip({ id: 'demo-riviera', name: 'Paris & Riviera', travelerName: 'Aayush', route: 'Delhi → Paris → Nice', origin: 'Delhi', destination: 'Nice', startDate: dateLabel(at(s, 0)), endDate: dateLabel(at(s + 8, 0)), tripValue: 218900, healthScore: 97, status: 'operational' }, nodes, edges, s, 9);
}

function buildSingapore() {
  const s = -20;
  const nodes = [
    node({ id: 'blr-sin', category: 'flight', label: 'BLR → SIN', title: 'Bengaluru → Singapore', subtitle: 'Singapore Airlines SQ 511', location: 'Bengaluru (BLR)', provider: 'Singapore Airlines', confirmation: 'SQ511-HT9', cost: 24300, cancellationPolicy: 'Refundable with fee', refundable: true, refundAmount: 12150, icon: 'plane', lat: 13.1986, lng: 77.7066, start: at(s, 9, 15), end: at(s, 16, 20), dayOffset: s, tripStart: s }),
    node({ id: 'mbs', category: 'hotel', label: 'Marina Bay Sands', title: 'Marina Bay Sands', subtitle: 'Check-in 18:00', location: 'Singapore', provider: 'Marina Bay Sands', confirmation: 'MBS-77120', cost: 92500, cancellationPolicy: 'Free until 72h before', refundable: true, refundAmount: 92500, icon: 'bed', lat: 1.2834, lng: 103.8607, start: at(s, 18, 0), end: at(s + 5, 11, 0), dayOffset: s, tripStart: s }),
    node({ id: 'sin-blr', category: 'return', label: 'SIN → BLR', title: 'Singapore → Bengaluru', subtitle: 'Singapore Airlines SQ 510', location: 'Singapore (SIN)', provider: 'Singapore Airlines', confirmation: 'SQ510-HT9', cost: 22100, cancellationPolicy: 'Refundable with fee', refundable: true, refundAmount: 11050, icon: 'plane', lat: 1.3644, lng: 103.9915, start: at(s + 5, 14, 30), end: at(s + 5, 16, 0), dayOffset: s + 5, tripStart: s }),
  ];
  const edges: DemoEdge[] = [
    { id: 'sg-e1', source: 'blr-sin', target: 'mbs', status: 'healthy', requiredBuffer: 60 },
    { id: 'sg-e2', source: 'mbs', target: 'sin-blr', status: 'healthy', requiredBuffer: 0 },
  ];
  return finalizeTrip({ id: 'demo-singapore', name: 'Singapore Work Trip', travelerName: 'Aayush', route: 'Bengaluru → Singapore', origin: 'Bengaluru', destination: 'Singapore', startDate: dateLabel(at(s, 0)), endDate: dateLabel(at(s + 5, 0)), tripValue: 138900, healthScore: 100, status: 'operational' }, nodes, edges, s, 6);
}

// ---- Propagation (simplified mirror of the backend engine) ---------------------

const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

function propagate(state: DemoTripState, primaryId: string, type: Disruption['type'], delayMinutes: number) {
  const { trip, edges } = state;
  const byId = new Map(trip.nodes.map((n) => [n.id, n]));
  const primary = byId.get(primaryId);
  if (!primary) throw new DemoNotFoundError('Unknown booking');
  const cancelled = type.endsWith('cancellation') || type === 'airport-closure' || type === 'weather-disruption' || type === 'transfer-failure';
  const shift = new Map<string, number>([[primaryId, cancelled ? 0 : delayMinutes]]);
  primary.status = cancelled ? 'cancelled' : 'delayed';
  primary.reason = cancelled ? `${primary.title} was cancelled by ${primary.provider}.` : `${primary.title} is running ${delayMinutes} min late.`;
  if (!cancelled && primary.scheduledStart && primary.scheduledEnd) {
    primary.actualStart = iso(addMin(new Date(primary.scheduledStart), delayMinutes));
    primary.actualEnd = iso(addMin(new Date(primary.scheduledEnd), delayMinutes));
  }
  const sequence = [primaryId];
  const queue = [primaryId];
  while (queue.length) {
    const id = queue.shift()!;
    const src = byId.get(id)!;
    for (const edge of edges.filter((e) => e.source === id)) {
      const target = byId.get(edge.target);
      if (!target || sequence.includes(target.id)) continue;
      sequence.push(target.id);
      const srcBroken = src.status === 'cancelled' || src.status === 'broken';
      const srcEnd = src.actualEnd ?? src.scheduledEnd!;
      const srcShift = shift.get(id) ?? 0;
      if (target.category === 'connection' && srcShift > 0 && !srcBroken) {
        // A connection is a transit window, not a fixed slot: it moves with the delay.
        target.actualStart = iso(addMin(new Date(target.scheduledStart!), srcShift));
        target.actualEnd = iso(addMin(new Date(target.scheduledEnd!), srcShift));
        target.status = 'delayed';
        target.causedBy = primaryId;
        target.reason = `Transit to the next leg now starts ${srcShift} min later.`;
        shift.set(target.id, srcShift);
        edge.status = 'at-risk';
        queue.push(target.id);
        continue;
      }
      const buffer = Math.round(minutesBetween(srcEnd, target.scheduledStart!));
      let status: ItineraryNodeData['status'] = 'healthy';
      if (srcBroken && src.category !== 'hotel') status = 'broken';
      else if ((shift.get(id) ?? 0) > 0 && src.category !== 'hotel') {
        if (buffer < 0) status = 'broken';
        else if (buffer < edge.requiredBuffer + 30) status = 'at-risk';
      }
      target.status = status;
      target.causedBy = status === 'healthy' ? null : primaryId;
      target.availableBufferMinutes = buffer;
      target.requiredBufferMinutes = edge.requiredBuffer + 30;
      target.reason = status === 'broken'
        ? `${src.title} now ends after ${target.title} starts - this connection can no longer be made.`
        : status === 'at-risk'
          ? `Only ${buffer} min left between ${src.title} and ${target.title}; ${edge.requiredBuffer + 30} min is recommended.`
          : null;
      edge.status = status === 'healthy' ? 'healthy' : status === 'broken' ? 'broken' : 'at-risk';
      if (status !== 'healthy') queue.push(target.id);
    }
  }
  const affected = trip.nodes.filter((n) => n.status !== 'healthy' && n.id !== primaryId);
  const exposure = affected.reduce((sum, n) => sum + n.cost, 0) + (cancelled ? primary.cost : 0);
  trip.healthScore = Math.max(38, 96 - affected.filter((n) => n.category !== 'connection').length * 8 - (cancelled ? 18 : Math.min(18, Math.round(delayMinutes / 6))));
  trip.status = 'disrupted';
  trip.edges = edges.map(toEdgeData);
  const disruption: Disruption = {
    id: `demo-dis-${Date.now()}`,
    type,
    label: cancelled ? `${primary.title} cancelled` : `${primary.subtitle || primary.title} delayed by ${delayMinutes} min`,
    primaryNodeId: primaryId,
    delayMinutes: cancelled ? undefined : delayMinutes,
    impactLevel: affected.some((n) => n.status === 'broken') ? 'high' : affected.length ? 'medium' : 'low',
    directImpact: 1,
    downstreamImpact: affected.length,
    financialExposure: exposure,
    refundExposure: affected.reduce((sum, n) => sum + (n.refundAmount ?? 0), 0),
    cascadeSteps: [primary, ...affected].map((n, i) => ({ id: `step-${i}`, description: n.reason ?? n.title, nodeId: n.id, timestamp: nowStamp() })),
    detectedAt: nowStamp(),
  };
  return { disruption, sequence };
}

// ---- Recovery generation ----------------------------------------------------------

/** New schedule for each generated option's rebooked leg, applied on confirm. */
const optionPlans = new Map<string, { start: Date; end: Date; category: ItineraryNodeData['category'] }>();

function weightsFor(p: TravelerPreferences) {
  const speed = p.costVsSpeed / 100 + (p.recoveryPriorities.minimizeTime ? 0.4 : 0);
  const cost = 1 - p.costVsSpeed / 100 + (p.recoveryPriorities.minimizeCost ? 0.4 : 0);
  const comfort = p.disruptionVsComfort / 100 + (p.recoveryPriorities.maximizeComfort ? 0.4 : 0);
  const preservation = 1 - p.disruptionVsComfort / 100 + (p.recoveryPriorities.minimizeDisruption ? 0.3 : 0);
  return { speed, cost, comfort, preservation, risk: 0.6 };
}

function scoreOption(o: RecoveryOption, p: TravelerPreferences) {
  const w = weightsFor(p);
  const b = o.scoreBreakdown;
  const total = w.speed + w.cost + w.comfort + w.preservation + w.risk;
  return Math.round((b.speed * w.speed + b.cost * w.cost + b.comfort * w.comfort + b.preservation * w.preservation + b.risk * w.risk) / total);
}

function generateOptions(state: DemoTripState): RecoveryOption[] {
  const { trip, disruption } = state;
  if (!disruption) return [];
  const primary = trip.nodes.find((n) => n.id === disruption.primaryNodeId)!;
  const target = trip.nodes.find((n) => n.causedBy === primary.id && (n.status === 'at-risk' || n.status === 'broken') && n.category !== 'connection') ?? primary;
  const ends = parseEndpoints(target);
  const from = ends?.from ?? target.location;
  const to = ends?.to ?? trip.destination;
  const mode = nodeKind(target);
  const baseEnd = new Date(target.scheduledEnd!);
  const bookable = trip.nodes.filter((n) => n.category !== 'connection').length;
  const hotel = trip.nodes.find((n) => n.category === 'hotel');
  const keep = (id: string, description: string) => ({ nodeId: id, nodeLabel: trip.nodes.find((n) => n.id === id)?.title ?? id, changeType: 'preserved' as const, description });

  // Alternatives depart relative to when the traveler can actually be there:
  // the (delayed) arrival of the upstream leg, or the original slot if the
  // disrupted booking itself is being replaced.
  const upstream = trip.nodes.filter((n) => n.causedBy === primary.id && n.category === 'connection').pop() ?? primary;
  const anchor = target.id === primary.id ? new Date(primary.scheduledStart!) : new Date(upstream.actualEnd ?? upstream.scheduledEnd!);
  const duration = minutesBetween(target.scheduledStart!, target.scheduledEnd!);
  const fastDepart = addMin(anchor, 20);
  const cheapDepart = addMin(anchor, 40);
  const comfortDepart = addMin(anchor, 5);
  const fastArrive = addMin(fastDepart, mode === 'train' ? 70 : Math.max(45, duration - 15));
  const cheapArrive = addMin(cheapDepart, duration + 70);
  const comfortArrive = addMin(comfortDepart, duration + 45);
  const lateBy = (d: Date) => Math.max(0, Math.round((d.getTime() - baseEnd.getTime()) / 60000));
  const plan = (id: string, start: Date, end: Date, category: ItineraryNodeData['category']) => optionPlans.set(id, { start, end, category });
  plan(`${disruption.id}-fast`, fastDepart, fastArrive, mode === 'train' ? 'flight' : target.category);
  plan(`${disruption.id}-cheap`, cheapDepart, cheapArrive, target.category);
  plan(`${disruption.id}-comfort`, comfortDepart, comfortArrive, mode === 'flight' ? 'flight' : 'transfer');

  const fastLabel = mode === 'train' ? `IndiGo 6E 2381 ${from} → ${to}` : `${target.provider} next departure`;
  const cheapLabel = mode === 'train' ? `Taj Express 12280 ${from} → ${to}` : `${target.provider} later service`;
  const comfortLabel = mode === 'flight' ? `premium cabin on a partner airline` : `Private chauffeur car ${from} → ${to}`;

  const options: RecoveryOption[] = [
    {
      id: `${disruption.id}-fast`, name: 'Keep Your Arrival On Track', tag: 'Recommended', tagColor: 'green',
      description: 'Quickest and most reliable option', costDelta: Math.round(target.cost * 0.85 / 50) * 50 || 1250,
      timeImpactMinutes: lateBy(fastArrive), bookingsPreserved: bookable, totalBookings: bookable, refundRecovered: target.refundAmount ?? 0,
      residualRisk: 'low', score: 0, feasible: true,
      changes: [
        { nodeId: target.id, nodeLabel: target.title, changeType: 'rebooked', description: `Rebooked to ${fastLabel}, departing ${hm(fastDepart)}.` },
        keep(target.id, `Restores a ${Math.round((fastDepart.getTime() - anchor.getTime()) / 60000) + 35} min connection buffer`),
        ...(hotel ? [keep(hotel.id, `Keeps ${hotel.location} hotel check-in intact`)] : []),
        keep(primary.id, 'Avoids rebooking the first leg'),
      ],
      scoreBreakdown: { speed: 96, cost: 62, comfort: 78, preservation: 98, risk: 94 },
    },
    {
      id: `${disruption.id}-cheap`, name: 'Lowest Extra Cost', tag: 'Save More', tagColor: 'violet',
      description: 'Cost-effective with minimal impact', costDelta: 0,
      timeImpactMinutes: lateBy(cheapArrive), bookingsPreserved: bookable, totalBookings: bookable, refundRecovered: target.refundAmount ?? 0,
      residualRisk: 'medium', score: 0, feasible: true,
      changes: [
        { nodeId: target.id, nodeLabel: target.title, changeType: 'rebooked', description: `Moved to ${cheapLabel}, departing ${hm(cheapDepart)}.` },
        keep(target.id, 'Uses the next available connection at no extra fare'),
        keep(target.id, 'Minimal out-of-pocket cost'),
        ...(hotel ? [keep(hotel.id, `${hotel.location} hotel check-in still possible`)] : []),
      ],
      scoreBreakdown: { speed: 58, cost: 100, comfort: 64, preservation: 90, risk: 70 },
    },
    {
      id: `${disruption.id}-comfort`, name: 'Maximum Comfort', tag: 'More Comfort', tagColor: 'amber',
      description: 'Relaxed journey with minimal hassle', costDelta: Math.round(target.cost * 1.65 / 50) * 50 || 2400,
      timeImpactMinutes: lateBy(comfortArrive), bookingsPreserved: bookable, totalBookings: bookable, refundRecovered: target.refundAmount ?? 0,
      residualRisk: 'low', score: 0, feasible: true,
      changes: [
        { nodeId: target.id, nodeLabel: target.title, changeType: 'rebooked', description: `Switched to ${comfortLabel}, departing ${hm(comfortDepart)}.` },
        keep(target.id, 'Door-to-door with a comfortable buffer'),
        ...(hotel ? [keep(hotel.id, 'No changes to hotel booking')] : []),
      ],
      scoreBreakdown: { speed: 72, cost: 45, comfort: 98, preservation: 100, risk: 92 },
    },
  ];
  options.forEach((o) => { o.score = scoreOption(o, state.preferences); });
  return options.sort((a, b) => b.score - a.score);
}

// ---- State ------------------------------------------------------------------------

const builders: Record<string, () => Pick<DemoTripState, 'trip' | 'edges'>> = {
  'demo-golden-triangle': buildGoldenTriangle,
  'demo-riviera': buildRiviera,
  'demo-singapore': buildSingapore,
};

let store: Map<string, DemoTripState> | null = null;

function event(type: ActivityEvent['type'], message: string, detail?: string): ActivityEvent {
  return { id: `ev-${Math.random().toString(36).slice(2, 9)}`, timestamp: nowStamp(), type, message, detail };
}
function notify(severity: Notification['severity'], category: Notification['category'], title: string, message: string): Notification {
  return { id: `nt-${Math.random().toString(36).slice(2, 9)}`, severity, category, title, message, timestamp: nowStamp(), read: false };
}

function freshState(id: string, build: () => Pick<DemoTripState, 'trip' | 'edges'>): DemoTripState {
  const built = build();
  return {
    ...built, build, disruption: null, options: [], preferences: structuredClone(defaultPreferences),
    activity: [event('system', 'Safar Sathi monitoring started', 'Tracking every booking in this journey'), event('monitoring', 'All connections validated', `${built.trip.nodes.length} bookings checked`)],
    notifications: [notify('system', 'system', 'Monitoring active', `${built.trip.name} is being tracked in real time.`)],
  };
}

function getStore(): Map<string, DemoTripState> {
  if (store) return store;
  store = new Map(Object.entries(builders).map(([id, build]) => [id, freshState(id, build)]));
  // The hero trip opens mid-journey with a live disruption, like the product demo.
  const hero = store.get('demo-golden-triangle')!;
  applyDisruption(hero, 'bom-del', 'flight-delay', 95);
  hero.options = generateOptions(hero);
  return store;
}

function stateFor(tripId: string): DemoTripState {
  const s = getStore().get(tripId);
  if (!s) throw new DemoNotFoundError(`Trip '${tripId}' not found`);
  return s;
}

function applyDisruption(state: DemoTripState, primaryId: string, type: Disruption['type'], delay: number) {
  const result = propagate(state, primaryId, type, delay);
  state.disruption = result.disruption;
  state.activity.unshift(event('disruption', result.disruption.label, `${result.disruption.downstreamImpact} downstream booking(s) affected`));
  state.notifications.unshift(notify('high', 'risk', 'Disruption detected', `${result.disruption.label}. Safar Sathi is preparing recovery options.`));
  return result;
}

function impactsOf(state: DemoTripState, sequence: string[]) {
  return sequence.map((nodeId) => {
    const n = state.trip.nodes.find((x) => x.id === nodeId)!;
    return { nodeId, status: n.status, reason: n.reason ?? null, causedBy: n.causedBy ?? null, availableBufferMinutes: n.availableBufferMinutes ?? null, requiredBufferMinutes: n.requiredBufferMinutes ?? null };
  });
}

function pickPrimary(state: DemoTripState, type: string, requested?: string) {
  if (requested) return requested;
  const wanted = type.startsWith('hotel') ? 'hotel' : type.startsWith('activity') || type === 'weather-disruption' ? 'activity' : type === 'transfer-failure' ? 'transfer' : 'flight';
  return (state.trip.nodes.find((n) => n.category === wanted) ?? state.trip.nodes[0]).id;
}

const clone = <T,>(v: T): T => structuredClone(v);

/** Digital Twin simulations awaiting apply, with the schedule they were run against. */
const twinSims = new Map<string, { sim: DigitalTwinSimulation; fingerprint: string }>();
const fingerprint = (state: DemoTripState) => state.trip.nodes.map((n) => `${n.id}@${n.scheduledStart}-${n.scheduledEnd}:${n.cost}`).join('|');

// ---- Public API (mirrors services/api.ts) ------------------------------------------

export const demoBackend = {
  profile: () => ({ ...DEMO_PROFILE }),

  async listTrips() {
    await wait(200);
    return [...getStore().values()].map(({ trip }) => ({
      id: trip.id, name: trip.name, route: trip.route, startDate: trip.startDate, endDate: trip.endDate,
      tripValue: trip.tripValue, healthScore: trip.healthScore, status: trip.status, nodeCount: trip.nodes.length, edgeCount: trip.edges.length,
    }));
  },

  async getItinerary(tripId: string) { await wait(); return clone(stateFor(tripId).trip); },
  async getActivityLog(tripId: string) { await wait(120); return clone(stateFor(tripId).activity); },
  async getNotifications(tripId: string) { await wait(120); return clone(stateFor(tripId).notifications); },
  async markNotificationsRead(tripId: string) { stateFor(tripId).notifications.forEach((n) => { n.read = true; }); },
  async getPreferences(tripId: string) { return clone(stateFor(tripId).preferences); },
  async setPreferences(tripId: string, p: TravelerPreferences) { stateFor(tripId).preferences = clone(p); },

  async getBookings(tripId: string): Promise<Booking[]> {
    await wait(150);
    return stateFor(tripId).trip.nodes.filter((n) => n.category !== 'connection').map((n) => ({
      id: `bk-${n.id}`, category: n.category as Booking['category'], provider: n.provider, confirmation: n.confirmation ?? '',
      date: n.scheduledStart ? dayLabel(new Date(n.scheduledStart)) : '', time: n.scheduledStart ? hm(new Date(n.scheduledStart)) : '',
      cost: n.cost, refundable: n.refundable, cancellationPolicy: n.cancellationPolicy, status: n.status, riskLevel: n.riskLevel, route: n.label, nodeId: n.id,
    }));
  },

  async getRiskAnalysis(tripId: string): Promise<RiskAnalysis> {
    await wait(180);
    const { trip, disruption } = stateFor(tripId);
    const affected = trip.nodes.filter((n) => n.status !== 'healthy' && n.category !== 'connection');
    const alerts: Alert[] = affected.map((n, i) => ({
      id: `al-${n.id}`, severity: n.status === 'broken' || n.status === 'cancelled' || n.id === disruption?.primaryNodeId ? 'high' : 'medium',
      title: n.id === disruption?.primaryNodeId ? disruption.label : `${n.title} ${n.status === 'at-risk' ? 'at risk' : n.status}`,
      reason: n.reason ?? 'Affected by an upstream delay.', impact: `${n.dependencyCount} downstream booking(s) depend on this.`,
      action: 'Review recovery options', nodeId: n.id, timestamp: `${2 + i * 9} min ago`,
    }));
    if (trip.id === 'demo-golden-triangle') {
      alerts.push(
        { id: 'al-del-congestion', severity: 'medium', title: 'High congestion at Delhi T1', reason: 'Security queues are running 35–40 min at Terminal 1.', impact: 'Adds time to the airport-to-station connection.', action: 'Allow extra buffer', timestamp: '24 min ago' },
        { id: 'al-agra-heat', severity: 'low', title: 'Heat advisory in Agra', reason: 'Afternoon temperatures expected around 38°C.', impact: 'Outdoor sightseeing is best before 11:00.', action: 'Keep the sunrise tour', timestamp: '41 min ago' },
      );
    }
    return {
      score: { tripResilience: trip.healthScore, connectionRisk: affected.length ? 64 : 18, scheduleRisk: affected.length ? 52 : 14, vendorRisk: 12, weatherRisk: 22 },
      cards: affected.map((n) => ({ nodeId: n.id, nodeLabel: n.title, riskType: 'Connection', riskLevel: n.status === 'broken' ? 'high' : 'medium', riskPercent: n.status === 'broken' ? 88 : 62, buffer: n.availableBufferMinutes != null ? `${n.availableBufferMinutes} min` : undefined, historicalRisk: 'Delays on this route average 28 min', downstreamImpact: n.dependencyCount, recommendation: 'Rebook to restore the connection buffer.' })),
      alerts,
    };
  },

  async triggerDisruption(tripId: string, req: { type: string; primaryNodeId?: string; delayMinutes?: number }) {
    await wait(500);
    const state = stateFor(tripId);
    Object.assign(state, state.build(), { disruption: null, options: [] });
    const primary = pickPrimary(state, req.type, req.primaryNodeId);
    const result = applyDisruption(state, primary, req.type as Disruption['type'], req.delayMinutes ?? 95);
    return { disruption: clone(result.disruption), impacts: impactsOf(state, result.sequence), sequence: result.sequence, tripHealthScore: state.trip.healthScore };
  },

  async simulateDisruption(tripId: string, req: { type: string; primaryNodeId?: string; delayMinutes?: number }) {
    await wait(300);
    const real = stateFor(tripId);
    const scratch: DemoTripState = { ...real, ...real.build(), activity: [], notifications: [] };
    const result = propagate(scratch, pickPrimary(scratch, req.type, req.primaryNodeId), req.type as Disruption['type'], req.delayMinutes ?? 95);
    return { disruption: { ...result.disruption, id: 'preview' }, impacts: impactsOf(scratch, result.sequence), sequence: result.sequence, tripHealthScore: scratch.trip.healthScore };
  },

  async repropagate(tripId: string) {
    await wait(150);
    const state = stateFor(tripId);
    if (!state.disruption) throw new DemoNotFoundError('No active disruption to propagate.');
    const sequence = [state.disruption.primaryNodeId, ...state.trip.nodes.filter((n) => n.causedBy === state.disruption!.primaryNodeId).map((n) => n.id)];
    return { disruption: clone(state.disruption), impacts: impactsOf(state, sequence), sequence, tripHealthScore: state.trip.healthScore };
  },

  async generateRecoveryOptions(tripId: string) {
    await wait(650);
    const state = stateFor(tripId);
    state.options = generateOptions(state);
    return clone(state.options);
  },

  async listRecoveryOptions(tripId: string) {
    await wait(120);
    const state = stateFor(tripId);
    return state.disruption ? clone(state.options) : [];
  },

  async applyRecovery(tripId: string, recoveryId: string) {
    await wait(900);
    const state = stateFor(tripId);
    const option = state.options.find((o) => o.id === recoveryId);
    if (!option) throw new DemoNotFoundError('That recovery option is no longer available.');
    const rebooked = option.changes.find((c) => c.changeType === 'rebooked');
    for (const n of state.trip.nodes) {
      if (n.id === rebooked?.nodeId) {
        const planned = optionPlans.get(option.id);
        if (planned) {
          n.scheduledStart = iso(planned.start);
          n.scheduledEnd = iso(planned.end);
          n.scheduledTime = `${dayLabel(planned.start)} · ${hm(planned.start)}–${hm(planned.end)}`;
          n.category = planned.category;
          n.icon = planned.category === 'flight' ? 'plane' : planned.category === 'transfer' ? 'car' : n.icon;
        }
        n.subtitle = rebooked.description.replace(/^(Rebooked to|Moved to|Switched to) /, '').replace(/, departing.*$/, '').replace(/ \S+ → \S+$/, '');
        n.provider = n.subtitle.split(' ').slice(0, n.category === 'flight' ? 1 : 2).join(' ');
        n.actualStart = null;
        n.actualEnd = null;
        n.status = 'recovered';
        n.cost += option.costDelta;
      } else if (n.status !== 'healthy' && n.id !== state.disruption?.primaryNodeId) {
        n.status = 'healthy';
      }
      n.reason = n.status === 'recovered' ? 'Rebooked by Safar Sathi and re-validated.' : n.id === state.disruption?.primaryNodeId ? n.reason : null;
      n.causedBy = null;
    }
    state.trip.edges.forEach((e) => { e.status = 'healthy'; e.animated = false; });
    state.edges.forEach((e) => { e.status = 'healthy'; });
    state.trip.status = 'recovered';
    state.trip.healthScore = Math.min(98, 90 + Math.round(option.score / 20));
    const activityEvent = event('recovery', `Recovery applied: ${option.name}`, `${option.bookingsPreserved}/${option.totalBookings} bookings preserved · journey re-validated`);
    const notification = notify('system', 'recovery', 'Journey re-validated', `${option.name} applied. All connections are feasible again.`);
    state.activity.unshift(activityEvent);
    state.notifications.unshift(notification);
    state.disruption = null;
    state.options = []; // applied: the plan can't be applied a second time
    return { trip: clone(state.trip), appliedRecovery: clone(option), activityEvent, notification };
  },

  async resetTrip(tripId: string) {
    await wait(400);
    const state = stateFor(tripId);
    Object.assign(state, state.build(), { disruption: null, options: [] });
    state.activity.unshift(event('system', 'Journey reset', 'All bookings restored to their original schedule'));
    return clone(state.trip);
  },

  async createTrip(req: { name: string; origin: string; destination: string; startDate: string; endDate: string }) {
    await wait(400);
    const id = `demo-trip-${Date.now()}`;
    const start = new Date(`${req.startDate}T00:00:00`);
    const end = new Date(`${req.endDate}T00:00:00`);
    const build = () => ({ trip: { id, name: req.name, travelerName: 'Aayush', route: `${req.origin} → ${req.destination}`, origin: req.origin, destination: req.destination, startDate: dateLabel(start), endDate: dateLabel(end), nodes: [], edges: [], tripValue: 0, healthScore: 100, status: 'operational' as const, days: [] }, edges: [] as DemoEdge[] });
    getStore().set(id, freshState(id, build));
    return clone(stateFor(id).trip);
  },

  async addNode(tripId: string, req: { category: string; title: string; provider: string; confirmation: string; originCode?: string; destinationCode?: string; location?: string; scheduledStart: string; scheduledEnd: string; cost: number; lat?: number; lng?: number }) {
    await wait(350);
    const state = stateFor(tripId);
    const start = new Date(req.scheduledStart);
    const end = new Date(req.scheduledEnd);
    const tripStart = new Date(state.trip.startDate);
    const n = node({
      id: `node-${Date.now()}`, category: req.category as ItineraryNodeData['category'],
      label: req.originCode && req.destinationCode ? `${req.originCode} → ${req.destinationCode}` : req.title,
      title: req.title, subtitle: req.provider, location: req.location ?? req.originCode ?? state.trip.destination, provider: req.provider,
      confirmation: req.confirmation, cost: req.cost, cancellationPolicy: 'Per provider terms', refundable: true, refundAmount: Math.round(req.cost * 0.5),
      icon: req.category === 'flight' ? 'plane' : req.category === 'hotel' ? 'bed' : req.category === 'transfer' ? 'car' : 'mountain',
      start, end, dayOffset: Math.max(0, Math.round((start.getTime() - tripStart.getTime()) / DAY)), tripStart: 0,
      lat: req.lat, lng: req.lng,
    });
    state.trip.nodes.push(n);
    state.trip.nodes.sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));
    state.trip.tripValue += req.cost;
    state.activity.unshift(event('booking', `Booking added: ${req.title}`, req.provider));
    return clone(state.trip);
  },

  async deleteNode(tripId: string, nodeId: string) {
    await wait(250);
    const state = stateFor(tripId);
    state.trip.nodes = state.trip.nodes.filter((n) => n.id !== nodeId);
    state.trip.edges = state.trip.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    state.edges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    return clone(state.trip);
  },

  async exportTrip(tripId: string) {
    const trip = clone(stateFor(tripId).trip);
    return { exportedAt: new Date().toISOString(), version: '1.0', trip, bookings: await demoBackend.getBookings(tripId) };
  },

  async getRecoveryNarrative(tripId: string) {
    await wait(200);
    const { disruption, options } = stateFor(tripId);
    const ranked = [...options].filter((o) => o.feasible !== false).sort((a, b) => b.score - a.score);
    if (!disruption || !ranked.length) {
      return { executiveSummary: 'No active disruption — every booking is on track.', narrative: null, topOptionId: null, optionNotes: {}, source: 'deterministic' as const };
    }
    const top = ranked[0];
    const cost = (v: number) => (v > 0 ? `+₹${v.toLocaleString('en-IN')}` : 'no extra cost');
    return {
      executiveSummary: `${disruption.label}. Recommended: “${top.name}” — ${cost(top.costDelta)}, ${top.bookingsPreserved}/${top.totalBookings} bookings preserved, ${top.residualRisk} residual risk.${ranked.length > 1 ? ` ${ranked.length - 1} alternatives considered.` : ''}`,
      narrative: ranked.map((o, i) => (i === 0 ? `“${o.name}” ranks first (${o.score}/100).` : `“${o.name}” (${o.score}/100) ${o.costDelta < top.costDelta ? `saves ₹${(top.costDelta - o.costDelta).toLocaleString('en-IN')}` : `costs ₹${(o.costDelta - top.costDelta).toLocaleString('en-IN')} more`}.`)).join(' '),
      topOptionId: top.id,
      optionNotes: {},
      source: 'deterministic' as const,
    };
  },

  async getTripWeather(tripId: string) {
    await wait(150);
    return tripWeather(tripId, clone(stateFor(tripId).trip.nodes));
  },

  async getSocialSignals(tripId: string) {
    await wait(120);
    return liveSignals(tripId, stateFor(tripId).trip.nodes, Math.floor(Date.now() / 20_000));
  },

  async simulateDigitalTwin(tripId: string, req: WeatherScenarioRequest): Promise<DigitalTwinSimulation> {
    await wait(700);
    const state = stateFor(tripId);
    let result;
    try {
      result = simulateTwin(tripId, clone(state.trip.nodes), state.edges, state.trip.healthScore, req);
    } catch (err) {
      throw new DemoConflictError(err instanceof Error ? err.message : 'Simulation failed');
    }
    const simulationId = `demo-sim-${Date.now().toString(36)}`;
    const sim = { ...result, simulationId, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    twinSims.set(simulationId, { sim, fingerprint: fingerprint(state) });
    return clone(sim);
  },

  async applyDigitalTwin(tripId: string, simulationId: string, optionId: string): Promise<DigitalTwinApplyResult> {
    await wait(900);
    const state = stateFor(tripId);
    const stored = twinSims.get(simulationId);
    const option = stored?.sim.tripId === tripId ? stored.sim.options.find((o) => o.id === optionId) : undefined;
    if (!stored || !option) throw new DemoNotFoundError('Simulation not found or expired. Run the scenario again.');
    if (stored.fingerprint !== fingerprint(state)) throw new DemoConflictError('The itinerary changed since this simulation. Run the scenario again.');
    if (state.disruption) throw new DemoConflictError('Resolve the active disruption before applying a preemptive weather plan.');
    for (const c of option.changes) {
      const n = state.trip.nodes.find((x) => x.id === c.nodeId);
      if (!n) continue;
      const start = new Date(c.newStart);
      const end = new Date(c.newEnd);
      n.scheduledStart = iso(start);
      n.scheduledEnd = iso(end);
      n.scheduledTime = start.toDateString() === end.toDateString() ? `${dayLabel(start)} · ${hm(start)}–${hm(end)}` : `${dayLabel(start)} · ${hm(start)} — ${dayLabel(end)} · ${hm(end)}`;
      n.cost += c.costDelta;
      n.status = 'recovered';
      n.reason = `${c.description} Applied preemptively by the weather Digital Twin.`;
      n.causedBy = null;
      n.actualStart = null;
      n.actualEnd = null;
    }
    state.trip.nodes.sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));
    state.trip.tripValue += option.deltaCost;
    state.trip.healthScore = option.healthScore;
    state.trip.status = 'operational';
    state.trip.edges.forEach((e) => { e.status = 'healthy'; });
    state.activity.unshift(event('recovery', `Preemptive plan applied: ${option.name}`, `${stored.sim.scenarioName} · ${option.commitmentsPreserved}/${option.totalCommitments} commitments protected`));
    state.notifications.unshift(notify('system', 'recovery', 'Storm-proofed itinerary', `${option.name} applied ahead of “${stored.sim.scenarioName}”.`));
    twinSims.delete(simulationId);
    const committed = state.trip.nodes.filter((n) => n.category !== 'connection');
    return {
      trip: clone(state.trip),
      appliedOption: clone(option),
      validation: { healthScore: option.healthScore, atRiskCommitments: option.residualFailures, totalCommitments: committed.length, costExposure: 0 },
      allConnectionsValid: option.residualFailures === 0,
    };
  },

  async askAssistant(tripId: string, message: string) {
    await wait(700);
    return answer(stateFor(tripId), message);
  },
};

// ---- Grounded demo assistant -------------------------------------------------------

function answer(state: DemoTripState, message: string) {
  const q = message.toLowerCase();
  const { trip, disruption, options } = state;
  const best = [...options].sort((a, b) => b.score - a.score)[0];
  const affected = trip.nodes.filter((n) => n.status !== 'healthy' && n.status !== 'recovered' && n.category !== 'connection');
  const refs = (list: RecoveryOption[]) => list.map((o) => ({ type: 'recovery' as const, id: o.id, label: o.name }));

  if (/refund|claim|compensat|money back/.test(q)) {
    const eligible = trip.nodes.filter((n) => n.refundable && n.status !== 'healthy' && n.category !== 'connection');
    const total = eligible.reduce((s, n) => s + (n.refundAmount ?? 0), 0);
    return {
      content: eligible.length
        ? `You can claim up to ₹${total.toLocaleString('en-IN')} across ${eligible.length} affected booking(s): ${eligible.map((n) => `${n.title} (${n.cancellationPolicy.toLowerCase()})`).join('; ')}. For the delayed flight, airlines in India owe meals and rebooking for delays over 2 hours, and a full refund if you choose not to travel. Open Claims to start a refund request.`
        : 'None of your bookings are currently affected, so there is nothing to claim right now. If a disruption happens, I will list every refundable booking and the amount you can recover.',
      references: eligible.map((n) => ({ type: 'node' as const, id: n.id, label: n.title })), source: 'deterministic' as const,
    };
  }
  if (!disruption && !/status|how is|trip/.test(q)) {
    return { content: `Your ${trip.route} journey is on track - all ${trip.nodes.length} bookings are healthy and every connection has its full buffer. Try "Simulate a 60 min delay" to see how Safar Sathi would respond to a disruption.`, references: [], source: 'deterministic' as const };
  }
  if (/simulat|what if|miss/.test(q) && disruption) {
    const train = trip.nodes.find((n) => nodeKind(n) === 'train');
    return { content: `If you miss ${train ? `the ${train.subtitle}` : 'your connection'}, the downstream transfer and hotel check-in shift by roughly 2.5 hours. Your hotel keeps the room (check-in is flexible until midnight), but the transfer would need rebooking. The "${best?.name ?? 'recommended'}" plan avoids that entirely by rebooking before the connection breaks.`, references: best ? refs([best]) : [], source: 'deterministic' as const };
  }
  if (/why|explain|connection|risk/.test(q) && disruption) {
    const at = affected.filter((n) => n.id !== disruption.primaryNodeId);
    return { content: `${disruption.label}. ${at.map((n) => n.reason).filter(Boolean).join(' ') || 'Downstream bookings are affected by the delay.'} That is why ${at.length} downstream booking(s) are flagged. Rebooking the at-risk leg now restores the buffer before it becomes a missed connection.`, references: at.map((n) => ({ type: 'node' as const, id: n.id, label: n.title })), source: 'deterministic' as const };
  }
  if (/compare|option|recover|rebook|alternative|fastest|cheap|comfort/.test(q) && options.length) {
    const lines = options.map((o, i) => `${i + 1}. ${o.name} - ${o.costDelta ? `₹${o.costDelta.toLocaleString('en-IN')} extra` : 'no extra cost'}, ${o.timeImpactMinutes ? `${o.timeImpactMinutes} min later arrival` : 'on-time arrival'}, ${o.residualRisk} risk (score ${o.score}).`);
    return { content: `I've analyzed your trip and found ${options.length} recovery options based on speed, cost and comfort:\n${lines.join('\n')}\nI recommend "${best.name}" - it keeps your ${trip.destination} plans intact with the lowest risk.`, references: refs(options), source: 'deterministic' as const };
  }
  if (disruption) {
    return { content: `Here is your trip status: ${disruption.label}. ${affected.length} booking(s) need attention, trip health is ${trip.healthScore}%. ${options.length ? `I have ${options.length} recovery options ready - "${best.name}" is the best fit for your preferences.` : 'I am preparing recovery options now.'}`, references: best ? refs([best]) : [], source: 'deterministic' as const };
  }
  return { content: `Your ${trip.route} journey is on track. Trip health is ${trip.healthScore}% and no connections are at risk.`, references: [], source: 'deterministic' as const };
}
