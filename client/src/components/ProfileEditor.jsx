import { useRef, useState } from 'react';
import { imageToDataUrl } from '../lib/profile';
import { Avatar } from './Avatar';
import { LockIcon, ShieldIcon } from './icons';

const COLORS = ['#5d6bff', '#34e7c4', '#f0509b', '#f5a623', '#7c8aff', '#22c55e', '#06b6d4', '#a855f7'];

export function ProfileEditor({ profile, seed, onSave, onClose }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [color, setColor] = useState(profile.color);
  const [photo, setPhoto] = useState(profile.photo);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (file) setPhoto(await imageToDataUrl(file));
  }

  async function save() {
    setBusy(true);
    try {
      await onSave({ displayName: displayName.trim() || 'Anonymous', bio: bio.trim(), color, photo });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md rounded-3xl p-6 shadow-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold">Edit profile</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-glow/80">
          <LockIcon className="h-3.5 w-3.5" />
          Encrypted on your device — only your contacts can decrypt it.
        </p>

        {/* avatar + upload */}
        <div className="mt-5 flex items-center gap-4">
          <div className="relative">
            <Avatar name={displayName} seed={seed} photo={photo} size="lg" />
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
            >
              Upload photo
            </button>
            {photo && (
              <button
                onClick={() => setPhoto(null)}
                className="text-xs text-white/40 hover:text-red-300"
              >
                Remove (use identicon)
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Display name</label>
            <input
              className="input"
              value={displayName}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Bio</label>
            <textarea
              className="input resize-none"
              rows={2}
              maxLength={140}
              placeholder="A short, encrypted bio…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-white/60">Accent color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full transition ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : ''
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 font-medium text-white/70 transition hover:bg-white/5"
          >
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary flex-1">
            {busy ? 'Encrypting…' : 'Save'}
          </button>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/30">
          <ShieldIcon className="h-3.5 w-3.5" />
          Your photo never leaves this device unencrypted.
        </p>
      </div>
    </div>
  );
}
