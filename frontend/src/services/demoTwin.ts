import type { ItineraryNodeData, NodeStatus } from '@/types';
import type {
  CascadeLink,
  DigitalTwinSimulation,
  HourlyWeather,
  NodeWeather,
  SocialSignal,
  SocialSignals,
  TwinChange,
  TwinNode,
  TwinOption,
  TwinRisk,
  TwinStateSummary,
  WeatherScenarioRequest,
} from '@/services/api';

/** Offline Digital Twin: a compact mirror of the backend DigitalTwinEngine
 * (backend/app/engines/digital_twin_engine.py) used only by the offline demo.
 * Same stress rules, cascade semantics and preemptive strategies, simplified
 * propagation. Explanations are the heuristic reasoning engine's output. */

export interface TwinEdge { source: string; target: string; requiredBuffer: number }

const MOUNTAIN_RE = /\b(leh|ladakh|manali|shimla|darjeeling|munnar|pass|ghat|hill|mountain|nubra|pangong|spiti)\b/i;
const OUTDOOR_RE = /\b(tour|trek|hike|lake|safari|cruise|boat|dive|scuba|beach|valley|sunrise|sunset|fort|garden|excursion|rafting|camp)\b/i;
const RAIL_RE = /\b(train|rail|express|shatabdi|rajdhani|vande bharat|metro)\b/i;
const HOUR = 3_600_000;
const RANK: Record<string, number> = { healthy: 0, recovered: 0, delayed: 1, 'at-risk': 2, broken: 3, cancelled: 4 };

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const stamp = (d: Date) => d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const startOf = (n: ItineraryNodeData) => new Date(n.scheduledStart ?? Date.now());
const endOf = (n: ItineraryNodeData) => new Date(n.scheduledEnd ?? n.scheduledStart ?? Date.now());
const commitment = (n: ItineraryNodeData) => n.category !== 'connection';

export function severityOf(s: WeatherScenarioRequest): number {
  const parts = [
    Math.min(1, s.rainfallMmPerHour / 80),
    Math.min(1, Math.max(0, s.windSpeedKmh - 20) / 90),
    Math.min(1, Math.max(0, 5000 - s.visibilityMeters) / 4800),
    Math.min(1, Math.max(0, s.temperatureCelsius - 38) / 10),
  ];
  return Math.round((Math.max(...parts) * 0.7 + (parts.reduce((a, b) => a + b, 0) / parts.length) * 0.3) * 1000) / 1000;
}

export function modeOf(n: ItineraryNodeData): string {
  const text = `${n.title} ${n.provider} ${n.subtitle}`;
  if (n.category === 'return') return n.icon === 'plane' ? 'flight' : RAIL_RE.test(text) ? 'train' : 'transfer';
  if (n.category === 'transfer' && RAIL_RE.test(text)) return 'train';
  return n.category;
}

interface Hit { nodeId: string; cancel: boolean; status: NodeStatus; delay: number; driver: string; reason: string }

