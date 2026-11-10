import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X, Users, Edit2, Check } from 'lucide-react';
import type { ChatMessage } from '../types/anime';

interface LiveChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeAnimeSlug?: string;
  activeAnimeTitle?: string;
}

const USER_COLORS = ['#F43F5E', '#38BDF8', '#34D399', '#FBBF24', '#A78BFA', '#FB7185'];

export const LiveChatDrawer: React.FC<LiveChatDrawerProps> = ({
  isOpen,
  onClose,
  activeAnimeSlug,
  activeAnimeTitle,
}) => {
  const [roomMode, setRoomMode] = useState<'global' | 'anime'>('global');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('gogostream_chat_user') || `Viewer${Math.floor(100 + Math.random() * 899)}`;
  });
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(username);
  const [userColor] = useState<string>(() => {
    const saved = localStorage.getItem('gogostream_chat_color');
    if (saved) return saved;
    const picked = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    localStorage.setItem('gogostream_chat_color', picked);
    return picked;
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  const currentRoom =
    roomMode === 'anime' && activeAnimeSlug ? `anime:${activeAnimeSlug}` : 'global';

  useEffect(() => {
    if (!activeAnimeSlug && roomMode === 'anime') {
      setRoomMode('global');
    }
  }, [activeAnimeSlug, roomMode]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    fetch(`/api/chat/messages?room=${encodeURIComponent(currentRoom)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});

    const es = new EventSource(`/api/chat/stream?room=${encodeURIComponent(currentRoom)}`);
    es.onmessage = (event) => {
      try {
        const msg: ChatMessage = JSON.parse(event.data);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev.slice(-79), msg];
        });
      } catch {
        // ignore malformed heartbeat
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [isOpen, currentRoom]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSaveName = () => {
    const trimmed = tempName.trim().slice(0, 24);
    if (trimmed) {
      setUsername(trimmed);
      localStorage.setItem('gogostream_chat_user', trimmed);
    }
    setEditingName(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: currentRoom,
          username,
          text,
          color: userColor,
        }),
      });
      if (res.ok) {
        const created: ChatMessage = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => m.id === created.id)) return prev;
          return [...prev, created];
        });
      }
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Community Live Chat"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-white/10 bg-[#0F131D] shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="h-4 w-4 text-rose-500" />
          <h2 className="text-sm font-semibold text-white">Community Chat</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Room Switcher */}
      <div className="flex items-center gap-1 border-b border-white/10 bg-[#0B0D12] p-1.5">
        <button
          type="button"
          onClick={() => setRoomMode('global')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            roomMode === 'global'
              ? 'bg-[#1A2030] text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Global Lounge
        </button>
        {activeAnimeSlug && (
          <button
            type="button"
            onClick={() => setRoomMode('anime')}
            className={`flex-1 truncate rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              roomMode === 'anime'
                ? 'bg-[#1A2030] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={activeAnimeTitle || activeAnimeSlug}
          >
            {activeAnimeTitle ? `${activeAnimeTitle}` : 'Episode Room'}
          </button>
        )}
      </div>

      {/* User Identity Bar */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-slate-500" />
          <span>Chatting as</span>
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                maxLength={24}
                autoFocus
                className="w-28 rounded border border-white/15 bg-[#0B0D12] px-2 py-0.5 text-xs text-white focus:border-rose-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="rounded p-1 text-emerald-400 hover:bg-white/5"
                aria-label="Save username"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTempName(username);
                setEditingName(true);
              }}
              className="flex items-center gap-1 font-medium text-slate-200 hover:text-rose-400"
            >
              <span>{username}</span>
              <Edit2 className="h-3 w-3 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-500">
            <MessageSquare className="mb-2 h-6 w-6 text-slate-600" />
            <p>No messages in this room yet.</p>
            <p className="mt-1">Start the conversation below.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const time = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div key={msg.id} className="text-sm leading-relaxed">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-xs" style={{ color: msg.color || '#38BDF8' }}>
                    {msg.username}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">{time}</span>
                </div>
                <p className="mt-0.5 break-words text-[13px] text-slate-200">{msg.text}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Write a message..."
            maxLength={500}
            className="flex-1 rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white transition-colors hover:bg-rose-500 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  );
};
