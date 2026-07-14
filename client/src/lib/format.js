export function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

// Deterministic gradient per username so avatars are stable + colorful.
const GRADIENTS = [
  'from-cipher-500 to-glow',
  'from-fuchsia-500 to-cipher-400',
  'from-amber-400 to-rose-500',
  'from-emerald-400 to-cyan-500',
  'from-sky-400 to-indigo-500',
  'from-rose-400 to-orange-400',
];
export function avatarGradient(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
