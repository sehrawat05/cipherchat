import { avatarGradient, initials } from '../lib/format';
import { identiconDataUrl } from '../lib/identicon';

const SIZES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ name, seed, photo, online, size = 'md' }) {
  const cls = `overflow-hidden rounded-full ${SIZES[size]} ring-1 ring-white/10`;
  return (
    <div className="relative shrink-0">
      {photo ? (
        <img src={photo} alt={name} className={`${cls} object-cover`} />
      ) : seed ? (
        <img src={identiconDataUrl(seed)} alt={name} className={cls} />
      ) : (
        <div
          className={`grid place-items-center bg-gradient-to-br font-bold text-ink-950 ${avatarGradient(
            name,
          )} ${SIZES[size]}`}
        >
          {initials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink-900 ${
            online ? 'animate-pulse-ring bg-glow' : 'bg-white/25'
          }`}
        />
      )}
    </div>
  );
}