function stressFor(n: ItineraryNodeData, s: WeatherScenarioRequest): Hit | null {
  const mode = modeOf(n);
  const text = `${n.title} ${n.location}`;
  const mountain = MOUNTAIN_RE.test(text);
  const { rainfallMmPerHour: rain, windSpeedKmh: wind, visibilityMeters: vis, temperatureCelsius: heat } = s;
  const hit = (cancel: boolean, delay: number, driver: string, reason: string, status?: NodeStatus): Hit => ({ nodeId: n.id, cancel, status: status ?? (cancel ? 'cancelled' : 'delayed'), delay, driver, reason });

  if (mode === 'flight') {
    if ((vis < 150 && s.stormDurationHours >= 6) || wind > 95) {
      const driver = vis < 150 ? 'visibility' : 'wind';
      return hit(true, 0, driver, `${driver === 'visibility' ? 'Zero-visibility fog' : `${Math.round(wind)} km/h winds`} ground all departures for ${s.stormDurationHours}h; the airline cancels.`);
    }
    const c: [number, string, string][] = [];
    if (vis < 800) c.push([vis < 300 ? 180 : 120, 'visibility', `Visibility ${Math.round(vis)} m is below CAT-I minima; ground stop.`]);
    if (wind > 60) c.push([Math.min(300, Math.round(90 + (wind - 60) * 2)), 'wind', `${Math.round(wind)} km/h crosswinds force holds and diversions.`]);
    if (rain > 35) c.push([Math.round(60 + (rain - 35) * 2), 'rainfall', `${Math.round(rain)} mm/h rain triggers air-traffic flow control.`]);
    if (heat > 46) c.push([45, 'heat', `${Math.round(heat)} °C cuts take-off performance; payload and slot delays.`]);
    if (!c.length) return null;
    const [delay, driver, reason] = c.sort((a, b) => b[0] - a[0])[0];
    return hit(false, delay, driver, reason);
  }
  if (mode === 'transfer') {
    const [blockedAt, slowedAt] = mountain ? [45, 25] : [60, 35];
    const road = mountain ? 'mountain road' : 'road';
    if (rain > blockedAt || (mountain && wind > 80)) {
      return rain > blockedAt
        ? hit(true, 0, 'rainfall', `${Math.round(rain)} mm/h rain blocks the ${road} (landslide/flooding risk); the transfer cannot run.`)
        : hit(true, 0, 'wind', `${Math.round(wind)} km/h winds close the ${road}.`);
    }
    if (rain > slowedAt) return hit(false, Math.round(45 + (rain - slowedAt) * 3), 'rainfall', `Waterlogging on the ${road}: cabs divert via longer routes.`);
    if (vis < 300) return hit(false, 60, 'visibility', `Dense fog (${Math.round(vis)} m) slows road traffic.`);
    return null;
  }
  if (mode === 'train') {
    if (vis < 300) return hit(false, 120, 'visibility', `Fog (${Math.round(vis)} m) forces caution running; trains run late.`);
    if (rain > 70) return hit(false, 90, 'rainfall', `${Math.round(rain)} mm/h rain floods track sections; speed restrictions.`);
    return null;
  }
  if (mode === 'activity') {
    const outdoor = OUTDOOR_RE.test(text);
    if (outdoor && (wind > 60 || rain > 25)) {
      return wind > 60
        ? hit(true, 0, 'wind', `${Math.round(wind)} km/h winds make the outing unsafe; the operator cancels.`)
        : hit(true, 0, 'rainfall', `${Math.round(rain)} mm/h rain washes out the outdoor activity.`);
    }
    if (outdoor && heat > 42) return hit(false, 120, 'heat', `${Math.round(heat)} °C heat: operator moves the tour to cooler hours.`);
    if (rain > 60) return hit(false, 45, 'rainfall', 'Heavy rain delays access to the venue.');
    return null;
  }
  if (mode === 'hotel' && rain > 80) return hit(false, 0, 'rainfall', `${Math.round(rain)} mm/h flooding around the property may delay check-in.`, 'at-risk');
  return null;
}

export function stormWindow(nodes: ItineraryNodeData[], s: WeatherScenarioRequest): [Date, Date] {
  let start: Date;
  if (s.stormStart) start = new Date(s.stormStart);
  else {
    const target = s.affectedNodeId ? nodes.find((n) => n.id === s.affectedNodeId) : undefined;
    const first = Math.min(...nodes.map((n) => startOf(n).getTime()));
    start = target ? new Date(startOf(target).getTime() - HOUR) : new Date(first);
  }
  return [start, new Date(start.getTime() + Math.max(0.5, s.stormDurationHours) * HOUR)];
}

interface Impact { status: NodeStatus; shift: number; reason: string | null; causedBy: string | null; available?: number; required?: number }
export interface TwinRunResult {
  impacts: Map<string, Impact>;
  hits: Map<string, Hit>;
  window: [Date, Date];
  health: number;
  exposure: number;
}

