import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Avatar } from './Avatar';
import { SearchIcon } from './icons';

export function NewChatModal({ onClose, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { users } = await api(`/users?q=${encodeURIComponent(q.trim())}`);
        setResults(users);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md rounded-3xl p-5 shadow-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-bold">Start a conversation</h3>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-3 h-5 w-5 text-white/40" />
          <input
            autoFocus
            className="input pl-11"
            placeholder="Search by username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {loading && <p className="px-2 py-3 text-sm text-white/40">Searching…</p>}
          {!loading && q && results.length === 0 && (
            <p className="px-2 py-3 text-sm text-white/40">No users found.</p>
          )}
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => onPick(u)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/5"
            >
              <Avatar name={u.username} size="sm" />
              <span className="font-medium">{u.username}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
