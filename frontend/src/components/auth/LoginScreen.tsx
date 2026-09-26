import { useState, type FormEvent } from 'react';
import { Loader2, Sparkles, WifiOff } from 'lucide-react';
import { useAuth } from '@/store/AuthContext';
import { Logo, ScriptTagline } from '@/components/brand/Logo';
import { sceneImages } from '@/lib/destinationImages';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'register';

/** Sign-in: backend account, the seeded demo traveler, or a fully offline demo. */
export function LoginScreen() {
  const { loginWithPassword, registerAccount, continueAsDemo, continueOffline, busy, error, offline, wakingServer } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const action = mode === 'login' ? loginWithPassword(email, password) : registerAccount(name, email, password);
    action.catch(() => {});
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <img src={sceneImages.heroIndiaGate} alt="India Gate at sunset" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <h1 className="max-w-lg font-display text-4xl font-extrabold leading-tight">Your journey, always with you.</h1>
          <p className="mt-3 max-w-md text-white/85">Safar Sathi monitors every leg of your trip, detects disruptions, and prepares recovery options before you have to ask.</p>
          <ScriptTagline lines={['Same Destinations.', 'Fewer Disruptions.']} className="mt-6 text-3xl text-white/90" />
        </div>
      </div>

      <div className="flex w-full items-center justify-center px-4 py-10 lg:w-[520px]">
        <div className="w-full max-w-sm">
          <Logo className="mb-8" />
          <h2 className="font-display text-2xl font-bold text-ink">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-ink-muted">Sign in to see your trips and live disruption updates.</p>

          <div className="mt-6 flex gap-1 rounded-xl border border-line bg-white p-1">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('flex-1 rounded-lg py-2 text-sm font-semibold transition', mode === m ? 'bg-brand text-white shadow-glow' : 'text-ink-soft hover:bg-canvas')}>
                {m === 'login' ? 'Log In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            {mode === 'register' && (
              <div>
                <label htmlFor="name" className="mb-1 block text-xs font-medium text-ink-soft">Full name</label>
                <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="field" autoComplete="name" />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-soft">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" autoComplete="email" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink-soft">Password</label>
              <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>

            {wakingServer && !error && <p className="text-xs text-ink-muted">Waking up the Safar Sathi server — the first request can take up to a minute.</p>}
            {error && (
              <div role="alert" className="rounded-xl border border-danger/20 bg-danger-light/60 p-3 text-xs text-danger">
                {error}
                {offline && <div className="mt-1 text-ink-soft">The backend isn't reachable. You can still explore Safar Sathi with offline demo data.</div>}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-ink-faint"><div className="h-px flex-1 bg-line" />OR<div className="h-px flex-1 bg-line" /></div>

          <div className="space-y-2">
            <button type="button" disabled={busy} onClick={() => continueAsDemo().catch(() => {})} className="btn-outline w-full py-3">
              <Sparkles className="h-4 w-4" /> Continue as Demo Traveler
            </button>
            <button type="button" disabled={busy} onClick={() => continueOffline()} className={cn('btn w-full py-3', offline ? 'bg-ai text-white hover:brightness-110' : 'border border-line bg-white text-ink-soft hover:bg-canvas')}>
              <WifiOff className="h-4 w-4" /> Explore offline demo
            </button>
            <p className="pt-1 text-center text-[11px] leading-relaxed text-ink-muted">The offline demo runs entirely in your browser with sample trips — no account or backend needed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
