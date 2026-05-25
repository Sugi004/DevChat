"use client"
/* eslint-disable @next/next/no-img-element */

import { useState, useRef } from "react"
import { Conversation, User } from "@/types"
import { searchUsers } from "@/lib/users"
import { ChatListProps } from "@/types"
import { getAvatarColor, getInitials, resolveRenderableImageUrl, convDisplayName } from "@/lib/utils"

function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function lastMsgPreview(conv: Conversation): string {
    const msg = conv.last_message
    if (!msg) return "No Messages yet"
    if (msg.is_deleted) return "Message deleted"
    if (msg.message_type === "image") return "📷 Image"
    if (msg.message_type === "file") return "📄 File"
    if (msg.message_type === "code") return "💻 Code snippet"
    if (msg.message_type === "video") return "🎥 Video"
    return msg.content || ""
}

export function ConvAvatar({ conv }: { conv: Conversation }) {
    const [imageFailed, setImageFailed] = useState(false);
    const name = conv.is_group
        ? (conv.group_name ?? "Group")
        : (conv.other_user?.full_name ?? conv.other_user?.email ?? "?");

    const avatarUrl = resolveRenderableImageUrl(
        conv.is_group ? conv.group_avatar_url : conv.other_user?.avatar_url,
        imageFailed,
    );

    if (avatarUrl) {
        return (
            <div className="relative shrink-0">
                <img
                    src={avatarUrl}
                    alt={name}
                    className="w-9 h-9 rounded object-cover"
                    onError={() => setImageFailed(true)}
                />
                {!conv.is_group && conv.other_user?.is_online && (
                    <span className="absolute -bottom-px -right-px w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0a0e14]" />
                )}
            </div>
        );

    }
    return (
        <div className="relative shrink-0">
            <div className={`w-9 h-9 rounded flex items-center justify-center text-[11px] font-bold font-mono ${getAvatarColor(name)}`}>
                {conv.is_group ? "G" : getInitials(name)}
            </div>
            {!conv.is_group && conv.other_user?.is_online && (
                <span className="absolute -bottom-px -right-px w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0a0e14]" />
            )}
        </div>
    );
}