export function runTwin(nodes: ItineraryNodeData[], edges: TwinEdge[], s: WeatherScenarioRequest, window?: [Date, Date]): TwinRunResult {
  const win = window ?? stormWindow(nodes, s);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hits = new Map<string, Hit>();
  for (const n of nodes) {
    if (!commitment(n) || (s.affectedNodeId && n.id !== s.affectedNodeId)) continue;
    if (!(startOf(n) <= win[1] && endOf(n) > win[0])) continue;
    const h = stressFor(n, s);
    if (h) hits.set(n.id, h);
  }
  const impacts = new Map<string, Impact>(nodes.map((n) => {
    const h = hits.get(n.id);
    return [n.id, h ? { status: h.status, shift: h.delay, reason: h.reason, causedBy: null } : { status: 'healthy', shift: 0, reason: null, causedBy: null }];
  }));
  const order = [...nodes].sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  for (const n of order) {
    for (const e of edges.filter((x) => x.target === n.id)) {
      const srcNode = byId.get(e.source);
      const src = impacts.get(e.source);
      if (!srcNode || !src || srcNode.category === 'hotel') continue;
      const soft = n.category === 'hotel' || n.category === 'activity';
      let next: Impact | null = null;
      if (src.status === 'cancelled' || src.status === 'broken') {
        next = { status: soft ? 'at-risk' : 'broken', shift: 0, causedBy: srcNode.id, reason: `${srcNode.title} is ${src.status === 'cancelled' ? 'cancelled' : 'missed'}, so ${n.title} can't be reached as planned.` };
      } else if (src.shift > 0) {
        if (n.category === 'connection') {
          next = { status: 'delayed', shift: src.shift, causedBy: srcNode.id, reason: `Transit now starts ${src.shift} min later.` };
        } else {
          const buffer = Math.round((startOf(n).getTime() - endOf(srcNode).getTime()) / 60000 - src.shift);
          const required = e.requiredBuffer + 30;
          if (buffer < e.requiredBuffer) next = { status: soft ? 'at-risk' : 'broken', shift: soft ? Math.max(0, -buffer) : 0, causedBy: srcNode.id, available: buffer, required, reason: soft ? `Arrival slips ${Math.max(0, -buffer)} min past ${n.title}'s start.` : `${srcNode.title} now ends after ${n.title} departs; the connection can no longer be made.` };
          else if (buffer < required) next = { status: 'at-risk', shift: 0, causedBy: srcNode.id, available: buffer, required, reason: `Only ${buffer} min left before ${n.title}; ${required} min is recommended.` };
        }
      }
      const cur = impacts.get(n.id)!;
      if (next && RANK[next.status] >= RANK[cur.status]) {
        impacts.set(n.id, { ...next, shift: Math.max(next.shift, cur.shift) });
      } else if (next) {
        cur.shift = Math.max(cur.shift, next.shift);
      }
    }
  }
  let health = 100;
  let exposure = 0;
  for (const n of nodes) {
    if (!commitment(n)) continue;
    const st = impacts.get(n.id)!.status;
    health -= { cancelled: 16, broken: 14, 'at-risk': 7, delayed: 5 }[st as 'cancelled'] ?? 0;
    if (st === 'cancelled' || st === 'broken') exposure += n.cost;
    else if (st === 'at-risk') exposure += n.cost * 0.5;
  }
  return { impacts, hits, window: win, health: Math.max(25, Math.min(100, health)), exposure: Math.round(exposure) };
}

function risksFor(nodes: ItineraryNodeData[], edges: TwinEdge[], run: TwinRunResult, sev: number, signal: Map<string, number>): TwinRisk[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: TwinRisk[] = [];
  for (const n of nodes) {
    const imp = run.impacts.get(n.id)!;
    const base = ({ cancelled: 0.9, broken: 0.86, 'at-risk': 0.62, delayed: 0.45 } as Record<string, number>)[imp.status];
    if (base === undefined) continue;
    const hardIn = edges.some((e) => e.target === n.id && ['flight', 'train', 'connection', 'transfer', 'return'].includes(byId.get(e.source)?.category ?? ''));
    const label = imp.status === 'broken' && hardIn ? 'Connection miss risk' : n.category === 'hotel' ? 'Late check-in risk' : imp.status === 'cancelled' || imp.status === 'broken' ? 'Cancellation risk' : 'Delay risk';
    const sig = signal.get(n.id) ?? 0;
    const p = Math.min(0.99, base + 0.08 * sev + 0.06 * sig + (run.hits.has(n.id) ? 0.03 : 0));
    const half = 0.04 + 0.16 * (1 - sig) * (1 - 0.5 * sev);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    out.push({ nodeId: n.id, label, probability: r2(p), low: r2(Math.max(0.01, p - half)), high: r2(Math.min(0.99, p + half * 0.6)) });
  }
  return out.sort((a, b) => b.probability - a.probability);
}

// ---- Preemptive options ----------------------------------------------------------------

function moved(n: ItineraryNodeData, start: Date): ItineraryNodeData {
  const duration = endOf(n).getTime() - startOf(n).getTime();
  return { ...n, scheduledStart: iso(start), scheduledEnd: iso(new Date(start.getTime() + duration)) };
}

