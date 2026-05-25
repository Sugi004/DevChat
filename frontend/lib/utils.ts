import { Conversation } from "@/types";

export const AVATAR_PALETTES = [
    "bg-cyan-500/20 text-cyan-400",
    "bg-emerald-500/20 text-emerald-400",
    "bg-violet-500/20 text-violet-400",
    "bg-amber-500/20 text-amber-400",
    "bg-rose-500/20 text-rose-400",
    "bg-sky-500/20 text-sky-400",
];

export const getAvatarColor = (name: string): string => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFF;
    return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

export const validAvatar = (url?: string | null): string | null => {
    if (!url) return null;
    try { new URL(url); return url; } catch { return null; }
}

export const resolveRenderableImageUrl = (
    url?: string | null,
    imageFailed = false,
): string | null => {
    if (imageFailed) return null;
    return validAvatar(url);
}

export const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export function convDisplayName(conv: Conversation) {
    return conv.is_group ? (conv.group_name ?? "Group") : (conv.other_user?.full_name ?? conv.other_user?.email ?? "Unknown");
}
