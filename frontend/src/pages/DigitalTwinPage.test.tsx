import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DigitalTwinPage } from './DigitalTwinPage';
import { ToastProvider } from '@/components/ui/ToastProvider';
import * as AppContextModule from '@/store/AppContext';
import * as api from '@/services/api';
import { demoBackend } from '@/services/demoBackend';
import type { Trip } from '@/types';

vi.mock('@/store/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/lib/router', () => ({ useRouter: () => ({ navigate: vi.fn(), route: 'digital-twin', params: {}, consumeParams: vi.fn() }) }));
// Leaflet needs a real layout engine; the overlay gets its own props checked instead.
vi.mock('@/components/map/DigitalTwinMapOverlay', () => ({
  DigitalTwinMapOverlay: ({ points, cascade }: { points: { id: string; directHit?: boolean }[]; cascade?: unknown[] }) => (
    <div data-testid="twin-map" data-hits={points.filter((p) => p.directHit).length} data-cascade={cascade?.length ?? 0} />
  ),
}));

const HERO = 'demo-golden-triangle';
let trip: Trip;
const reload = vi.fn(async () => { trip = await demoBackend.getItinerary(HERO); });

beforeAll(() => api.setDataMode('demo'));
afterAll(() => api.setDataMode('live'));
beforeEach(async () => {
  trip = await demoBackend.resetTrip(HERO);
  reload.mockClear();
  vi.mocked(AppContextModule.useApp).mockImplementation(() => ({ trip, reload }) as unknown as ReturnType<typeof AppContextModule.useApp>);
});

const renderPage = () => render(<ToastProvider><DigitalTwinPage /></ToastProvider>);

describe('DigitalTwinPage', () => {
  it('shows presets, the live map and simulated traveler signals before a run', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Weather Digital Twin' })).toBeInTheDocument();
    for (const name of ['Monsoon Deluge', 'Dense Fog Ground Stop', 'Cyclonic Storm', 'Severe Heatwave']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getByTestId('twin-map')).toHaveAttribute('data-hits', '0');
    expect(await screen.findByText(/Forecast exposure/)).toBeInTheDocument();
    expect(screen.getByText('Simulated')).toBeInTheDocument();
  });

  it('runs a fog scenario and compares the live itinerary with its twin', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Dense Fog Ground Stop/ }));
    expect(screen.getByLabelText('Visibility')).toHaveValue('150');
    fireEvent.click(screen.getByRole('button', { name: /Run Digital Twin/ }));

    expect(await screen.findByRole('heading', { name: 'Live vs Digital Twin' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/Why the cascade happens/)).toBeInTheDocument();
    expect(screen.getByText('Heuristic reasoning engine')).toBeInTheDocument();
    expect(Number(screen.getByTestId('twin-map').getAttribute('data-hits'))).toBeGreaterThan(0);
    expect(Number(screen.getByTestId('twin-map').getAttribute('data-cascade'))).toBeGreaterThan(0);
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Scenario feed')).toBeInTheDocument();
  });

  it('asks for confirmation, then applies the plan to the live itinerary', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Dense Fog Ground Stop/ }));
    fireEvent.click(screen.getByRole('button', { name: /Run Digital Twin/ }));
    const applyButtons = await screen.findAllByRole('button', { name: 'Apply Preemptive Recovery' }, { timeout: 4000 });
    fireEvent.click(applyButtons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/These changes will be made to your live itinerary/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm & apply/ }));

    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 4000 });
    expect(await screen.findByText(/Live itinerary updated and re-validated/)).toBeInTheDocument();
    expect((await demoBackend.getItinerary(HERO)).nodes.some((n) => n.status === 'recovered')).toBe(true);
  });

  it('blocks applying a weather plan while a disruption is active', async () => {
    trip = { ...trip, status: 'disrupted' };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Run Digital Twin/ }));
    expect(await screen.findByText(/Resolve the active disruption/, undefined, { timeout: 4000 })).toBeInTheDocument();
    screen.queryAllByRole('button', { name: 'Apply Preemptive Recovery' }).forEach((b) => expect(b).toBeDisabled());
  });
});
