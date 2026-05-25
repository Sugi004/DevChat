"use client"
/* eslint-disable @next/next/no-img-element */

import { useState } from "react"
import { Message, User, MessageBubbleProps } from "@/types"
import CodeBlock from "./Codeblock"
import { getAvatarColor, resolveRenderableImageUrl } from "@/lib/utils"

function initials(name: string) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
}


function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv"]);

function getFileExtension(value?: string) {
    if (!value) return "";
    const clean = value.split("#", 1)[0].split("?", 1)[0];
    const lastDot = clean.lastIndexOf(".");
    if (lastDot === -1) return "";
    return clean.slice(lastDot + 1).toLowerCase();
}

function attachmentName(msg: Message) {
    if (msg.content?.trim()) return msg.content.trim();
    if (!msg.file_url) return "attachment";
    const cleanUrl = decodeURIComponent(msg.file_url.split("#", 1)[0].split("?", 1)[0]);
    return cleanUrl.split("/").pop() ?? "attachment";
}

function attachmentKind(msg: Message): "image" | "video" | "file" | null {
    if (!msg.file_url) return null;
    if (msg.message_type === "image" || msg.message_type === "video" || msg.message_type === "file") {
        if (msg.message_type !== "file") return msg.message_type;
    }

    const ext = getFileExtension(msg.content) || getFileExtension(msg.file_url);
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    return "file";
}

// Avatar
type AvatarUser = Pick<User, "full_name" | "email" | "avatar_url">;

