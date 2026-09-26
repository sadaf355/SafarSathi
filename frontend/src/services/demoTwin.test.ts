import { describe, expect, it } from 'vitest';
import { demoBackend } from './demoBackend';
import { runTwin, severityOf, simulateTwin } from './demoTwin';
import { SCENARIO_PRESETS } from '@/lib/digitalTwin';

const HERO = 'demo-golden-triangle';
const preset = (id: string) => SCENARIO_PRESETS.find((p) => p.id === id)!.scenario;
const edges = [
  { source: 'bom-del', target: 'del-connection', requiredBuffer: 0 },
  { source: 'del-connection', target: 'del-agc', requiredBuffer: 30 },
];

describe('offline Digital Twin', () => {
  it('scores scenario severity like the backend engine', () => {
    expect(severityOf({ ...preset('fog'), scenarioName: 'x' })).toBeGreaterThan(0.6);
    expect(severityOf({ scenarioName: 'calm', rainfallMmPerHour: 0, windSpeedKmh: 10, visibilityMeters: 10000, temperatureCelsius: 25, stormDurationHours: 2 })).toBe(0);
  });

  it('grounds a flight in fog and breaks the timed train connection downstream', async () => {
    const trip = await demoBackend.resetTrip(HERO);
    const sim = simulateTwin(HERO, trip.nodes, edges, trip.healthScore, preset('fog'));
    const byId = new Map(sim.nodes.map((n) => [n.nodeId, n]));
    expect(byId.get('bom-del')).toMatchObject({ directHit: true, driver: 'visibility', twinStatus: 'delayed', delayMinutes: 180 });
    expect(byId.get('del-agc')?.twinStatus).toBe('broken');
    expect(sim.cascade).toContainEqual({ fromNodeId: 'weather', toNodeId: 'bom-del', status: 'delayed' });
    expect(sim.twin.healthScore).toBeLessThan(sim.live.healthScore);
    expect(sim.explanation).toMatch(/Dense Fog Ground Stop/);
    expect(sim.explanationSource).toBe('heuristic');
    expect(sim.options.filter((o) => o.recommended)).toHaveLength(1);
    expect(sim.socialSignals.signals.every((s) => s.source === 'simulated')).toBe(true);
  }, 15000);

  it('leaves a light drizzle with no impact and no options', async () => {
    const trip = await demoBackend.resetTrip(HERO);
    const drizzle = { scenarioName: 'Light Drizzle', rainfallMmPerHour: 3, windSpeedKmh: 12, visibilityMeters: 7000, temperatureCelsius: 24, stormDurationHours: 3 };
    const run = runTwin(trip.nodes, edges, drizzle);
    expect(run.hits.size).toBe(0);
    const sim = simulateTwin(HERO, trip.nodes, edges, trip.healthScore, drizzle);
    expect(sim.options).toEqual([]);
    expect(sim.explanation).toMatch(/none of your bookings are exposed/);
  }, 15000);

  it('applies a preemptive plan once, then rejects the spent simulation', async () => {
    await demoBackend.resetTrip(HERO);
    const sim = await demoBackend.simulateDigitalTwin(HERO, preset('fog'));
    const best = sim.options.find((o) => o.recommended)!;
    const result = await demoBackend.applyDigitalTwin(HERO, sim.simulationId, best.id);
    expect(result.appliedOption.id).toBe(best.id);
    expect(result.trip.status).toBe('operational');
    const changed = result.trip.nodes.find((n) => n.id === best.changes[0].nodeId)!;
    expect(changed.status).toBe('recovered');
    expect(changed.scheduledStart).toBe(best.changes[0].newStart);
    await expect(demoBackend.applyDigitalTwin(HERO, sim.simulationId, best.id)).rejects.toThrow(/not found or expired/);
  }, 15000);

  it('refuses a stale simulation after the itinerary changes', async () => {
    const trip = await demoBackend.resetTrip(HERO);
    const sim = await demoBackend.simulateDigitalTwin(HERO, preset('fog'));
    await demoBackend.deleteNode(HERO, trip.nodes[trip.nodes.length - 1].id);
    await expect(demoBackend.applyDigitalTwin(HERO, sim.simulationId, sim.options[0].id)).rejects.toThrow(/changed since this simulation/);
    await demoBackend.resetTrip(HERO);
  }, 15000);
});
