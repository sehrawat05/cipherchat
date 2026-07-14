import { useAuth } from './state/auth';
import { Auth } from './pages/Auth';
import { Chat } from './pages/Chat';
import { LockIcon } from './components/icons';

export function App() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="grid h-14 w-14 animate-pulse-ring place-items-center rounded-2xl bg-gradient-to-br from-cipher-500 to-glow text-ink-950">
            <LockIcon className="h-7 w-7" />
          </div>
          <p className="text-sm text-white/40">Restoring secure session…</p>
        </div>
      </div>
    );
  }

  return <div className="h-full">{user ? <Chat /> : <Auth />}</div>;
}
