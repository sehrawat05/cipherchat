import { useRef, useState } from 'react';
import { SendIcon, LockIcon } from './icons';

export function Composer({ onSend, notifyTyping }) {
  const [text, setText] = useState('');
  const typingRef = useRef(false);
  const stopTimer = useRef(null);

  function pingTyping() {
    if (!typingRef.current) {
      typingRef.current = true;
      notifyTyping(true);
    }
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      typingRef.current = false;
      notifyTyping(false);
    }, 1500);
  }

  function submit(e) {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
    typingRef.current = false;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    notifyTyping(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 border-t border-white/5 bg-ink-900/50 px-4 py-3"
    >
      <div className="relative flex-1">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            pingTyping();
          }}
          onKeyDown={onKeyDown}
          placeholder="Type an encrypted message…"
          className="max-h-32 w-full resize-none rounded-2xl border border-white/10 bg-ink-850/80 px-4 py-3 pr-10 text-sm outline-none transition placeholder:text-white/30 focus:border-cipher-400/60 focus:ring-2 focus:ring-cipher-500/20"
        />
        <LockIcon className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/25" />
      </div>
      <button
        type="submit"
        disabled={!text.trim()}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cipher-600 to-cipher-400 text-white shadow-lg shadow-cipher-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-40"
      >
        <SendIcon className="h-5 w-5" />
      </button>
    </form>
  );
}
