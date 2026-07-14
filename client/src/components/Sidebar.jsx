import { Avatar } from './Avatar';
import { LockIcon, PlusIcon, LogoutIcon } from './icons';
import { formatRelative } from '../lib/format';

const STATUS_LABEL = {
  open: 'Secure channel',
  connecting: 'Connecting…',
  closed: 'Reconnecting…',
};

export function Sidebar({
  user,
  mySeed,
  myProfile,
  profiles,
  conversations,
  activeId,
  presence,
  socketStatus,
  typing,
  onSelect,
  onNewChat,
  onEditProfile,
  onLogout,
}) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-white/5 bg-ink-900/60 md:w-80">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cipher-500 to-glow text-ink-950">
            <LockIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">CipherChat</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  socketStatus === 'open' ? 'bg-glow' : 'bg-amber-400'
                }`}
              />
              {STATUS_LABEL[socketStatus]}
            </p>
          </div>
        </div>
        <button
          onClick={onNewChat}
          title="New conversation"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-white/70 transition hover:bg-cipher-500/20 hover:text-white"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>

      {/* conversation list */}
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {conversations.length === 0 && (
          <div className="mt-6 px-3 py-10 text-center text-sm text-white/40">
            No conversations yet.
            <br />
            Tap <span className="text-cipher-400">+</span> to start one.
          </div>
        )}
        {conversations.map((c) => {
          const p = profiles[c.other_id];
          const name = p?.displayName || c.other_username;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition ${
                activeId === c.id ? 'bg-cipher-500/15 ring-1 ring-cipher-400/30' : 'hover:bg-white/5'
              }`}
            >
              <Avatar
                name={name}
                seed={c.other_public_key ?? undefined}
                photo={p?.photo}
                online={presence.has(c.other_id)}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="shrink-0 text-[11px] text-white/30">
                    {formatRelative(c.last_at)}
                  </span>
                </div>
                <p className="truncate text-xs text-white/40">
                  {typing[c.id] ? (
                    <span className="text-glow">typing…</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <LockIcon className="h-3 w-3" /> end-to-end encrypted
                    </span>
                  )}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* footer / self — click to edit profile */}
      <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
        <button
          onClick={onEditProfile}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-white/5"
          title="Edit profile"
        >
          <Avatar
            name={myProfile?.displayName || user.username}
            seed={mySeed}
            photo={myProfile?.photo}
            size="sm"
            online
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {myProfile?.displayName || user.username}
            </p>
            <p className="text-[11px] text-white/40">Edit profile</p>
          </div>
        </button>
        <button
          onClick={onLogout}
          title="Log out"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/50 transition hover:bg-red-500/10 hover:text-red-300"
        >
          <LogoutIcon className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
