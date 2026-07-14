import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { CheckIcon, DoubleCheckIcon, LockIcon, ShieldIcon } from './icons';
import { formatTime } from '../lib/format';
import { keyFingerprint } from '../crypto/e2ee';

export function MessageThread({
  conversation,
  profile,
  messages,
  me,
  online,
  peerTyping,
  loadingHistory,
  onSend,
  notifyTyping,
}) {
  const bottomRef = useRef(null);
  const [fingerprint, setFingerprint] = useState('');
  const [showSafety, setShowSafety] = useState(false);
  const [xray, setXray] = useState(false);

  const name = profile?.displayName || conversation.other_username;
  const accent = profile?.color || '#34e7c4';

  useEffect(() => {
    if (conversation.other_public_key) {
      keyFingerprint(conversation.other_public_key).then(setFingerprint);
    }
  }, [conversation.other_public_key]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerTyping]);

  return (
    <section className="flex h-full flex-1 flex-col bg-gradient-to-b from-transparent to-ink-950/40">
      {/* accent strip from the contact's profile color */}
      <div className="h-0.5 w-full" style={{ background: accent }} />

      {/* header */}
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            name={name}
            seed={conversation.other_public_key ?? undefined}
            photo={profile?.photo}
            online={online}
          />
          <div className="min-w-0">
            <p className="truncate font-bold leading-none">{name}</p>
            <p className="mt-1 truncate text-xs text-white/45">
              {peerTyping ? (
                <span className="text-glow">typing…</span>
              ) : profile?.bio ? (
                profile.bio
              ) : online ? (
                'online'
              ) : (
                'offline'
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setXray((x) => !x)}
            title="Reveal the ciphertext on the wire"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              xray
                ? 'border-cipher-400/40 bg-cipher-500/20 text-cipher-300'
                : 'border-white/10 text-white/50 hover:bg-white/5'
            }`}
          >
            <LockIcon className="h-4 w-4" />
            X-ray
          </button>
          <button
            onClick={() => setShowSafety((s) => !s)}
            className="flex items-center gap-1.5 rounded-full border border-glow/20 bg-glow/10 px-3 py-1.5 text-xs font-medium text-glow transition hover:bg-glow/20"
          >
            <ShieldIcon className="h-4 w-4" />
            Verified E2EE
          </button>
        </div>
      </header>

      {showSafety && (
        <div className="border-b border-white/5 bg-ink-900/60 px-5 py-3 animate-fade-up">
          <p className="text-xs text-white/50">
            Safety number — compare this with {name} over another channel to confirm no one is
            intercepting:
          </p>
          <p className="mt-1 font-mono text-sm tracking-widest text-glow">{fingerprint || '…'}</p>
        </div>
      )}

      {xray && (
        <div className="border-b border-cipher-400/20 bg-cipher-500/5 px-5 py-2 text-center text-[11px] text-cipher-300 animate-fade-up">
          X-ray on — showing the AES-256-GCM ciphertext that actually travels over the network.
        </div>
      )}

      {/* messages */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5 md:px-8">
        <div className="mx-auto mb-4 flex max-w-sm items-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-2.5 text-center text-xs text-white/45">
          <LockIcon className="h-4 w-4 shrink-0 text-glow" />
          Messages are end-to-end encrypted. No one outside this chat, not even CipherChat, can
          read them.
        </div>

        {loadingHistory && (
          <p className="py-6 text-center text-sm text-white/40">Decrypting history…</p>
        )}

        {messages.map((m, i) => {
          const mine = m.senderId === me.id;
          const prev = messages[i - 1];
          const grouped = prev && prev.senderId === m.senderId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? 'justify-end' : 'justify-start'} ${
                grouped ? 'mt-0.5' : 'mt-3'
              }`}
            >
              <div
                className={`group relative max-w-[78%] animate-fade-up rounded-2xl px-3.5 py-2 text-sm shadow-sm md:max-w-[65%] ${
                  mine
                    ? 'rounded-br-md bg-gradient-to-br from-cipher-600 to-cipher-500 text-white'
                    : 'rounded-bl-md bg-ink-800 text-white/90'
                } ${m.failed ? 'opacity-70 ring-1 ring-red-500/40' : ''}`}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>

                {xray && m.ciphertext && (
                  <div
                    className={`mt-1.5 rounded-lg border px-2 py-1 font-mono text-[9.5px] leading-tight ${
                      mine ? 'border-white/20 bg-black/20' : 'border-white/10 bg-black/30'
                    }`}
                  >
                    <span className="opacity-60">ct:</span>{' '}
                    <span className="break-all">{m.ciphertext.slice(0, 44)}…</span>
                    <br />
                    <span className="opacity-60">iv:</span> <span className="break-all">{m.iv}</span>
                  </div>
                )}

                <span
                  className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                    mine ? 'text-white/70' : 'text-white/40'
                  }`}
                >
                  {formatTime(m.createdAt)}
                  {mine &&
                    (m.pending ? (
                      <span className="opacity-60">·</span>
                    ) : m.read ? (
                      <DoubleCheckIcon className="h-3.5 w-3.5 text-glow" />
                    ) : (
                      <CheckIcon className="h-3 w-3" />
                    ))}
                </span>
              </div>
            </div>
          );
        })}

        {peerTyping && (
          <div className="mt-3 flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-ink-800 px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
                  style={{ animationDelay: `${d * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={onSend} notifyTyping={notifyTyping} />
    </section>
  );
}
