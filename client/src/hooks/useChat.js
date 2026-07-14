import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../state/auth';
import { useSocket } from './useSocket';
import {
  importPublicKey,
  deriveConversationKey,
  encryptMessage,
  decryptMessage,
  exportRawKey,
  importRawKey,
} from '../crypto/e2ee';
import { encryptProfile, decryptProfile } from '../lib/profile';

/**
 * Orchestrates conversations, the WebSocket, and all per-message crypto.
 * Plaintext exists only inside this hook's state; the wire carries ciphertext.
 */
export function useChat() {
  const { user, identity } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState({});
  const [presence, setPresence] = useState(new Set());
  const [typing, setTyping] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [profiles, setProfiles] = useState({}); // by userId
  const [myProfile, setMyProfile] = useState(null);
  const sharedTo = useRef(new Set()); // conv ids we've shared our key to

  // Refs for use inside the socket handler (avoids stale closures).
  const keyCache = useRef(new Map());
  const conversationsRef = useRef([]);
  const activeIdRef = useRef(null);
  const identityRef = useRef(identity);
  const typingTimers = useRef({});

  conversationsRef.current = conversations;
  activeIdRef.current = activeId;
  identityRef.current = identity;

  const ensureKey = useCallback(async (conv) => {
    if (!conv.other_public_key || !identityRef.current) return null;
    const cached = keyCache.current.get(conv.id);
    if (cached) return cached;
    const theirPub = await importPublicKey(conv.other_public_key);
    const key = await deriveConversationKey(identityRef.current.privateKey, theirPub);
    keyCache.current.set(conv.id, key);
    return key;
  }, []);

  const loadConversations = useCallback(async () => {
    const { conversations: list } = await api('/conversations');
    setConversations(list);
    return list;
  }, []);

  // ---- encrypted profiles ----
  // Share my profile key with a contact (encrypted under our conversation key),
  // then fetch + decrypt theirs if they've shared back.
  const exchangeProfile = useCallback(
    async (conv) => {
      if (!identityRef.current) return;
      const key = await ensureKey(conv);
      if (!key) return;

      if (!sharedTo.current.has(conv.id)) {
        try {
          const raw = await exportRawKey(identityRef.current.profileKey);
          const { ciphertext, iv } = await encryptMessage(key, raw);
          await api('/profile/share/key', {
            method: 'PUT',
            body: { recipientId: conv.other_id, encKey: ciphertext, iv },
          });
          sharedTo.current.add(conv.id);
        } catch {
          /* ignore */
        }
      }

      try {
        const share = await api(`/profile/key/${conv.other_id}`);
        const rawKey = await decryptMessage(key, { ciphertext: share.encKey, iv: share.iv });
        const contactProfileKey = await importRawKey(rawKey);
        const blob = await api(`/profile/${conv.other_id}`);
        const profile = await decryptProfile(contactProfileKey, blob.encProfile, blob.encProfileIv);
        setProfiles((prev) => ({ ...prev, [conv.other_id]: profile }));
      } catch {
        /* contact hasn't shared a profile yet */
      }
    },
    [ensureKey],
  );

  const loadMyProfile = useCallback(async () => {
    if (!identityRef.current || !user) return;
    try {
      const blob = await api(`/profile/${user.id}`);
      setMyProfile(
        await decryptProfile(identityRef.current.profileKey, blob.encProfile, blob.encProfileIv),
      );
    } catch {
      /* no profile yet */
    }
  }, [user]);

  const updateMyProfile = useCallback(async (profile) => {
    if (!identityRef.current) return;
    const enc = await encryptProfile(identityRef.current.profileKey, profile);
    await api('/profile', { method: 'PUT', body: enc });
    setMyProfile(profile);
  }, []);

  // ---- incoming socket events ----
  const handleEvent = useCallback(
    async (data) => {
      switch (data.type) {
        case 'presence:snapshot':
          setPresence(new Set(data.online ?? []));
          break;

        case 'presence':
          setPresence((prev) => {
            const next = new Set(prev);
            if (data.online) next.add(data.userId);
            else next.delete(data.userId);
            return next;
          });
          break;

        case 'message:new': {
          const m = data.message;
          let conv = conversationsRef.current.find((c) => c.id === m.conversationId);
          if (!conv) {
            const list = await loadConversations();
            conv = list.find((c) => c.id === m.conversationId);
          }
          if (!conv) return;
          if (!profiles[conv.other_id]) void exchangeProfile(conv);
          const key = await ensureKey(conv);

          let text = '🔒 (unable to decrypt)';
          let failed = true;
          if (key) {
            try {
              text = await decryptMessage(key, { ciphertext: m.ciphertext, iv: m.iv });
              failed = false;
            } catch {
              /* keep failed state */
            }
          }
          const message = {
            id: m.id,
            conversationId: m.conversationId,
            senderId: m.senderId,
            text,
            createdAt: m.createdAt,
            failed,
            ciphertext: m.ciphertext,
            iv: m.iv,
          };
          appendMessage(message);
          bumpConversation(m.conversationId, m.createdAt);

          // If we're looking at this thread, immediately acknowledge read.
          if (activeIdRef.current === m.conversationId && !document.hidden) {
            sendRef.current({ type: 'read', conversationId: m.conversationId });
          }
          break;
        }

        case 'message:sent': {
          // Confirm the optimistic bubble: swap tempId -> real id.
          setMessages((prev) => {
            const next = { ...prev };
            for (const convId of Object.keys(next)) {
              next[convId] = next[convId].map((msg) =>
                msg.id === data.tempId
                  ? { ...msg, id: data.id, createdAt: data.createdAt, pending: false }
                  : msg,
              );
            }
            return next;
          });
          break;
        }

        case 'typing': {
          const { conversationId, isTyping } = data;
          setTyping((prev) => ({ ...prev, [conversationId]: isTyping }));
          clearTimeout(typingTimers.current[conversationId]);
          if (isTyping) {
            typingTimers.current[conversationId] = setTimeout(() => {
              setTyping((prev) => ({ ...prev, [conversationId]: false }));
            }, 4000);
          }
          break;
        }

        case 'read': {
          const { conversationId } = data;
          setMessages((prev) => {
            const list = prev[conversationId];
            if (!list) return prev;
            return {
              ...prev,
              [conversationId]: list.map((msg) =>
                msg.senderId === user?.id ? { ...msg, read: true } : msg,
              ),
            };
          });
          break;
        }
      }
    },
    [ensureKey, loadConversations, exchangeProfile, profiles, user?.id],
  );

  const { status, send } = useSocket({ enabled: !!user && !!identity, onMessage: handleEvent });
  const sendRef = useRef(send);
  sendRef.current = send;

  function appendMessage(message) {
    setMessages((prev) => {
      const list = prev[message.conversationId] ?? [];
      if (list.some((m) => m.id === message.id)) return prev; // de-dupe
      return { ...prev, [message.conversationId]: [...list, message] };
    });
  }

  function bumpConversation(conversationId, at) {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conversationId);
      if (idx < 0) return prev;
      const updated = { ...prev[idx], last_at: at };
      return [updated, ...prev.filter((_, i) => i !== idx)];
    });
  }

  // ---- actions ----
  const selectConversation = useCallback(
    async (conversationId) => {
      setActiveId(conversationId);
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conv) return;

      void exchangeProfile(conv); // share my key + fetch theirs (non-blocking)

      if (!messages[conversationId]) {
        setLoadingHistory(true);
        try {
          const key = await ensureKey(conv);
          const { messages: rows } = await api(`/conversations/${conversationId}/messages`);

          const decrypted = [];
          for (const row of rows) {
            let text = '🔒 (unable to decrypt)';
            let failed = true;
            if (key) {
              try {
                text = await decryptMessage(key, { ciphertext: row.ciphertext, iv: row.iv });
                failed = false;
              } catch {
                /* keep failed */
              }
            }
            decrypted.push({
              id: row.id,
              conversationId,
              senderId: row.sender_id,
              text,
              createdAt: row.created_at,
              failed,
              ciphertext: row.ciphertext,
              iv: row.iv,
            });
          }
          setMessages((prev) => ({ ...prev, [conversationId]: decrypted }));
        } finally {
          setLoadingHistory(false);
        }
      }
      // Tell the peer we've read the thread.
      sendRef.current({ type: 'read', conversationId });
    },
    [ensureKey, messages],
  );

  const sendMessage = useCallback(
    async (text) => {
      const conversationId = activeIdRef.current;
      if (!conversationId || !text.trim()) return;
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conv) return;
      const key = await ensureKey(conv);
      if (!key) return;

      const { ciphertext, iv } = await encryptMessage(key, text.trim());
      const tempId = crypto.randomUUID();
      appendMessage({
        id: tempId,
        conversationId,
        senderId: user.id,
        text: text.trim(),
        createdAt: new Date().toISOString(),
        pending: true,
        ciphertext,
        iv,
      });
      bumpConversation(conversationId, new Date().toISOString());
      sendRef.current({ type: 'message:send', conversationId, ciphertext, iv, tempId });
    },
    [ensureKey, user],
  );

  const startConversation = useCallback(
    async (other) => {
      const conv = await api('/conversations', {
        method: 'POST',
        body: { userId: other.id },
      });
      setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
      setActiveId(conv.id);
      void exchangeProfile(conv);
      return conv.id;
    },
    [exchangeProfile],
  );

  const notifyTyping = useCallback((isTyping) => {
    const conversationId = activeIdRef.current;
    if (conversationId) sendRef.current({ type: 'typing', conversationId, isTyping });
  }, []);

  useEffect(() => {
    if (user && identity) {
      loadConversations().catch(() => {});
      loadMyProfile().catch(() => {});
    }
  }, [user, identity, loadConversations, loadMyProfile]);

  return {
    conversations,
    activeId,
    messages,
    presence,
    typing,
    loadingHistory,
    socketStatus: status,
    profiles,
    myProfile,
    selectConversation,
    sendMessage,
    startConversation,
    notifyTyping,
    updateMyProfile,
  };
}
