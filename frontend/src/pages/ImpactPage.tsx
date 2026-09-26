import { ImpactAnalysisPanel } from '@/components/disruption/ImpactAnalysisPanel';
import { PageHeader } from '@/components/ui/PageHeader';

export function ImpactPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  return <div><PageHeader title="Impact Analysis" description="See what changed, why it changed, and what your journey is exposed to." crumbs={['Home','Journey','Impact']} onNavigate={onNavigate} /><ImpactAnalysisPanel fullPage onNavigate={onNavigate} /></div>;
}
