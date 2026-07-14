import { encryptMessage, decryptMessage } from '../crypto/e2ee';

/** Encrypt a profile object with the user's profile key. */
export async function encryptProfile(profileKey, profile) {
  const { ciphertext, iv } = await encryptMessage(profileKey, JSON.stringify(profile));
  return { encProfile: ciphertext, encProfileIv: iv };
}

/** Decrypt a profile blob with a profile key. */
export async function decryptProfile(profileKey, encProfile, encProfileIv) {
  const json = await decryptMessage(profileKey, { ciphertext: encProfile, iv: encProfileIv });
  return JSON.parse(json);
}

/** Resize/compress an uploaded image to a small JPEG data URL (≈ 256px). */
export async function imageToDataUrl(file, max = 256) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

const PALETTE = ['#5d6bff', '#34e7c4', '#f0509b', '#f5a623', '#7c8aff', '#22c55e', '#06b6d4'];
export function defaultProfile(username) {
  let h = 0;
  for (const c of username) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    displayName: username,
    bio: '',
    color: PALETTE[h % PALETTE.length],
    photo: null,
  };
}
