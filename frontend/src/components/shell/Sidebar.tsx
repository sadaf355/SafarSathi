import { cn } from '@/lib/utils';
import { useAuth } from '@/store/AuthContext';
import { Home, Map, AlertTriangle, Briefcase, Sparkles, MoreHorizontal, ChevronLeft, LogOut } from 'lucide-react';

export type PageId = 'overview' | 'journey' | 'risk' | 'trips' | 'sathi' | 'more' | 'impact' | 'recovery';

interface SidebarProps {
  current: PageId;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems: { id: PageId; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Home', icon: Home },
  { id: 'journey', label: 'Journey', icon: Map },
  { id: 'risk', label: 'Risks', icon: AlertTriangle },
  { id: 'trips', label: 'Trips', icon: Briefcase },
  { id: 'sathi', label: 'Sathi AI', icon: Sparkles },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export function Sidebar({ current, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const { profile, logout } = useAuth();
  const displayName = profile?.name ?? 'Traveler';
  const initial = displayName.charAt(0).toUpperCase() || 'T';
  const active = (id: PageId) => current === id || (id === 'journey' && current === 'impact');

  return (
    <aside className={cn('relative z-30 flex h-screen shrink-0 flex-col bg-safar-navy text-white transition-all duration-300', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('px-4 py-5', collapsed && 'px-2')}>
        <button onClick={() => onNavigate('overview')} className={cn('flex items-center gap-3 text-left', collapsed && 'justify-center w-full')} aria-label="SafarSathi Home">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-safar-navy shadow-card">✈</div>
          {!collapsed && <div><div className="text-base font-bold tracking-tight">SafarSathi</div><div className="text-[10px] text-blue-100/70">Your Travel Companion</div></div>}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = active(item.id);
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)} aria-current={isActive ? 'page' : undefined} title={collapsed ? item.label : undefined}
              className={cn('group relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors', isActive ? 'bg-white text-safar-navy' : 'text-blue-100/75 hover:bg-white/10 hover:text-white', collapsed && 'justify-center')}>
              <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-safar-blue' : '')} />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        {!collapsed && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-safar-safe" /><span className="text-xs font-medium">Current trip</span></div>
            <div className="mt-2 text-[11px] text-blue-100/70">Monitoring normally</div>
          </div>
        )}
        <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-safar-sky text-xs font-bold text-safar-navy">{initial}</div>
          {!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{displayName}</div><div className="truncate text-[10px] text-blue-100/60">Traveler</div></div>}
          {!collapsed && <button onClick={logout} className="rounded-lg p-1.5 text-blue-100/60 hover:bg-white/10 hover:text-white" aria-label="Log out"><LogOut className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
      <button onClick={onToggleCollapse} className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-card" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform', collapsed && 'rotate-180')} />
      </button>
    </aside>
  );
}
