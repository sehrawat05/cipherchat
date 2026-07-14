import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useChat } from '../hooks/useChat';
import { Sidebar } from '../components/Sidebar';
import { MessageThread } from '../components/MessageThread';
import { NewChatModal } from '../components/NewChatModal';
import { ProfileEditor } from '../components/ProfileEditor';
import { LockIcon } from '../components/icons';
import { defaultProfile } from '../lib/profile';

export function Chat() {
  const { user, identity, logout } = useAuth();
  const chat = useChat();
  const [showNewChat, setShowNewChat] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const active = chat.conversations.find((c) => c.id === chat.activeId) ?? null;

  async function handlePick(other) {
    setShowNewChat(false);
    const id = await chat.startConversation(other);
    await chat.selectConversation(id);
  }

  if (!user) return null;

  return (
    <div className="grid h-full md:grid-cols-[auto_1fr]">
      {/* Sidebar: full-width on mobile when no thread is open */}
      <div className={`${active ? 'hidden md:block' : 'block'} h-full`}>
        <Sidebar
          user={user}
          mySeed={identity?.publicKeyJwk}
          myProfile={chat.myProfile}
          profiles={chat.profiles}
          conversations={chat.conversations}
          activeId={chat.activeId}
          presence={chat.presence}
          socketStatus={chat.socketStatus}
          typing={chat.typing}
          onSelect={chat.selectConversation}
          onNewChat={() => setShowNewChat(true)}
          onEditProfile={() => setEditingProfile(true)}
          onLogout={logout}
        />
      </div>

      {/* Thread / empty state */}
      <div className={`${active ? 'block' : 'hidden md:block'} h-full`}>
        {active ? (
          <MessageThread
            conversation={active}
            profile={chat.profiles[active.other_id]}
            messages={chat.messages[active.id] ?? []}
            me={user}
            online={chat.presence.has(active.other_id)}
            peerTyping={!!chat.typing[active.id]}
            loadingHistory={chat.loadingHistory}
            onSend={chat.sendMessage}
            notifyTyping={chat.notifyTyping}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onPick={handlePick} />}

      {editingProfile && (
        <ProfileEditor
          profile={chat.myProfile ?? defaultProfile(user.username)}
          seed={identity?.publicKeyJwk ?? user.username}
          onSave={chat.updateMyProfile}
          onClose={() => setEditingProfile(false)}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-cipher-500/20 to-glow/20 text-glow">
          <LockIcon className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-bold">Your conversations are private</h2>
        <p className="mt-2 text-sm text-white/50">
          Select a chat or start a new one. Every message is encrypted on your device with a key
          only you and your recipient can derive.
        </p>
      </div>
    </div>
  );
}
