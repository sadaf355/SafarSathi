import { useState, type FormEvent } from 'react';
import { LifeBuoy, Loader2 } from 'lucide-react';
import { useAuth } from '@/store/AuthContext';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const { loginWithPassword, registerAccount, continueAsDemo, busy, error, wakingServer } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      loginWithPassword(email, password).catch(() => {});
    } else {
      registerAccount(name, email, password).catch(() => {});
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-safar-blue to-safar-blue shadow-card">
            <LifeBuoy className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900">SafarSathi</div>
            <div className="text-xs text-slate-600">Intelligent Travel Disruption Recovery</div>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-card' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-card' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="mb-1 block text-[10px] text-slate-500">Full name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-safar-blue/50 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[10px] text-slate-500">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-safar-blue/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-slate-500">Password</label>
              <input
                type="password"
                required
                minLength={1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-safar-blue/50 focus:outline-none"
              />
            </div>

            {wakingServer && !error && (
              <p className="text-xs text-slate-600">
                Waking up the SafarSathi server — this can take up to a minute on the first request.
              </p>
            )}
            {error && <p className="text-xs text-safar-broken">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-safar-blue to-safar-blue py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] text-slate-500">OR</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => continueAsDemo().catch(() => {})}
            className="w-full rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Continue as Demo Traveler (Aisha Khan)
          </button>
        </div>
      </div>
    </div>
  );
}
