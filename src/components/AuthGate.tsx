import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  if (!ready) return <div className="p-8 text-zinc-400">Loading…</div>;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <form onSubmit={sendLink} className="w-80 space-y-4 rounded-xl bg-zinc-900 p-6">
          <h1 className="text-lg font-semibold">MTG Collection Search</h1>
          {sent ? (
            <p className="text-sm text-emerald-400">
              Check your email for a sign-in link.
            </p>
          ) : (
            <>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
              >
                Send magic link
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </>
          )}
        </form>
      </div>
    );
  }

  return <>{children(user)}</>;
}
