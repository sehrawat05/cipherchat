import { useState } from 'react';
import { useAuth } from '../state/auth';
import { LockIcon, ShieldIcon } from '../components/icons';

const FEATURES = [
  'ECDH P-256 key agreement, derived per conversation',
  'AES-256-GCM message encryption, fresh IV each message',
  'Private keys never leave your device unencrypted',
  'The server stores only ciphertext — true zero-knowledge',
];

export function Auth() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await register(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Brand / story panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cipher-500 to-glow text-ink-950">
            <LockIcon className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">CipherChat</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            Messages encrypted <span className="text-glow">before</span> they leave your browser.
          </h1>
          <p className="mt-4 text-white/60">
            A zero-knowledge messenger. Not even the server can read what you send — it only
            ever holds ciphertext.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-white/70">
                <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-glow" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-mono text-xs text-white/30">
          Web Crypto API · ECDH · HKDF-SHA256 · AES-256-GCM
        </p>

        <div className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-cipher-500/20 blur-3xl" />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-3xl p-8 shadow-2xl">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cipher-500 to-glow text-ink-950">
              <LockIcon className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">CipherChat</span>
          </div>

          <h2 className="text-2xl font-bold">
            {mode === 'register' ? 'Create your identity' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-white/50">
            {mode === 'register'
              ? 'We generate an encryption key pair on this device.'
              : 'Unlock your encrypted keys with your password.'}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="alice"
                autoComplete="username"
                required
                minLength={3}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={8}
              />
              {mode === 'register' && (
                <p className="mt-1.5 text-xs text-white/40">
                  Also encrypts your private key. There is no recovery if you forget it.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy
                ? 'Working…'
                : mode === 'register'
                  ? 'Generate keys & register'
                  : 'Unlock & sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/50">
            {mode === 'register' ? 'Already have an account?' : 'New here?'}{' '}
            <button
              className="font-semibold text-cipher-400 hover:text-cipher-300"
              onClick={() => {
                setMode(mode === 'register' ? 'login' : 'register');
                setError(null);
              }}
            >
              {mode === 'register' ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