function change(n: ItineraryNodeData, start: Date, changeType: string, feeRate: number, description: string): TwinChange {
  const duration = endOf(n).getTime() - startOf(n).getTime();
  return { nodeId: n.id, title: n.title, changeType, newStart: iso(start), newEnd: iso(new Date(start.getTime() + duration)), costDelta: Math.round(n.cost * feeRate), description };
}

function buildOptions(nodes: ItineraryNodeData[], edges: TwinEdge[], s: WeatherScenarioRequest, base: TwinRunResult): TwinOption[] {
  if (!base.hits.size) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const order = [...nodes].sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const [ws, we] = base.window;
  const transportHits = order.filter((n) => base.hits.has(n.id) && ['flight', 'transfer', 'train'].includes(modeOf(n)));
  const activityHits = order.filter((n) => base.hits.has(n.id) && n.category === 'activity');
  const nextDay = () => activityHits.map((a) => change(a, new Date(startOf(a).getTime() + 24 * HOUR), 'rescheduled', 0.1, `Move ${a.title} to the same time tomorrow, after the storm clears.`));
  const candidates: [string, string, string, string, TwinChange[]][] = [];

  // A. Beat the storm: finish exposed legs 45 min before it arrives.
  const ahead: TwinChange[] = [];
  let feasible = true;
  for (const n of transportHits) {
    const duration = endOf(n).getTime() - startOf(n).getTime();
    const newStart = new Date(ws.getTime() - 45 * 60000 - duration);
    if (newStart >= startOf(n)) continue;
    for (const e of edges.filter((x) => x.target === n.id)) {
      const up = byId.get(e.source);
      if (up && newStart.getTime() < endOf(up).getTime() + e.requiredBuffer * 60000) feasible = false;
    }
    ahead.push(change(n, newStart, 'rebooked', 0.14, `Rebook ${n.title} to depart ${stamp(newStart)}, clearing the storm window.`));
  }
  if (ahead.length && feasible) candidates.push(['ahead', 'Beat the Storm', 'depart-early', 'Move exposed legs earlier so the journey is past the danger zone before the weather arrives.', [...ahead, ...nextDay()]]);

  // B. Wait it out: exposed transport just after the storm, re-time hard dependents.
  const after: TwinChange[] = [];
  const shiftedEnd = new Map<string, number>();
  for (const n of order) {
    if (activityHits.includes(n)) continue;
    const duration = endOf(n).getTime() - startOf(n).getTime();
    let start = transportHits.includes(n) ? Math.max(startOf(n).getTime(), we.getTime() + 30 * 60000) : startOf(n).getTime();
    const upEnds = edges.filter((e) => e.target === n.id && shiftedEnd.has(e.source)).map((e) => ({ end: shiftedEnd.get(e.source)!, buf: e.requiredBuffer }));
    if (n.category === 'connection') {
      if (upEnds.length) shiftedEnd.set(n.id, Math.max(...upEnds.map((u) => u.end)) + duration);
      continue;
    }
    if (n.category !== 'hotel') for (const u of upEnds) start = Math.max(start, u.end + (u.buf + 30) * 60000);
    if (start !== startOf(n).getTime() && n.category !== 'hotel') {
      shiftedEnd.set(n.id, start + duration);
      const isHit = transportHits.includes(n);
      after.push(change(n, new Date(start), isHit ? 'rescheduled' : 'rebooked', 0.08, `${isHit ? 'Reschedule' : 'Rebook'} ${n.title} to ${stamp(new Date(start))}, after the storm.`));
    }
  }
  if (after.length) candidates.push(['after', 'Wait It Out', 'reschedule-after', 'Keep the trip, but move exposed legs to just after the storm and re-time the connections that depend on them.', [...after, ...nextDay()]]);

  // C. Protect the chain: keep exposed legs, re-book at-risk dependents with a wide buffer.
  const protect: TwinChange[] = [];
  for (const n of order) {
    const imp = base.impacts.get(n.id)!;
    if (base.hits.has(n.id) || ['connection', 'hotel', 'activity'].includes(n.category)) continue;
    if (imp.status === 'broken' || imp.status === 'at-risk') {
      const up = imp.causedBy ? byId.get(imp.causedBy) : undefined;
      const upShift = imp.causedBy ? base.impacts.get(imp.causedBy)?.shift ?? 0 : 0;
      const anchor = (up ? endOf(up).getTime() + upShift * 60000 : startOf(n).getTime()) + ((imp.required ?? 60) + 90) * 60000;
      const start = new Date(Math.max(startOf(n).getTime() + HOUR, anchor));
      protect.push(change(n, start, 'rebooked', 0.1, `Rebook ${n.title} to ${stamp(start)}, restoring a safe connection buffer.`));
    }
  }
  protect.push(...nextDay());
  if (protect.length) candidates.push(['protect', 'Protect the Chain', 'buffer-expansion', 'Keep the exposed legs but re-book what depends on them with a buffer wide enough to absorb the weather delay.', protect]);

  const total = nodes.filter(commitment).length;
  const options = candidates.map(([id, name, strategy, description, changes]): TwinOption => {
    const byChange = new Map(changes.map((c) => [c.nodeId, c]));
    const next = nodes.map((n) => (byChange.has(n.id) ? moved(n, new Date(byChange.get(n.id)!.newStart)) : n));
    const run = runTwin(next, edges, { ...s, stormStart: iso(ws) }, base.window);
    const residual = nodes.filter((n) => commitment(n) && ['broken', 'cancelled'].includes(run.impacts.get(n.id)!.status)).length;
    const deltaCost = changes.reduce((sum, c) => sum + c.costDelta, 0);
    const timeImpact = Math.max(0, ...changes.map((c) => Math.round((new Date(c.newStart).getTime() - startOf(byId.get(c.nodeId)!).getTime()) / 60000)));
    const score = Math.max(0, Math.min(100, Math.round(run.health * 0.6 + ((total - residual) / Math.max(1, total)) * 35 + Math.max(0, 5 - deltaCost / 2000))));
    const notes = residual ? [`${residual} booking(s) still fail under the same storm.`] : ['Every connection validated under the same storm.'];
    return { id: `twin-${id}`, name, strategy, description, changes, deltaCost, timeImpactMinutes: timeImpact, commitmentsPreserved: total - residual, totalCommitments: total, healthScore: run.health, residualFailures: residual, score, recommended: false, notes };
  });
  options.sort((a, b) => a.residualFailures - b.residualFailures || b.score - a.score);
  if (options[0]) options[0].recommended = true;
  return options;
}

