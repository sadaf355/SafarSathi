import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DisruptionModal } from './DisruptionModal';
import * as AppContextModule from '@/store/AppContext';
import * as api from '@/services/api';
import type { ItineraryNodeData, Trip } from '@/types';

vi.mock('@/store/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/lib/router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }));
vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  return { ...actual, simulateDisruption: vi.fn(), extractDisruption: vi.fn() };
});

function node(id: string, category: ItineraryNodeData['category'], title: string): ItineraryNodeData {
  return {
    id, category, title, label: title, subtitle: '', location: '', scheduledTime: '', provider: 'X', cost: 0,
    cancellationPolicy: '', refundable: false, riskLevel: 0, dependencyCount: 0, status: 'healthy', day: 1, icon: '',
  };
}

const trip: Trip = {
  id: 'trip-1', name: 'Ladakh', travelerName: 'A', route: 'BOM → IXL', origin: 'BOM', destination: 'IXL',
  startDate: '', endDate: '', tripValue: 0, healthScore: 90, status: 'operational', days: [], edges: [],
  nodes: [node('bom-del', 'flight', 'Mumbai → Delhi'), node('del-leh', 'flight', 'Delhi → Leh'), node('grand-dragon', 'hotel', 'Grand Dragon Ladakh')],
};

const triggerDisruption = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(AppContextModule.useApp).mockReturnValue({ triggerDisruption, tripId: 'trip-1', isBusy: false, trip } as unknown as ReturnType<typeof AppContextModule.useApp>);
  vi.mocked(api.simulateDisruption).mockResolvedValue({
    disruption: { id: 'preview', type: 'flight-delay', label: 'x', primaryNodeId: 'bom-del', impactLevel: 'low', directImpact: 1, downstreamImpact: 0, financialExposure: 0, refundExposure: 0, cascadeSteps: [], detectedAt: '' },
    impacts: [], sequence: [], tripHealthScore: 90,
  });
});

describe('DisruptionModal', () => {
  it('lets the traveler pick which booking, and previews that booking', async () => {
    render(<DisruptionModal open onClose={() => {}} />);
    const picker = screen.getByLabelText('Which booking?') as HTMLSelectElement;
    // Flight delay: only flights are offered.
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(['', 'bom-del', 'del-leh']);

    fireEvent.change(picker, { target: { value: 'del-leh' } });

    await waitFor(() => expect(api.simulateDisruption).toHaveBeenLastCalledWith('trip-1', expect.objectContaining({ type: 'flight-delay', primaryNodeId: 'del-leh' })));
    fireEvent.click(screen.getByText('Confirm Disruption'));
    await waitFor(() => expect(triggerDisruption).toHaveBeenCalledWith('flight-delay', expect.objectContaining({ primaryNodeId: 'del-leh' })));
  });

  it('drops a booking that does not fit a newly chosen disruption type', async () => {
    render(<DisruptionModal open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Which booking?'), { target: { value: 'del-leh' } });

    fireEvent.click(screen.getByText('Hotel Cancellation'));

    const picker = screen.getByLabelText('Which booking?') as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(['', 'grand-dragon']);
    fireEvent.click(screen.getByText('Confirm Disruption'));
    await waitFor(() => expect(triggerDisruption).toHaveBeenCalledWith('hotel-cancellation', expect.objectContaining({ primaryNodeId: undefined })));
  });

  it('debounces the impact preview while the delay slider moves', async () => {
    render(<DisruptionModal open onClose={() => {}} />);
    await waitFor(() => expect(api.simulateDisruption).toHaveBeenCalledTimes(1));
    const slider = screen.getByLabelText('Delay in minutes');
    for (const v of [100, 105, 110, 115, 120]) fireEvent.change(slider, { target: { value: String(v) } });

    await waitFor(() => expect(api.simulateDisruption).toHaveBeenLastCalledWith('trip-1', expect.objectContaining({ delayMinutes: 120 })));
    expect(api.simulateDisruption).toHaveBeenCalledTimes(2);
  });
});
