import type { NodeStatus, EdgeStatus, ItineraryNodeData } from '@/types';

export const statusColors: Record<NodeStatus, { text: string; bg: string; border: string; dot: string }> = {
  healthy: { text: 'text-safar-safe', bg: 'bg-safar-safe/10', border: 'border-safar-safe/30', dot: 'bg-safar-safe' },
  'at-risk': { text: 'text-safar-risk', bg: 'bg-safar-saffron/10', border: 'border-safar-saffron/40', dot: 'bg-safar-saffron' },
  broken: { text: 'text-safar-broken', bg: 'bg-safar-broken/10', border: 'border-safar-broken/30', dot: 'bg-safar-broken' },
  delayed: { text: 'text-safar-saffron', bg: 'bg-safar-saffron/10', border: 'border-safar-saffron/30', dot: 'bg-safar-saffron' },
  cancelled: { text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300', dot: 'bg-slate-500' },
  recovered: { text: 'text-safar-blue', bg: 'bg-safar-blue/10', border: 'border-safar-blue/30', dot: 'bg-safar-blue' },
};

export const edgeColors: Record<EdgeStatus, string> = {
  healthy: '#16A34A',
  'at-risk': '#F59E0B',
  broken: '#EF4444',
  recovered: '#2563EB',
};

export const statusLabel: Record<NodeStatus, string> = {
  healthy: 'Healthy', 'at-risk': 'At Risk', broken: 'Broken', delayed: 'Delayed', cancelled: 'Cancelled', recovered: 'Recovered',
};

export function formatCurrency(amount: number): string { return `₹${amount.toLocaleString('en-IN')}`; }
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  if (h === 0) return `+${m}m`; if (m === 0) return `+${h}h`; return `+${h}h ${m}m`;
}
export function riskColor(percent: number): string { if (percent >= 60) return 'text-safar-broken'; if (percent >= 30) return 'text-safar-risk'; return 'text-safar-safe'; }
export function delayLabel(node: Pick<ItineraryNodeData, 'scheduledEnd' | 'actualEnd'>): string {
  if (node.scheduledEnd && node.actualEnd) {
    const minutes = Math.round((new Date(node.actualEnd).getTime() - new Date(node.scheduledEnd).getTime()) / 60000);
    if (minutes > 0) { const h = Math.floor(minutes / 60); const m = minutes % 60; return `DELAYED +${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}m` : ''}`; }
  }
  return 'DELAYED';
}
export function riskBg(percent: number): string { if (percent >= 60) return 'bg-safar-broken'; if (percent >= 30) return 'bg-safar-risk'; return 'bg-safar-safe'; }