// ---- Heuristic reasoning (mirror of nugen_service.heuristic_*) ---------------------------------

const DRIVER_WORDS: Record<string, string> = { visibility: 'low visibility', rainfall: 'heavy rain', wind: 'high winds', heat: 'extreme heat' };

function explain(nodes: ItineraryNodeData[], s: WeatherScenarioRequest, run: TwinRunResult, risks: TwinRisk[]): { text: string; tips: string[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const windowText = `${stamp(run.window[0])} – ${stamp(run.window[1])}`;
  const impacted = nodes.filter((n) => run.impacts.get(n.id)!.status !== 'healthy');
  if (!impacted.length) {
    return { text: `Under “${s.scenarioName}” (${windowText}), none of your bookings are exposed: the weather misses every leg's scheduled window or stays within operating limits. No preemptive action is needed.`, tips: ['No at-risk connections: keep the current plan and monitor the forecast.'] };
  }
  const direct = impacted.filter((n) => run.hits.has(n.id));
  const lines: string[] = [];
  const drivers = [...new Set(direct.map((n) => DRIVER_WORDS[run.hits.get(n.id)!.driver]))].sort();
  if (direct.length) {
    lines.push(`“${s.scenarioName}” brings ${drivers.join(' and ') || 'severe weather'} during ${windowText}: ${direct[0].title} is hit directly — ${run.hits.get(direct[0].id)!.reason.replace(/\.$/, '')}.`);
    if (direct.length > 1) lines.push(`It also directly affects ${direct.slice(1, 3).map((n) => n.title).join(', ')}.`);
  }
  for (const n of impacted.filter((x) => run.impacts.get(x.id)!.status === 'broken' && run.impacts.get(x.id)!.causedBy).slice(0, 2)) {
    const imp = run.impacts.get(n.id)!;
    const buf = imp.available != null && imp.required != null ? ` — only ${imp.available} of the ${imp.required} minutes it needs remain` : '';
    lines.push(`Because ${byId.get(imp.causedBy!)?.title ?? 'an upstream leg'} runs late, ${n.title} can no longer be made${buf}.`);
  }
  const soft = impacted.filter((n) => !run.hits.has(n.id) && ['at-risk', 'delayed'].includes(run.impacts.get(n.id)!.status) && commitment(n));
  if (soft.length) lines.push(`Downstream, ${soft.slice(0, 3).map((n) => n.title).join(', ')} ${soft.length > 1 ? 'are' : 'is'} at risk of late arrival.`);
  const top = risks[0];
  if (top) lines.push(`Highest risk: ${top.label.toLowerCase()} for ${byId.get(top.nodeId)?.title} at ${Math.round(top.probability * 100)}% (range ${Math.round(top.low * 100)}–${Math.round(top.high * 100)}%).`);
  const broken = impacted.filter((n) => ['broken', 'cancelled'].includes(run.impacts.get(n.id)!.status));
  lines.push(broken.length ? `Act before the weather does: rebook ${broken[0].title} now, while alternatives still have seats.` : 'Build in extra buffer and keep hotels informed of a late arrival.');

  const tips: string[] = [];
  for (const n of impacted) {
    const imp = run.impacts.get(n.id)!;
    if (imp.status === 'broken' && imp.required != null) tips.push(`Rebook ${n.title} at least ${imp.required - (imp.available ?? 0) + 60} min later to restore its ${imp.required}-min connection buffer.`);
    else if (imp.status === 'cancelled' && n.category === 'activity') tips.push(`Reschedule ${n.title} to the day after the storm; weather cancellations are rarely refundable on the day.`);
    else if (imp.status === 'cancelled') tips.push(`Secure an alternative to ${n.title} now — cancelled departures sell out fast once the storm is announced.`);
    else if (imp.status === 'at-risk' && n.category === 'hotel') tips.push(`Ask ${n.title} to guarantee late check-in so the room is held.`);
    else if (imp.status === 'at-risk') tips.push(`Widen the buffer before ${n.title} by at least 60 min or pick a flexible fare.`);
    if (tips.length >= 4) break;
  }
  return { text: lines.join(' '), tips: tips.length ? tips : ['Monitor the delayed legs; no connection is broken yet.'] };
}

// ---- Social signals ---------------------------------------------------------------------

interface Hub { location: string; lat: number | null; lng: number | null; nodeIds: string[]; airport: boolean }

function hubs(nodes: ItineraryNodeData[]): Hub[] {
  const out = new Map<string, Hub>();
  for (const n of nodes) {
    const key = n.location.replace(/\s*\(.*\)$/, '').split(/[,·]/)[0].trim() || n.location;
    const hub = out.get(key) ?? { location: key, lat: n.lat ?? null, lng: n.lng ?? null, nodeIds: [], airport: false };
    hub.nodeIds.push(n.id);
    hub.airport ||= modeOf(n) === 'flight';
    out.set(key, hub);
  }
  return [...out.values()];
}

function signal(hub: Hub, type: SocialSignal['type'], urgency: SocialSignal['urgency'], sentiment: number, intensity: number, text: string, minutesAgo: number): SocialSignal {
  return { id: `sig-${type}-${hub.location.toLowerCase().replace(/\W+/g, '-')}`, type, location: hub.location, lat: hub.lat, lng: hub.lng, nodeIds: hub.nodeIds, urgency, sentiment, intensity, text, minutesAgo, source: 'simulated' };
}

function summarize(tripId: string, signals: SocialSignal[]): SocialSignals {
  const overall = signals.length ? Math.round((signals.reduce((a, b) => a + b.sentiment, 0) / signals.length) * 100) / 100 : 0.4;
  const alarming = signals.filter((x) => x.urgency === 'high' || x.urgency === 'critical').length;
  return { tripId, signals, overallSentiment: overall, summary: alarming ? `${alarming} high-urgency traveler report(s) along your route.` : 'Traveler chatter along your route is calm.' };
}

export function scenarioSignals(tripId: string, nodes: ItineraryNodeData[], s: WeatherScenarioRequest, run: TwinRunResult): SocialSignals {
  const out: SocialSignal[] = [];
  let k = 0;
  for (const hub of hubs(nodes)) {
    const exposed = hub.nodeIds.filter((id) => run.impacts.get(id)?.status !== 'healthy');
    if (!exposed.length) continue;
    const ago = 2 + (k++ * 7) % 25;
    if (s.rainfallMmPerHour > 35) out.push(signal(hub, 'road_waterlogging', s.rainfallMmPerHour > 60 ? 'critical' : 'high', -0.7, Math.min(1, s.rainfallMmPerHour / 80), `Knee-deep water on the main approach roads in ${hub.location}; cabs quoting 2× fares and long detours.`, ago));
    if (hub.airport && (s.visibilityMeters < 800 || s.windSpeedKmh > 60)) out.push(signal(hub, 'airport_congestion', 'high', -0.6, 0.8, `${hub.location} airport: departure boards full of delays, queues snaking outside security.`, ago + 3));
    if (severityOf(s) > 0.45) out.push(signal(hub, 'weather_warning', severityOf(s) > 0.75 ? 'critical' : 'medium', -0.4, severityOf(s), `IMD-style alert circulating for ${hub.location}: ${s.scenarioName.toLowerCase()} expected for ~${s.stormDurationHours}h.`, ago + 9));
    if (s.stormDurationHours >= 8 && s.rainfallMmPerHour > 30) out.push(signal(hub, 'transit_strike', 'medium', -0.5, 0.5, `Local transport unions in ${hub.location} suspend late services until the storm passes.`, ago + 14));
    if (s.temperatureCelsius > 44) out.push(signal(hub, 'crowd_surge', 'medium', -0.3, 0.4, `Travelers in ${hub.location} crowding indoor venues and shaded platforms to escape the heat.`, ago + 5));
  }
  if (!out.length) out.push(signal(hubs(nodes)[0] ?? { location: 'Route', lat: null, lng: null, nodeIds: [], airport: false }, 'all_clear', 'low', 0.6, 0.1, 'Travelers along your route report normal operations.', 4));
  return summarize(tripId, out.sort((a, b) => a.minutesAgo - b.minutesAgo));
}

/** Current-conditions signals for the ticker; `tick` rotates the feed between polls. */
export function liveSignals(tripId: string, nodes: ItineraryNodeData[], tick: number): SocialSignals {
  const hs = hubs(nodes);
  if (!hs.length) return summarize(tripId, []);
  const disrupted = nodes.filter((n) => n.status !== 'healthy' && n.status !== 'recovered' && commitment(n));
  const out: SocialSignal[] = [];
  const shift = tick % 5;
  hs.forEach((hub, i) => {
    const hot = hub.nodeIds.some((id) => disrupted.some((d) => d.id === id));
    if (hot && hub.airport) out.push(signal(hub, 'airport_congestion', 'high', -0.55, 0.7, `${hub.location}: travelers report rolling delays and crowded gates.`, 3 + shift + i));
    else if (hot) out.push(signal(hub, 'crowd_surge', 'medium', -0.35, 0.45, `Queues building at ${hub.location} as rebooked travelers arrive.`, 6 + shift + i));
    else out.push(signal(hub, 'all_clear', 'low', 0.55, 0.1, `${hub.location}: operations normal, roads moving.`, 10 + ((shift + i * 3) % 20)));
  });
  return summarize(tripId, out.sort((a, b) => a.minutesAgo - b.minutesAgo));
}

// ---- Weather exposure (synthetic climatology, no network) ------------------------------------

export function vulnerabilityIndex(n: ItineraryNodeData): number {
  const mode = modeOf(n);
  const text = `${n.title} ${n.location}`;
  if (n.category === 'activity') return OUTDOOR_RE.test(text) ? 88 : 55;
  if (mode === 'transfer') return MOUNTAIN_RE.test(text) ? 78 : 58;
  if (mode === 'flight') return 62;
  if (mode === 'train') return 46;
  if (n.category === 'connection') return 38;
  return 12;
}

export function syntheticConditions(lat: number, moment: Date): HourlyWeather {
  const month = moment.getMonth();
  const monsoon = lat > 5 && lat < 35 && month >= 5 && month <= 8;
  const hour = moment.getHours();
  const temp = Math.round(32 - Math.abs(lat - 15) * 0.35 + (hour > 11 && hour < 17 ? 4 : -2));
  const rain = monsoon ? 6 + ((moment.getDate() * 7) % 12) : 0;
  const pop = monsoon ? 70 : 12;
  return {
    time: iso(moment), temperatureC: temp, precipitationProbability: pop, rainfallMm: rain, windSpeedKmh: monsoon ? 24 : 11,
    cloudCover: monsoon ? 85 : 20, visibilityM: monsoon ? 4000 : 10000, weatherCode: monsoon ? 63 : 1,
    label: monsoon ? 'Moderate rain' : 'Mainly clear', riskPercent: monsoon ? 58 : 8,
  };
}

export function tripWeather(tripId: string, nodes: ItineraryNodeData[]) {
  const out: NodeWeather[] = nodes.filter(commitment).map((n) => {
    const conditions = n.lat != null ? syntheticConditions(n.lat, startOf(n)) : null;
    const wvi = vulnerabilityIndex(n);
    return { nodeId: n.id, title: n.title, category: n.category, location: n.location, lat: n.lat ?? null, lng: n.lng ?? null, scheduledStart: n.scheduledStart ?? '', conditions, vulnerabilityIndex: wvi, exposure: conditions ? Math.round((wvi * conditions.riskPercent) / 100) : 0, source: conditions ? 'fallback' as const : 'unavailable' as const };
  });
  const top = [...out].sort((a, b) => b.exposure - a.exposure)[0];
  return { tripId, nodes: out, maxExposure: top?.exposure ?? 0, mostExposedNodeId: top?.nodeId ?? null, summary: top && top.exposure >= 30 ? `${top.title} is the most weather-exposed booking (${top.exposure}/100).` : 'Forecast weather poses low risk to this trip.' };
}

// ---- Full simulation --------------------------------------------------------------------

function summary(nodes: ItineraryNodeData[], statusOf: (n: ItineraryNodeData) => string, health: number): TwinStateSummary {
  const committed = nodes.filter(commitment);
  const risky = committed.filter((n) => !['healthy', 'recovered'].includes(statusOf(n)));
  return { healthScore: health, atRiskCommitments: risky.length, totalCommitments: committed.length, costExposure: Math.round(risky.reduce((sum, n) => sum + n.cost, 0)) };
}

export function simulateTwin(tripId: string, nodes: ItineraryNodeData[], edges: TwinEdge[], liveHealth: number, s: WeatherScenarioRequest): Omit<DigitalTwinSimulation, 'simulationId' | 'expiresAt'> {
  if (!nodes.length) throw new Error('This trip has no bookings to simulate.');
  const run = runTwin(nodes, edges, s);
  const sev = severityOf(s);
  const social = scenarioSignals(tripId, nodes, s, run);
  const intensity = new Map<string, number>();
  social.signals.forEach((sig) => sig.nodeIds.forEach((id) => intensity.set(id, Math.max(intensity.get(id) ?? 0, sig.intensity))));
  const risks = risksFor(nodes, edges, run, sev, intensity);
  const twinNodes: TwinNode[] = nodes.map((n) => {
    const imp = run.impacts.get(n.id)!;
    const hit = run.hits.get(n.id);
    return { nodeId: n.id, title: n.title, category: n.category, mode: modeOf(n), liveStatus: n.status, twinStatus: imp.status, reason: imp.reason, directHit: !!hit, driver: hit?.driver ?? null, delayMinutes: imp.shift, lat: n.lat ?? null, lng: n.lng ?? null };
  });
  const cascade: CascadeLink[] = [
    ...[...run.hits.keys()].map((id) => ({ fromNodeId: 'weather', toNodeId: id, status: run.impacts.get(id)!.status })),
    ...[...run.impacts.entries()].filter(([id, imp]) => imp.causedBy && imp.status !== 'healthy' && !run.hits.has(id)).map(([id, imp]) => ({ fromNodeId: imp.causedBy!, toNodeId: id, status: imp.status })),
  ];
  const { text, tips } = explain(nodes, s, run, risks);
  const live = summary(nodes, (n) => n.status, liveHealth);
  return {
    tripId, scenarioName: s.scenarioName, severity: sev, stormWindowStart: iso(run.window[0]), stormWindowEnd: iso(run.window[1]),
    live, twin: summary(nodes, (n) => run.impacts.get(n.id)!.status, run.health), healthDelta: run.health - liveHealth,
    nodes: twinNodes, risks, cascade, options: buildOptions(nodes, edges, s, run), socialSignals: social,
    explanation: text, explanationSource: 'heuristic', model: null, mitigation: tips, mitigationSource: 'heuristic',
  };
}
