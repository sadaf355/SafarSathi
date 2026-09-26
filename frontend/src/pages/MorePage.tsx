import { useState } from 'react';
import { ActivityPage } from '@/pages/ActivityPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PageHeader } from '@/components/ui/PageHeader';
import { Play, Settings, History } from 'lucide-react';

interface MorePageProps { onNavigate: (page: string) => void; onRunDemo?: () => void; }
type Tab = 'more' | 'activity' | 'settings';

export function MorePage({ onNavigate, onRunDemo }: MorePageProps) {
  const [tab, setTab] = useState<Tab>('more');
  if (tab === 'activity') return <div className="animate-slide-in-right"><div className="mb-4 flex items-center justify-between"><button onClick={()=>setTab('more')} className="text-xs font-semibold text-safar-blue">← More</button><span className="text-xs text-slate-500">More / Activity</span></div><ActivityPage onNavigate={onNavigate} /></div>;
  if (tab === 'settings') return <div className="animate-slide-in-right"><div className="mb-4 flex items-center justify-between"><button onClick={()=>setTab('more')} className="text-xs font-semibold text-safar-blue">← More</button><span className="text-xs text-slate-500">More / Settings</span></div><SettingsPage onNavigate={onNavigate} /></div>;
  return <div><PageHeader title="More" description="Secondary tools and account controls." crumbs={['Home','More']} onNavigate={onNavigate} /><div className="grid max-w-3xl gap-3 sm:grid-cols-3">
    <MoreCard icon={<History />} title="Activity" description="See what SafarSathi has changed or detected." onClick={()=>setTab('activity')} />
    <MoreCard icon={<Settings />} title="Preferences" description="Choose how recovery plans should be ranked." onClick={()=>setTab('settings')} />
    <MoreCard icon={<Play />} title="Demo Mode" description="Run the complete disruption-to-recovery story." onClick={onRunDemo ?? (()=>onNavigate('overview'))} />
  </div></div>;
}
function MoreCard({icon,title,description,onClick}:{icon:React.ReactNode;title:string;description:string;onClick:()=>void}) { return <button onClick={onClick} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-safar-blue/30"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-safar-blue/10 text-safar-blue">{icon}</div><h2 className="mt-4 text-sm font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-600">{description}</p><span className="mt-4 inline-block text-xs font-semibold text-safar-blue">Open →</span></button>; }
