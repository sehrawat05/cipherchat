import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, setAccessToken } from '../api/client';
import {
  generateIdentityKeyPair,
  exportPublicKey,
  importPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  deriveProfileKey,
} from '../crypto/e2ee';
import { saveIdentity, loadIdentity, clearIdentity } from '../crypto/keystore';
import { encryptProfile, defaultProfile } from '../lib/profile';

async function buildIdentity(privateKey, publicKey) {
  return {
    privateKey,
    publicKey,
    publicKeyJwk: await exportPublicKey(publicKey),
    profileKey: await deriveProfileKey(privateKey),
  };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [ready, setReady] = useState(false);

  const loadLocalIdentity = useCallback(async (userId) => {
    const stored = await loadIdentity(userId);
    if (!stored) return null;
    return buildIdentity(stored.privateKey, stored.publicKey);
  }, []);

  const register = useCallback(async (username, password) => {
    // 1. Generate the identity key pair in-browser.
    const pair = await generateIdentityKeyPair();
    const publicKeyJwk = await exportPublicKey(pair.publicKey);
    // 2. Wrap the private key under a PBKDF2(password) key for server backup.
    const wrapped = await wrapPrivateKey(pair.privateKey, password);

    const res = await api('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        username,
        password,
        keys: { publicKey: publicKeyJwk, ...wrapped },
      },
    });

    setAccessToken(res.accessToken);
    await saveIdentity({
      userId: res.user.id,
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
    });
    const id = await buildIdentity(pair.privateKey, pair.publicKey);

    // Publish a default encrypted profile so contacts have something to show.
    const enc = await encryptProfile(id.profileKey, defaultProfile(username));
    await api('/profile', { method: 'PUT', body: enc }).catch(() => {});

    setIdentity(id);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (username, password) => {
      const res = await api('/auth/login', {
        method: 'POST',
        auth: false,
        body: { username, password },
      });
      setAccessToken(res.accessToken);

      // Prefer a local key; otherwise restore the encrypted backup with the password.
      let id = await loadLocalIdentity(res.user.id);
      if (!id) {
        const bundle = await api('/auth/keys/me');
        const privateKey = await unwrapPrivateKey(bundle, password);
        const publicKey = await importPublicKey(bundle.publicKey);
        await saveIdentity({ userId: res.user.id, privateKey, publicKey });
        id = await buildIdentity(privateKey, publicKey);
      }
      setIdentity(id);
      setUser(res.user);
    },
    [loadLocalIdentity],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', auth: false });
    } catch {
      /* ignore */
    }
    if (user) await clearIdentity(user.id);
    setAccessToken(null);
    setIdentity(null);
    setUser(null);
  }, [user]);

  // Attempt silent session restore on first load (refresh cookie + local keys).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // One refresh call returns both a fresh access token and the user.
        const restored = await api('/auth/refresh', {
          method: 'POST',
          auth: false,
        }).catch(() => null);
        if (!restored || cancelled) return;
        setAccessToken(restored.accessToken);

        const id = await loadLocalIdentity(restored.user.id);
        if (!id) {
          // Keys aren't on this device — require an explicit login to unwrap them.
          await api('/auth/logout', { method: 'POST', auth: false }).catch(() => {});
          setAccessToken(null);
          return;
        }
        if (cancelled) return;
        setIdentity(id);
        setUser(restored.user);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLocalIdentity]);

  const value = useMemo(
    () => ({ user, identity, ready, register, login, logout }),
    [user, identity, ready, register, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
