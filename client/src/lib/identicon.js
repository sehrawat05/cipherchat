/**
 * Deterministic identicon generator. The avatar is derived entirely from a
 * seed string — we feed it the user's public-key fingerprint, so a person's
 * default avatar IS a visual hash of their encryption key. Two keys that differ
 * by a single bit produce visibly different identicons, which makes key
 * impersonation obvious at a glance.
 */

// FNV-1a — small, fast, deterministic string hash.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A cheap deterministic PRNG seeded from the hash (mulberry32).
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a 5x5 mirror-symmetric identicon as an inline SVG string. */
export function identiconSvg(seed, size = 96) {
  const rand = mulberry32(fnv1a(seed));
  const hue = Math.floor(rand() * 360);
  const fg = `hsl(${hue} 70% 62%)`;
  const fg2 = `hsl(${(hue + 40) % 360} 75% 55%)`;
  const bg = `hsl(${hue} 30% 14%)`;

  const cells = 5;
  const cell = size / cells;
  let rects = '';
  for (let col = 0; col < Math.ceil(cells / 2); col++) {
    for (let row = 0; row < cells; row++) {
      if (rand() > 0.5) {
        const x1 = col * cell;
        const x2 = (cells - 1 - col) * cell;
        const y = row * cell;
        const fill = (row + col) % 2 === 0 ? fg : fg2;
        rects += `<rect x="${x1}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`;
        if (x1 !== x2) {
          rects += `<rect x="${x2}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`;
        }
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
}

/** Same identicon as a data: URL, convenient for an <img> or CSS background. */
export function identiconDataUrl(seed, size = 96) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(identiconSvg(seed, size))}`;
}
