import { describe, expect, it } from 'vitest';
import { demoBackend } from './demoBackend';

const HERO = 'demo-golden-triangle';

describe('demoBackend (offline demo data source)', () => {
  it('lists the demo trips with the hero trip mid-disruption', async () => {
    const trips = await demoBackend.listTrips();
    expect(trips.map((t) => t.route)).toContain('Mumbai → Delhi → Agra');
    const hero = await demoBackend.getItinerary(HERO);
    expect(hero.status).toBe('disrupted');
    expect(hero.nodes.find((n) => n.id === 'bom-del')?.status).toBe('delayed');
    expect(hero.nodes.find((n) => n.id === 'del-agc')?.status).toBe('at-risk');
  }, 15000);

  it('generates ranked recovery options and applies one, re-validating the trip', async () => {
    const options = await demoBackend.generateRecoveryOptions(HERO);
    expect(options).toHaveLength(3);
    expect(options[0].score).toBeGreaterThanOrEqual(options[1].score);

    const result = await demoBackend.applyRecovery(HERO, options[0].id);
    expect(result.trip.status).toBe('recovered');
    expect(result.trip.nodes.some((n) => n.status === 'at-risk' || n.status === 'broken')).toBe(false);
  }, 15000);

  it('reset restores a healthy itinerary and a new disruption propagates again', async () => {
    const reset = await demoBackend.resetTrip(HERO);
    expect(reset.nodes.every((n) => n.status === 'healthy')).toBe(true);
    const result = await demoBackend.triggerDisruption(HERO, { type: 'flight-delay', delayMinutes: 240 });
    expect(result.impacts.some((i) => i.status === 'broken')).toBe(true);
  }, 15000);

  it('reports unknown trips as not found', async () => {
    await expect(demoBackend.getItinerary('nope')).rejects.toThrow(/not found/);
  });
});
