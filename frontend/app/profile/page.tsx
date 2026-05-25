"use client"
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { deleteMyAccount, deleteMyAvatar, getMe, updateMe } from "@/lib/users"
import { User } from "@/types/index"
import toast from "react-hot-toast"
import { getAvatarColor, getInitials, validAvatar } from "@/lib/utils"
import { uploadFile } from "@/lib/uploads"
import { getErrorMessage } from "@/lib/auth"

const AVATAR_EDITOR_SIZE = 288
const MIN_AVATAR_EDITOR_SIZE = 220

function formatDate(iso?: string) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

export default function ProfilePage() {
    const router = useRouter()
    const { isAuthenticated, logout, refreshUser } = useAuth()

    const [user, setUser] = useState<User | null>(null)
    const [fullName, setFullName] = useState("")
    const [usernameError, setUsernameError] = useState("")
    const [uploading, setUploading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingAccount, setDeletingAccount] = useState(false)
    const [uploadPct, setUploadPct] = useState(0)
    const [mounted, setMounted] = useState(false)
    const [showAvatarViewer, setShowAvatarViewer] = useState(false)
    const [showAvatarEditor, setShowAvatarEditor] = useState(false)
    const [pendingAvatar, setPendingAvatar] = useState<{ src: string; name: string; type: string } | null>(null)
    const [editorZoom, setEditorZoom] = useState(1)
    const [editorOffsetX, setEditorOffsetX] = useState(0)
    const [editorOffsetY, setEditorOffsetY] = useState(0)
    const [editorImageSize, setEditorImageSize] = useState<{ width: number; height: number } | null>(null)
    const [editorSize, setEditorSize] = useState(AVATAR_EDITOR_SIZE)
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const editorImageRef = useRef<HTMLImageElement>(null)
    const avatarUrl = !avatarLoadFailed ? validAvatar(user?.avatar_url) : null

    useEffect(() => {
        setMounted(true)
        if (!isAuthenticated) { router.push("/login"); return }
        getMe()
            .then((u) => {
                setUser(u)
                setFullName(u.full_name ?? "")
            })
            .catch(() => {
                logout()
                router.push("/login")
                toast.error("Failed to load profile")
            })
            .finally(() => {
                setLoading(false)
            })
    }, [isAuthenticated, logout, router])

    useEffect(() => {
        const updateEditorSize = () => {
            const nextSize = Math.max(
                MIN_AVATAR_EDITOR_SIZE,
                Math.min(AVATAR_EDITOR_SIZE, window.innerWidth - 72)
            )
            setEditorSize(nextSize)
        }

        updateEditorSize()
        window.addEventListener("resize", updateEditorSize)
        return () => window.removeEventListener("resize", updateEditorSize)
    }, [])

    useEffect(() => {
        setAvatarLoadFailed(false)
    }, [user?.avatar_url])

    async function handleSave() {
        if (!user) return;
        setSaving(true)
        setUsernameError("")
        try {
            const updated = await updateMe({ full_name: fullName.trim() || undefined })
            setUser(updated)
            refreshUser()
            setUsernameError("")
            toast.success("Username updated")
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Failed to save")
            if (message.toLowerCase().includes("username")) {
                setUsernameError(message)
            } else {
                toast.error(message)
            }
        } finally {
            setSaving(false)
        }
    }

    function handleBackToChat() {
        refreshUser()
        window.location.assign("/chat")
    }

    async function handleDeleteAccount() {
        setDeletingAccount(true)
        try {
            const response = await deleteMyAccount()
            logout()
            toast.success(response.message)
            window.location.assign("/login")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to delete account"))
        } finally {
            setDeletingAccount(false)
            setShowDeleteAccountModal(false)
        }
    }

    useEffect(() => {
        return () => {
            if (pendingAvatar?.src) {
                URL.revokeObjectURL(pendingAvatar.src)
            }
        }
    }, [pendingAvatar])

    function closeAvatarEditor() {
        setShowAvatarEditor(false)
        setEditorZoom(1)
        setEditorOffsetX(0)
        setEditorOffsetY(0)
        setEditorImageSize(null)
        setPendingAvatar((current) => {
            if (current?.src) {
                URL.revokeObjectURL(current.src)
            }
            return null
        })
    }

    function openAvatarEditor(file: File) {
        setPendingAvatar((current) => {
            if (current?.src) {
                URL.revokeObjectURL(current.src)
            }
            return {
                src: URL.createObjectURL(file),
                name: file.name,
                type: file.type || "image/jpeg",
            }
        })
        setEditorZoom(1)
        setEditorOffsetX(0)
        setEditorOffsetY(0)
        setEditorImageSize(null)
        setShowAvatarEditor(true)
    }

    function getEditorLayout() {
        const naturalWidth = editorImageSize?.width ?? editorImageRef.current?.naturalWidth ?? 0
        const naturalHeight = editorImageSize?.height ?? editorImageRef.current?.naturalHeight ?? 0
        if (!naturalWidth || !naturalHeight) {
            return null
        }

        const coverScale = Math.max(editorSize / naturalWidth, editorSize / naturalHeight) * editorZoom
        const width = naturalWidth * coverScale
        const height = naturalHeight * coverScale
        const overflowX = Math.max(0, width - editorSize)
        const overflowY = Math.max(0, height - editorSize)
        const left = (editorSize - width) / 2 - overflowX * (editorOffsetX / 100)
        const top = (editorSize - height) / 2 - overflowY * (editorOffsetY / 100)

        return {
            naturalWidth,
            naturalHeight,
            coverScale,
            width,
            height,
            left,
            top,
        }
    }

    function buildAdjustedAvatarFile() {
        const image = editorImageRef.current
        if (!image) {
            throw new Error("Image is not ready yet")
        }

        const layout = getEditorLayout()
        if (!layout) {
            throw new Error("Image dimensions are unavailable")
        }
        const sourceSize = editorSize / layout.coverScale
        const sourceX = Math.min(
            Math.max(0, -layout.left / layout.coverScale),
            Math.max(0, layout.naturalWidth - sourceSize)
        )
        const sourceY = Math.min(
            Math.max(0, -layout.top / layout.coverScale),
            Math.max(0, layout.naturalHeight - sourceSize)
        )

        const canvas = document.createElement("canvas")
        canvas.width = 512
        canvas.height = 512

        const ctx = canvas.getContext("2d")
        if (!ctx) {
            throw new Error("Canvas is unavailable")
        }

        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height)

        return new Promise<File>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Failed to prepare image"))
                    return
                }
                resolve(new File([blob], pendingAvatar?.name || "avatar.jpg", { type: pendingAvatar?.type || "image/jpeg" }))
            }, pendingAvatar?.type || "image/jpeg", 0.92)
        })
    }

    function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return;
        if (!file.type.startsWith("image/")) { toast.error("Please upload an image"); return; }
        if (file.size > 1024 * 1024 * 5) { toast.error("Image size must be less than 5MB"); return; }
        openAvatarEditor(file)
        e.target.value = ""
    }

    async function handleSaveAdjustedAvatar() {
        if (!pendingAvatar) return
        setUploading(true)
        setUploadPct(0)
        try {
            const adjustedFile = await buildAdjustedAvatarFile()
            const url = await uploadFile(adjustedFile, setUploadPct)
            const updated = await updateMe({ avatar_url: url })
            refreshUser()
            setUser(updated)
            setShowAvatarViewer(false)
            closeAvatarEditor()
            toast.success("Profile picture updated")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to upload avatar"));
        } finally {
            setUploading(false)
            setUploadPct(0)
        }
    }

    async function handleDeleteAvatar() {
        if (!user?.avatar_url) return;
        setUploading(true)
        try {
            const updated = await deleteMyAvatar()
            refreshUser()
            setUser(updated)
            setShowAvatarViewer(false)
            toast.success("Profile picture removed")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to remove avatar"));
        } finally {
            setUploading(false)
            setUploadPct(0)
        }
    }

    function handleSignOut() {
        logout()
        router.push("/login")
    }

    const name = user?.full_name ?? user?.email ?? ""
    const editorLayout = getEditorLayout()

    return (
        <>
            <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#080c10] px-4 py-6 font-mono sm:min-h-screen sm:py-10">
                {/* Grid */}
                <div
                    className="fixed inset-0 pointer-events-none"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(0,204,255,.033) 1px,transparent 1px),linear-gradient(90deg,rgba(0,204,255,.033) 1px,transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
                {/* Glows */}
                <div className="fixed -top-40 -left-40 w-[480px] h-[480px] rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle,rgba(0,204,255,.1) 0%,transparent 70%)" }} />
                <div className="fixed -bottom-48 -right-48 w-[560px] h-[560px] rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle,rgba(0,255,157,.07) 0%,transparent 70%)" }} />
                {/* Card */}
                <div
                    className={`relative z-10 w-full max-w-[460px] overflow-hidden rounded-md border border-[#1e2a35] bg-[#0d1117]
          transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
                >
                    {/* Window bar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2a35] bg-[#0a0e14]">
                        <span className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
                        <span className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
                        <span className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
                        <span className="mx-auto text-[11px] text-[#4a6070] tracking-widest font-mono">
                            Profile
                        </span>
                    </div>

                    <div className="px-5 py-6 sm:px-9 sm:py-8">

                        {/* Nav */}
                        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                onClick={handleBackToChat}
                                className="flex items-center gap-1.5 text-[11px] text-[#4a6070] hover:text-cyan-400 transition-colors font-mono"
                            >
                                ← Back to chat
                            </button>
                            <button
                                onClick={handleSignOut}
                                className="flex items-center gap-1.5 text-[11px] text-[#4a6070] hover:text-[#ff4d6d] transition-colors"
                            >
                                ⏻ Sign out
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center h-40 gap-2">
                                <span className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-[12px] text-[#4a6070]">Loading…</span>
                            </div>
                        ) : user ? (
                            <>
                                {/* Avatar section */}
                                <div className="flex flex-col items-center gap-3 mb-8">
                                    <div className="relative group">
                                        {avatarUrl ? (
                                            <img
                                                key={avatarUrl}
                                                src={avatarUrl}
                                                alt={name}
                                                onError={() => setAvatarLoadFailed(true)}
                                                className="w-20 h-20 rounded-lg object-cover border-2 border-[#1e2a35]"
                                            />
                                        ) : (
                                            <div className={`w-20 h-20 rounded-lg flex items-center justify-center text-2xl font-bold ${getAvatarColor(name)}`}>
                                                {getInitials(name)}
                                            </div>
                                        )}

                                        {/* Upload overlay */}
                                        <button
                                            onClick={() => setShowAvatarViewer(true)}
                                            disabled={uploading}
                                            className="absolute inset-0 flex items-center justify-center bg-[#080c10]/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400 text-xs font-mono disabled:cursor-not-allowed"
                                        >
                                            {uploading ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="w-4 h-4 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                                    <span>{uploadPct}%</span>
                                                </div>
                                            ) : (
                                                <span>view</span>
                                            )}
                                        </button>
                                    </div>
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

                                    {/* Upload progress bar */}
                                    {uploading && (
                                        <div className="w-24 h-[2px] bg-[#1e2a35] rounded-full overflow-hidden">
                                            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${uploadPct}%` }} />
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowAvatarViewer(true)}
                                            className="text-[11px] text-cyan-400 font-mono hover:underline"
                                        >
                                            View
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-[11px] text-[#4a6070] font-mono hover:text-cyan-400 transition-colors"
                                        >
                                            Change
                                        </button>
                                        {avatarUrl && (
                                            <button
                                                type="button"
                                                onClick={handleDeleteAvatar}
                                                disabled={uploading}
                                                className="text-[11px] text-[#ff4d6d] font-mono hover:underline disabled:opacity-50"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Form */}
                                <div className="space-y-5">

                                    {/* Full name */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070]">
                                            <span className="text-cyan-400 mr-1">01</span>Display Name
                                        </label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => {
                                                setFullName(e.target.value)
                                                setUsernameError("")
                                            }}
                                            placeholder="Same username shown across TalkFlow"
                                            className="w-full bg-[#060a0e] border border-[#1e2a35] rounded px-3.5 py-3 font-mono text-[13px] text-[#c9d8e8] placeholder-[#364a58] outline-none transition-all caret-cyan-400 focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]"
                                        />
                                        {usernameError ? (
                                            <p className="text-[11px] text-[#ff4d6d] font-mono">✕ {usernameError}</p>
                                        ) : (
                                            <p className="text-[11px] text-[#6f8598]">
                                                This is the same field you set during registration.
                                            </p>
                                        )}
                                    </div>

                                    {/* Email (read-only) */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070]">
                                            <span className="text-cyan-400 mr-1">02</span>Email
                                        </label>
                                        <div className="flex items-center gap-2 bg-[#060a0e] border border-[#1e2a35] rounded px-3.5 py-3">
                                            <span className="flex-1 text-[13px] text-[#5a7080] font-mono truncate">{user.email}</span>
                                            <span className="text-[9px] text-[#3a4a55] font-mono border border-[#1e2a35] px-1.5 py-0.5 rounded">readonly</span>
                                        </div>
                                    </div>

                                    {/* Member since */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070]">
                                            <span className="text-cyan-400 mr-1">03</span>Member Since
                                        </label>
                                        <div className="bg-[#060a0e] border border-[#1e2a35] rounded px-3.5 py-3 text-[13px] text-[#5a7080] font-mono">
                                            {formatDate(user.created_at)}
                                        </div>
                                    </div>

                                    {/* Save button */}
                                    <button
                                        onClick={handleSave}
                                        disabled={saving || fullName.trim() === (user.full_name ?? "")}
                                        className="relative w-full mt-2 py-3 bg-cyan-400 rounded font-mono text-[13px] font-bold tracking-widest uppercase text-[#080c10] overflow-hidden
                    transition-all duration-200 hover:shadow-[0_0_24px_rgba(0,204,255,.4)] hover:-translate-y-px active:translate-y-0
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                    >
                                        <span className="absolute inset-0 bg-linear-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-500 pointer-events-none" />
                                        {saving ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <span className="w-3.5 h-3.5 border-2 border-[#080c10]/30 border-t-[#080c10] rounded-full animate-spin" />
                                                Saving…
                                            </span>
                                        ) : "Save Changes →"}
                                    </button>

                                    <div className="mt-6 rounded-2xl border border-[#3a2029] bg-[#130c10] p-4">
                                        <p className="text-[11px] font-mono uppercase tracking-[.14em] text-[#ff7b93]">
                                            Delete Account
                                        </p>
                                        <p className="mt-2 text-[12px] text-[#c08a96]">
                                            Deleting your account permanently removes your profile and messages. This cannot be undone.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setShowDeleteAccountModal(true)}
                                            className="mt-4 rounded-full border border-[#7b3040] px-4 py-2 text-[12px] font-mono uppercase tracking-[.12em] text-[#ff7b93] transition hover:border-[#ff4d6d] hover:text-[#ff4d6d]"
                                        >
                                            Delete Account
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
            {showAvatarViewer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4">
                    <div className="w-full max-w-xl">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                onClick={() => setShowAvatarViewer(false)}
                                className="text-[12px] text-[#c9d8e8] font-mono hover:text-cyan-400 transition-colors"
                            >
                                Close
                            </button>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-[12px] text-cyan-400 font-mono hover:underline"
                                >
                                    Change photo
                                </button>
                                {avatarUrl && (
                                    <button
                                        type="button"
                                        onClick={handleDeleteAvatar}
                                        disabled={uploading}
                                        className="text-[12px] text-[#ff4d6d] font-mono hover:underline disabled:opacity-50"
                                    >
                                        Remove photo
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-[#1e2a35] bg-[#0d1117] p-4 shadow-2xl sm:p-6">
                            <div className="flex items-center justify-center">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt={name}
                                        onError={() => setAvatarLoadFailed(true)}
                                        className="max-h-[70vh] w-full rounded-3xl object-contain"
                                    />
                                ) : (
                                    <div className={`flex h-72 w-72 items-center justify-center rounded-full text-7xl font-bold ${getAvatarColor(name)}`}>
                                        {getInitials(name)}
                                    </div>
                                )}
                            </div>
                            <div className="mt-5 text-center">
                                <p className="text-[16px] font-semibold text-[#c9d8e8]">{name}</p>
                                <p className="text-[11px] text-[#4a6070] font-mono">Profile photo</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showAvatarEditor && pendingAvatar && (
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 px-4 py-4">
                    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#1e2a35] bg-[#0d1117] p-4 shadow-2xl sm:p-6">
                        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-[16px] font-semibold text-[#c9d8e8]">Adjust Profile Photo</p>
                                <p className="text-[11px] text-[#4a6070] font-mono">Crop and position your photo before saving.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeAvatarEditor}
                                disabled={uploading}
                                className="text-[12px] text-[#c9d8e8] font-mono hover:text-cyan-400 transition-colors disabled:opacity-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
                            <div className="flex flex-col items-center gap-4">
                                <div
                                    className="relative overflow-hidden rounded-[28px] border border-[#1e2a35] bg-[#060a0e]"
                                    style={{ width: editorSize, height: editorSize }}
                                >
                                    <img
                                        ref={editorImageRef}
                                        src={pendingAvatar.src}
                                        alt="Adjust avatar"
                                        onLoad={(e) => {
                                            setEditorImageSize({
                                                width: e.currentTarget.naturalWidth,
                                                height: e.currentTarget.naturalHeight,
                                            })
                                        }}
                                        className="absolute max-w-none transition-all duration-150"
                                        style={editorLayout ? {
                                            width: `${editorLayout.width}px`,
                                            height: `${editorLayout.height}px`,
                                            left: `${editorLayout.left}px`,
                                            top: `${editorLayout.top}px`,
                                        } : {
                                            width: `${editorSize}px`,
                                            height: `${editorSize}px`,
                                            left: 0,
                                            top: 0,
                                            objectFit: "cover",
                                        }}
                                    />
                                    <div className="pointer-events-none absolute inset-0 border border-white/10" />
                                </div>

                                {uploading && (
                                    <div style={{ width: editorSize }}>
                                        <div className="h-1 overflow-hidden rounded-full bg-[#1e2a35]">
                                            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${uploadPct}%` }} />
                                        </div>
                                        <p className="mt-1 text-center text-[10px] text-cyan-400 font-mono">{uploadPct}%</p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#4a6070] font-mono">
                                        Zoom
                                    </label>
                                    <input
                                        type="range"
                                        min="1"
                                        max="3"
                                        step="0.01"
                                        value={editorZoom}
                                        onChange={(e) => setEditorZoom(Number(e.target.value))}
                                        className="w-full accent-cyan-400"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#4a6070] font-mono">
                                        Horizontal Position
                                    </label>
                                    <input
                                        type="range"
                                        min="-100"
                                        max="100"
                                        step="1"
                                        value={editorOffsetX}
                                        onChange={(e) => setEditorOffsetX(Number(e.target.value))}
                                        className="w-full accent-cyan-400"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#4a6070] font-mono">
                                        Vertical Position
                                    </label>
                                    <input
                                        type="range"
                                        min="-100"
                                        max="100"
                                        step="1"
                                        value={editorOffsetY}
                                        onChange={(e) => setEditorOffsetY(Number(e.target.value))}
                                        className="w-full accent-cyan-400"
                                    />
                                </div>

                                <div className="rounded-2xl border border-[#1e2a35] bg-[#0a0e14] p-4">
                                    <p className="text-[11px] text-[#4a6070] font-mono">
                                        The photo is saved as a square avatar, similar to chat apps like WhatsApp.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={closeAvatarEditor}
                                        disabled={uploading}
                                        className="rounded-full border border-[#1e2a35] px-4 py-2 text-[12px] text-[#c9d8e8] font-mono transition-colors hover:bg-[#1a2530] disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveAdjustedAvatar}
                                        disabled={uploading}
                                        className="rounded-full bg-cyan-400 px-4 py-2 text-[12px] font-bold uppercase tracking-[.12em] text-[#080c10] disabled:opacity-50"
                                    >
                                        {uploading ? "Saving…" : "Save Photo"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteAccountModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
                    <div className="w-full max-w-md rounded-3xl border border-[#3a2029] bg-[#0d1117] p-6 shadow-2xl">
                        <p className="text-[11px] font-mono uppercase tracking-[.16em] text-[#ff7b93]">
                            Permanent Action
                        </p>
                        <h2 className="mt-3 text-[22px] font-bold text-[#f3f7fb]">
                            Delete your account?
                        </h2>
                        <p className="mt-3 text-[13px] leading-6 text-[#c08a96]">
                            Your profile, messages, and conversations created by this account will be permanently deleted and cannot be regained.
                        </p>

                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => setShowDeleteAccountModal(false)}
                                disabled={deletingAccount}
                                className="rounded-full border border-[#1e2a35] px-4 py-2 text-[12px] text-[#c9d8e8] font-mono transition-colors hover:bg-[#1a2530] disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteAccount}
                                disabled={deletingAccount}
                                className="rounded-full bg-[#ff4d6d] px-4 py-2 text-[12px] font-bold uppercase tracking-[.12em] text-white disabled:opacity-50"
                            >
                                {deletingAccount ? "Deleting…" : "Yes, Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </>
    )
}