function NewChatModel({
    onDirect,
    onGroup,
    onClose
}: {
    onDirect: (userId: number) => void;
    onGroup: (name: string, ids: number[]) => void;
    onClose: () => void;
}) {
    const [mode, setMode] = useState<"direct" | "group">("direct");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<User[]>([]);
    const [selected, setSelected] = useState<User[]>([]);
    const [groupName, setGroupName] = useState("");
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);


    function handleSearch(q: string) {
        setQuery(q);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!q.trim()) {
            setResults([]);
            setSearching(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                setResults(await searchUsers(q));
            }
            catch { }
            finally { setSearching(false) }
        }, 300);
    }

    function toggleSelect(u: User) {
        setSelected((s) =>
            s.find((x) => x.id === u.id)
                ? s.filter((x) => x.id !== u.id)
                : [...s, u]

        )
    }

    function submit() {
        if (mode === "direct" && selected.length === 1) {
            onDirect(selected[0].id);
            onClose();
        } else if (
            mode === "group" && selected.length >= 1 && groupName.trim()
        ) {
            onGroup(groupName.trim(), selected.map((u) => u.id));
            onClose();
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-4 backdrop-blur-sm sm:items-center">
            <div className="max-h-[85vh] w-full max-w-sm overflow-hidden rounded-2xl border border-[#1e2a35] bg-[#0d1117] shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2a35]">
                    <h2 className="text-[13px] font-bold text-[#c9d8e8] font-mono">New Conversation</h2>
                    <button onClick={onClose} className="text-[#4a6070] hover:text-[#c9d8e8] transition-colors text-lg leading-none">✕</button>
                </div>

                <div className="max-h-[calc(85vh-4.25rem)] space-y-4 overflow-y-auto p-4 sm:p-5">
                    {/* Mode toggle */}
                    <div className="flex gap-1 bg-[#060a0e] rounded p-1">
                        {(["direct", "group"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`flex-1 py-1.5 text-[11px] font-mono font-semibold tracking-wider rounded transition-all
                  ${mode === m ? "bg-cyan-400/10 text-cyan-400" : "text-[#4a6070] hover:text-[#c9d8e8]"}`}
                            >
                                {m === "direct" ? "Direct" : "Group"}
                            </button>
                        ))}
                    </div>

                    {/* Group name (only in group mode) */}
                    {mode === "group" && (
                        <input
                            type="text"
                            placeholder="Group name…"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="w-full bg-[#060a0e] border border-[#1e2a35] rounded px-3 py-2.5 font-mono text-[12.5px] text-[#c9d8e8] placeholder-[#364a58] outline-none focus:border-cyan-400/50 caret-cyan-400"
                        />
                    )}

                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search users…"
                            value={query}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="w-full bg-[#060a0e] border border-[#1e2a35] rounded px-3 py-2.5 font-mono text-[12.5px] text-[#c9d8e8] placeholder-[#364a58] outline-none focus:border-cyan-400/50 caret-cyan-400"
                        />
                        {searching && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        )}
                    </div>

                    {/* Selected chips */}
                    {selected.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {selected.map((u) => (
                                <span
                                    key={u.id}
                                    className="flex items-center gap-1.5 bg-cyan-400/10 text-cyan-400 text-[11px] font-mono px-2 py-0.5 rounded-full"
                                >
                                    {u.full_name ?? u.email}
                                    <button onClick={() => toggleSelect(u)} className="hover:text-[#ff4d6d] transition-colors">✕</button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Results */}
                    {results.length > 0 && (
                        <div className="space-y-0.5 max-h-40 overflow-y-auto">
                            {results.map((u) => {
                                const sel = !!selected.find((x) => x.id === u.id);
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => mode === "direct" ? setSelected([u]) : toggleSelect(u)}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors
                      ${sel ? "bg-cyan-400/10" : "hover:bg-[#1a2530]"}`}
                                    >
                                        <div className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${getAvatarColor(u.full_name ?? u.email)}`}>
                                            {getInitials(u.full_name ?? u.email)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[12.5px] text-[#c9d8e8] font-mono truncate">{u.full_name ?? u.email}</p>
                                            {u.full_name && <p className="text-[10px] text-[#4a6070] font-mono truncate">{u.email}</p>}
                                        </div>
                                        {sel && <span className="ml-auto text-cyan-400 text-xs">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        onClick={submit}
                        disabled={mode === "direct" ? selected.length !== 1 : !groupName.trim() || selected.length < 1}
                        className="w-full py-2.5 bg-cyan-400 rounded font-mono text-[12.5px] font-bold tracking-wider uppercase text-[#080c10]
              hover:shadow-[0_0_20px_rgba(0,204,255,.35)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {mode === "direct" ? "Start Chat" : "Create Group"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Main component

export default function Chatlist({
    conversations,
    activeId,
    currentUser,
    onSelect,
    onLeave,
    onNewDirect,
    onNewGroup,
    loading,
    onSignOut,
    onDelete,
}: ChatListProps) {
    const [showModal, setShowModal] = useState(false);
    const [menuConvId, setMenuConvId] = useState<number | null>(null);
    const [filter, setFilter] = useState("");
    const [currentUserImageFailed, setCurrentUserImageFailed] = useState(false);
    const filtered = filter.trim()
        ? conversations.filter((c) =>
            convDisplayName(c).toLowerCase().includes(filter.toLowerCase())
        )
        : conversations;

    return (
        <>
            <aside className="flex h-full w-[min(22rem,100vw)] shrink-0 flex-col border-r border-[#1e2a35] bg-[#0a0e14] md:w-72">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1e2a35]">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-cyan-400 rounded flex items-center justify-center text-[11px] font-bold text-[#080c10]">T</span>
                        <span className="text-cyan-400 text-[11px] font-bold tracking-[.15em] uppercase font-mono">TalkFlow</span>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="w-7 h-7 flex items-center justify-center rounded text-[#4a6070] hover:text-cyan-400 hover:bg-[#1a2530] transition-colors text-lg leading-none"
                        title="New conversation"
                    >
                        +
                    </button>

                </div>
                {/* Search */}
                <div className="px-3 py-2.5 border-b border-[#1e2a35]">
                    <input
                        type="text"
                        placeholder="Search conversations…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full bg-[#060a0e] border border-[#1e2a35] rounded px-2.5 py-1.5 font-mono text-[11.5px] text-[#c9d8e8] placeholder-[#364a58] outline-none focus:border-cyan-400/40 caret-cyan-400"
                    />
                </div>
                {/* List */}
                <div className="flex-1 overflow-y-auto py-1">
                    {loading ? (
                        <div className="flex items-center justify-center h-20 gap-2">
                            <span className="w-4 h-4 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-[11px] text-[#4a6070] font-mono">Loading…</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                            <p className="text-[12px] text-[#4a6070] font-mono">
                                {filter ? "No results found" : "No conversations yet"}
                            </p>
                            {!filter && (
                                <button onClick={() => setShowModal(true)} className="mt-2 text-[11px] text-cyan-400 font-mono hover:underline">
                                    Start one →
                                </button>
                            )}
                        </div>
                    ) : (
                        filtered.map((conv) => {
                            const name = convDisplayName(conv);
                            const preview = lastMsgPreview(conv);
                            const ts = conv.last_message?.created_at ?? conv.created_at;
                            const active = conv.id === activeId;
                            const unread = conv.unread_count ?? 0;

                            return (
                                <div
                                    key={conv.id}
                                    className={`relative flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors group
                                    ${active ? "bg-cyan-400/10" : "hover:bg-[#111820]"}`}
                                    onClick={() => { onSelect(conv); setMenuConvId(null); }}
                                >
                                    <ConvAvatar conv={conv} />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-1 mb-0.5">
                                            <span className={`text-[13px] font-semibold font-mono truncate ${active ? "text-cyan-400" : "text-[#c9d8e8]"}`}>
                                                {name}
                                            </span>
                                            <span className="text-[9.5px] text-[#3a4a55] font-mono shrink-0">{timeAgo(ts)}</span>
                                        </div>
                                        <p className={`text-[11.5px] font-mono truncate ${unread > 0 ? "text-[#c9d8e8] font-semibold" : "text-[#4a6070]"}`}>
                                            {preview}
                                        </p>
                                    </div>

                                    {/* Unread badge */}
                                    {unread > 0 && (
                                        <span className="bg-cyan-400 text-[#080c10] text-[9px] font-bold font-mono px-1.5 py-px rounded-full min-w-[18px] text-center shrink-0">
                                            {unread > 99 ? "99+" : unread}
                                        </span>
                                    )}

                                    {/* 3-dot menu */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setMenuConvId(menuConvId === conv.id ? null : conv.id); }}
                                        className="h-6 w-6 shrink-0 rounded text-xs text-[#4a6070] opacity-100 transition-all hover:bg-[#1e2a35] hover:text-[#c9d8e8] md:opacity-0 md:group-hover:opacity-100"
                                    >
                                        ⋮
                                    </button>

                                    {/* Dropdown */}
                                    {menuConvId === conv.id && (
                                        <div className="absolute right-3 top-8 z-20 bg-[#0d1117] border border-[#1e2a35] rounded shadow-xl overflow-hidden">
                                            {conv.is_group ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onLeave(conv.id); setMenuConvId(null); }}
                                                    className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#ff4d6d] font-mono hover:bg-[#1a2530] w-full text-left whitespace-nowrap"
                                                >
                                                    Leave Group
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); setMenuConvId(null); }}
                                                    className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#ff4d6d] font-mono hover:bg-[#1a2530] w-full text-left whitespace-nowrap"
                                                >
                                                    Delete chat
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
                {/* User footer */}
                {currentUser && (
                    <div className="border-t border-[#1e2a35] px-3 py-2.5 flex items-center gap-2.5">
                        <div className="relative shrink-0">

                            {resolveRenderableImageUrl(currentUser.avatar_url, currentUserImageFailed) ? (
                                <img
                                    src={resolveRenderableImageUrl(currentUser.avatar_url, currentUserImageFailed) ?? ""}
                                    alt=""
                                    className="w-7 h-7 rounded object-cover"
                                    onError={() => setCurrentUserImageFailed(true)}
                                />
                            ) : (
                                <div className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold font-mono ${getAvatarColor(currentUser.full_name ?? currentUser.email)}`}>
                                    {getInitials(currentUser.full_name ?? currentUser.email)}
                                </div>
                            )}
                            <span className="absolute -bottom-px -right-px w-2 h-2 bg-emerald-400 rounded-full border-2 border-[#0a0e14]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11.5px] text-[#c9d8e8] font-semibold font-mono truncate">
                                {currentUser.full_name ?? currentUser.email}
                            </p>
                            <p className="text-[9.5px] text-emerald-400 font-mono">online</p>
                        </div>
                        <a
                            href="/profile"
                            className="w-6 h-6 flex items-center justify-center rounded text-[#4a6070] hover:text-cyan-400 hover:bg-[#1a2530] transition-colors text-xs"
                            title="Profile"
                        >
                            ⚙
                        </a>
                        <button
                            onClick={onSignOut}
                            className="w-6 h-6 flex items-center justify-center rounded text-[#4a6070] hover:text-[#ff4d6d] hover:bg-[#1a2530] transition-colors text-xs"
                            title="Sign out"
                        >
                            ⏻
                        </button>
                    </div>
                )}
            </aside>

            {showModal && (
                <NewChatModel
                    onDirect={onNewDirect}
                    onGroup={onNewGroup}
                    onClose={() => setShowModal(false)}
                />
            )}


        </>
    )
}
