import { useState, useCallback, useRef, useEffect } from 'react';
import { AppProvider, useApp } from '@/store/AppContext';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { LandingPage } from '@/components/landing/LandingPage';
import { Sidebar, type PageId } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { Overview } from '@/pages/Overview';
import { Trips } from '@/pages/Trips';
import { JourneyPage } from '@/pages/JourneyPage';
import { RiskIntelligence } from '@/pages/RiskIntelligence';
import { RecoveryCenter } from '@/components/recovery/RecoveryCenter';
import { ImpactPage } from '@/pages/ImpactPage';
import { SathiPage } from '@/pages/SathiPage';
import { MorePage } from '@/pages/MorePage';
import { NetworkStatusBanner } from '@/components/ui/NetworkStatusBanner';
import { CreateTripModal } from '@/components/trip/CreateTripModal';
import { LifeBuoy, WifiOff, Briefcase } from 'lucide-react';

type AppPage = PageId;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const NARROW_VIEWPORT_QUERY = '(max-width: 768px)';

function AppContent() {
  const [page, setPage] = useState<AppPage>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches);
  const [sathiOverlay, setSathiOverlay] = useState(false);
  const { triggerDisruption, applyRecoveryPlan, resetTrip, setDemoRunning, demoRunning, isBusy, recoveryOptions, error, reload, noTripFound, trip, loading } = useApp();
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const { addToast } = useToast();
  const demoCancelledRef = useRef(false);
  const recoveryOptionsRef = useRef(recoveryOptions);
  useEffect(() => { recoveryOptionsRef.current = recoveryOptions; }, [recoveryOptions]);

  const navigate = useCallback((next: string) => setPage(next as AppPage), []);
  useEffect(() => {
    const query = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const handler = (e: MediaQueryListEvent) => setSidebarCollapsed(e.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  const runDemo = useCallback(async () => {
    if (demoRunning || isBusy || !trip.resettable) return;
    demoCancelledRef.current = false; setDemoRunning(true);
    addToast('info', 'Demo Mode Started', 'Watch SafarSathi move from disruption to recovery.');
    try {
      await resetTrip(); setPage('overview'); await wait(650);
      if (demoCancelledRef.current) return;
      await triggerDisruption('flight-delay', { delayMinutes: 180 });
      if (demoCancelledRef.current) return;
      await wait(900); setPage('impact'); await wait(1800);
      if (demoCancelledRef.current) return;
      const top = recoveryOptionsRef.current.filter((o) => o.feasible !== false).sort((a, b) => b.score - a.score)[0];
      if (top) { setPage('recovery'); await wait(1800); if (!demoCancelledRef.current) { await applyRecoveryPlan(top.id); addToast('success', 'Journey Recovered', `${top.bookingsPreserved}/${top.totalBookings} commitments preserved.`); } }
    } catch { addToast('error', 'Demo Interrupted', 'Check the backend connection and try again.'); }
    finally { setDemoRunning(false); }
  }, [demoRunning, isBusy, trip.resettable, resetTrip, triggerDisruption, applyRecoveryPlan, addToast, setDemoRunning]);

  const handleReset = useCallback(async () => { demoCancelledRef.current = true; await resetTrip(); addToast('info', 'Journey Reset', 'Your itinerary is back to its healthy state.'); }, [resetTrip, addToast]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar current={page} onNavigate={navigate} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar current={page} onOpenAI={() => setSathiOverlay(true)} onRunDemo={runDemo} onReset={handleReset} />
        {error && <div className="flex items-center gap-2 border-b border-safar-broken/20 bg-safar-broken/5 px-6 py-2 text-xs text-safar-broken"><WifiOff className="h-3.5 w-3.5" /><span>{error}</span><button onClick={() => reload()} className="ml-auto rounded-lg border border-safar-broken/20 bg-white px-2 py-1">Retry</button></div>}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-5 lg:p-7">
          {noTripFound && page !== 'trips' ? (
            <div className="flex min-h-full items-center justify-center p-8"><div className="max-w-md text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-card"><Briefcase className="h-7 w-7" /></div><h2 className="text-xl font-semibold text-slate-900">No trips yet</h2><p className="mt-2 text-sm text-slate-600">Create your first journey to start monitoring risks and recovery options.</p><button onClick={() => setCreateTripOpen(true)} className="mt-5 rounded-xl bg-safar-blue px-4 py-2.5 text-sm font-semibold text-white">Create a trip</button></div></div>
          ) : !trip.id && page !== 'trips' ? (
            // No trip loaded yet: never render pages against the blank placeholder trip.
            loading ? <div className="flex min-h-full items-center justify-center"><LifeBuoy className="h-6 w-6 animate-pulse text-safar-blue" /></div> : null
          ) : (
            <div key={page} className="animate-fade-in">
              {page === 'overview' && <Overview onNavigate={navigate} />}
              {page === 'journey' && <JourneyPage onNavigate={navigate} />}
              {page === 'risk' && <RiskIntelligence onNavigate={navigate} />}
              {page === 'trips' && <Trips onNavigate={navigate} />}
              {page === 'sathi' && <SathiPage onClose={() => navigate('overview')} />}
              {page === 'more' && <MorePage onNavigate={navigate} onRunDemo={trip.resettable ? runDemo : undefined} />}
              {page === 'impact' && <ImpactPage onNavigate={navigate} />}
              {page === 'recovery' && <RecoveryCenter onNavigate={navigate} />}
            </div>
          )}
        </main>
      </div>
      <SathiPage open={sathiOverlay} overlay onClose={() => setSathiOverlay(false)} />
      <CreateTripModal open={createTripOpen} onClose={() => setCreateTripOpen(false)} onCreated={() => { setCreateTripOpen(false); setPage('overview'); }} />
      <NetworkStatusBanner />
    </div>
  );
}

function Gate() {
  const { status } = useAuth();
  const [pastLanding, setPastLanding] = useState(false);
  if (status === 'checking') return <div className="flex h-screen items-center justify-center bg-slate-50"><LifeBuoy className="h-6 w-6 animate-pulse text-safar-blue" /></div>;
  if (status === 'unauthenticated') return !pastLanding ? <LandingPage onEnter={() => setPastLanding(true)} /> : <LoginScreen />;
  return <AppProvider><ToastProvider><AppContent /></ToastProvider></AppProvider>;
}
export default function App() { return <AuthProvider><Gate /></AuthProvider>; }
