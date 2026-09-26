import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LoginScreen } from './LoginScreen';
import { AuthProvider } from '@/store/AuthContext';
import { ToastProvider } from '@/components/ui/ToastProvider';

const renderLogin = () => render(<AuthProvider><ToastProvider><LoginScreen /></ToastProvider></AuthProvider>);

afterEach(() => vi.unstubAllGlobals());

describe('LoginScreen demo traveler', () => {
  it('explains production mode when the backend has no seeded demo account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Demo account not seeded yet' }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    renderLogin();
    fireEvent.click(await screen.findByRole('button', { name: /Continue as Demo Traveler/ }));

    expect(await screen.findByText('Production mode active')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Production mode active — please create a new account or use Explore Offline Demo');
    expect(screen.queryByText(/not seeded/)).not.toBeInTheDocument();
  });
});