function Avatar({ user }: { user: AvatarUser }) {
    const [imageFailed, setImageFailed] = useState(false);
    const name = user.full_name ?? user.email ?? "?";
    const avatarUrl = resolveRenderableImageUrl(user.avatar_url, imageFailed);

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={name}
                className="w-8 h-8 rounded-full object-cover shrink-0"
                onError={() => setImageFailed(true)}
            />
        )
    }
    return (
        <div className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${getAvatarColor(name)}`}>
            {initials(name)}
        </div>
    )
}

// Status icon

function StatusIcon({ status }: { status?: string }) {
    if (status === "read")
        return <span className="text-[9px] text-cyan-400 font-mono">✓✓</span>;
    if (status === "delivered")
        return <span className="text-[9px] text-[#4a6070] font-mono">✓✓</span>;
    return <span className="text-[9px] text-[#3a4a55] font-mono">✓</span>;
}

// Image /video / file preview

function AttachmentLink({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
    return (
        <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            download={fileName}
            className="inline-flex items-center gap-2 mt-1 bg-[#0d1117] border border-[#1e2a35] rounded px-3 py-2
          text-[12px] text-cyan-400 font-mono hover:border-cyan-400/30 transition-colors"
        >
            <span className="text-base">📎</span>
            <span className="truncate max-w-[220px]">{fileName}</span>
            <span className="text-[#4a6070] text-[10px] ml-1">↓</span>
        </a>
    );
}

function MediaContent({ msg, forceFile = false }: { msg: Message; forceFile?: boolean }) {
    const kind = forceFile ? "file" : attachmentKind(msg);
    const fileName = attachmentName(msg);

    if (kind === "video" && msg.file_url) return (
        <div className="mt-2 overflow-hidden rounded-lg border border-[#1e2a35] bg-[#060a0e]">
            <video
                src={msg.file_url}
                controls
                playsInline
                preload="metadata"
                className="max-h-[240px] max-w-[78vw] rounded object-cover sm:max-w-[320px]"
            />
        </div>
    )
    if (kind === "file" && msg.file_url) {
        return <AttachmentLink fileUrl={msg.file_url} fileName={fileName} />;
    }
    return null

}


// Main componenet
export default function MessageBubble({ message, isOwn, grouped, onDelete, onTranslate, translatedContent, isTranslating = false }: MessageBubbleProps) {
    const [hover, setHover] = useState(false);
    const [previewMediaKey, setPreviewMediaKey] = useState<string | null>(null);
    const [failedMediaKey, setFailedMediaKey] = useState<string | null>(null);
    const [showTranslateControls, setShowTranslateControls] = useState(false);
    const [targetLanguage, setTargetLanguage] = useState(translatedContent?.targetLanguage ?? "English");
    const isCodeMessage = message.message_type === "code"
    const mediaKind = attachmentKind(message);
    const fileName = attachmentName(message);
    const shouldRenderTextBubble = Boolean(message.content) && !mediaKind;
    const mediaKey = `${message.id}:${message.file_url ?? ""}`;
    const previewOpen = previewMediaKey === mediaKey;
    const imageFailed = failedMediaKey === mediaKey;
    const canTranslate = Boolean(onTranslate && shouldRenderTextBubble && message.message_type === "text" && message.content?.trim());

    if (message.is_deleted) {
        return (
            <div className={`flex gap-3 px-4 flex-row-reverse ${grouped ? "mt-0.5" : "mt-4"}`} >
                <div className="w-8 shrink-0" />
                <p className="text-[12px] text-[#3a4a55] font-mono italic ">
                    This message was deleted.
                </p>
            </div>
        );
    }

    const senderName = message.sender?.full_name ?? message.sender?.email ?? "Unknown"

    return (
        <>
            <div
                className={`flex gap-3 px-4 ${grouped ? "mt-0.5" : "mt-4"} ${isOwn ? "flex-row-reverse" : ""}`}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => { setHover(false); }}
            >
                {/* Avatar — only show for others, not own messages */}
                <div className="w-8 shrink-0 mt-0.5">
                    {!grouped && !isOwn && message.sender && <Avatar user={message.sender} />}
                </div>

                {/* Content */}
                <div className={`flex min-w-0 flex-col ${isCodeMessage ? "flex-1" : "max-w-[82%] sm:max-w-[70%]"} ${isOwn ? "items-end" : "items-start"}`}>

                    {/* Header row — sender name + time */}
                    {!grouped && (
                        <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? "flex-row-reverse" : ""}`}>
                            <span className={`text-[12.5px] font-semibold font-mono ${isOwn ? "text-cyan-400" : "text-[#c9d8e8]"}`}>
                                {isOwn ? "you" : senderName}
                            </span>
                        </div>
                    )}

                    {/* Bubble */}
                    {message.message_type === "code" ? (
                        <CodeBlock code={message.content ?? ""} language={message.language} />
                    ) : (
                        <>
                            {shouldRenderTextBubble && (
                                <div className={`break-words rounded-2xl px-3 py-2 text-[12.5px] font-mono leading-relaxed whitespace-pre-wrap sm:px-3.5 sm:text-[13px]
                        ${isOwn
                                        ? "bg-cyan-400/20 text-cyan-100 rounded-tr-sm"
                                        : "bg-[#0d1117] border border-[#1e2a35] text-[#c9d8e8] rounded-tl-sm"
                                    }`}>

                                    {message.content}
                                </div>
                            )}
                            {translatedContent && (
                                <div className={`mt-2 break-words rounded-2xl px-3 py-2 text-[12.5px] font-mono leading-relaxed whitespace-pre-wrap sm:px-3.5 sm:text-[13px]
                        ${isOwn
                                        ? "bg-amber-400/10 text-amber-100 border border-amber-400/20"
                                        : "bg-[#131a22] border border-amber-400/15 text-[#dbe7f3]"
                                    }`}>
                                    <div className="mb-1 text-[9px] uppercase tracking-[0.18em] text-amber-400/80">
                                        Translated to {translatedContent.targetLanguage}
                                    </div>
                                    {translatedContent.text}
                                </div>
                            )}
                            {showTranslateControls && canTranslate && onTranslate && (
                                <div className={`mt-2 w-full rounded-2xl border px-3 py-3 ${isOwn ? "border-cyan-400/20 bg-cyan-400/5" : "border-[#22303d] bg-[#111821]"}`}>
                                    <label className="mb-1 block text-[10px] font-mono uppercase tracking-[0.18em] text-[#4a6070]">
                                        Translate to
                                    </label>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <input
                                            value={targetLanguage}
                                            onChange={(e) => setTargetLanguage(e.target.value)}
                                            placeholder="English"
                                            className="min-w-0 flex-1 rounded-lg border border-[#22303d] bg-[#080c10] px-3 py-2 text-[12px] text-[#c9d8e8] outline-none transition-colors focus:border-amber-400"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextLanguage = targetLanguage.trim();
                                                    if (!nextLanguage) return;
                                                    const maybePromise = onTranslate(message.id, nextLanguage);
                                                    if (maybePromise && typeof maybePromise.then === "function") {
                                                        maybePromise.finally(() => setShowTranslateControls(false));
                                                    } else {
                                                        setShowTranslateControls(false);
                                                    }
                                                }}
                                                className="rounded-lg bg-amber-400/15 px-3 py-2 text-[11px] font-mono text-amber-300 transition-colors hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled={isTranslating}
                                            >
                                                {isTranslating ? "Translating..." : "Translate"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowTranslateControls(false)}
                                                className="rounded-lg border border-[#22303d] px-3 py-2 text-[11px] font-mono text-[#4a6070] transition-colors hover:text-[#c9d8e8]"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {mediaKind === "image" && message.file_url && !imageFailed ? (
                                <button
                                    type="button"
                                    onClick={() => setPreviewMediaKey(mediaKey)}
                                    className="mt-2 block w-full max-w-[min(78vw,19rem)] overflow-hidden rounded-lg border border-[#1e2a35] bg-[#060a0e] text-left sm:max-w-[320px]"
                                    title="View image"
                                >
                                    <img
                                        src={message.file_url}
                                        alt={fileName}
                                        loading="lazy"
                                        onError={() => setFailedMediaKey(mediaKey)}
                                        className="max-h-[240px] w-full rounded object-contain transition-opacity hover:opacity-90"
                                    />
                                </button>
                            ) : (
                                <MediaContent msg={message} forceFile={mediaKind === "image" && imageFailed} />
                            )}
                        </>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9.5px] text-[#3a4a55] font-mono">
                            {formatTime(message.created_at)}
                        </span>

                        {isOwn && (
                            <span><StatusIcon status={message.status} /></span>
                        )}
                    </div>
                </div>

                {/* Context menu — flip side for own messages */}
                {hover && (
                    <div className="flex items-start gap-0.5 pt-1 self-start">
                        {canTranslate && (
                            <button
                                onClick={() => {
                                    setTargetLanguage(translatedContent?.targetLanguage ?? targetLanguage ?? "English");
                                    setShowTranslateControls((prev) => !prev);
                                }}
                                className="w-7 h-7 flex items-center justify-center rounded text-[#4a6070] hover:text-amber-400 hover:bg-[#1a2530] transition-colors text-xs"
                                title="Translate"
                            >🌐</button>
                        )}
                        {onDelete && (
                            <button
                                onClick={() => onDelete(message.id)}
                                className="w-7 h-7 flex items-center justify-center rounded text-[#4a6070] hover:text-[#ff4d6d] hover:bg-[#1a2530] transition-colors text-xs"
                                title="Delete"
                            >🗑</button>
                        )}
                    </div>
                )}
            </div>
            {previewOpen && mediaKind === "image" && message.file_url && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm sm:px-4 sm:py-6"
                    onClick={() => setPreviewMediaKey(null)}
                >
                    <div
                        className="w-full max-w-5xl rounded-2xl border border-[#1e2a35] bg-[#0d1117] p-3 shadow-2xl sm:p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="truncate text-[11px] text-[#4a6070] font-mono">{fileName}</p>
                            <button
                                type="button"
                                onClick={() => setPreviewMediaKey(null)}
                                className="shrink-0 rounded border border-[#1e2a35] px-2.5 py-1 text-[11px] text-[#c9d8e8] font-mono transition-colors hover:bg-[#1a2530]"
                            >
                                Close
                            </button>
                        </div>
                        <div className="flex items-center justify-center">
                            <img
                                src={message.file_url}
                                alt={fileName}
                                onError={() => {
                                    setFailedMediaKey(mediaKey);
                                    setPreviewMediaKey(null);
                                }}
                                className="max-h-[72vh] w-auto max-w-full rounded-xl object-contain sm:max-h-[78vh]"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    )


        ;

}
