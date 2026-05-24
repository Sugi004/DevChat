"use client"

import { useEffect, useRef, useCallback, useLayoutEffect } from "react"
import { MembershipEvent, Message } from "@/types"

function resolveWebSocketBaseUrl(): string {
    const configuredWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
    if (configuredWsUrl) {
        return configuredWsUrl.replace(/\/$/, "");
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (apiUrl) {
        try {
            const url = new URL(apiUrl);
            url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
            url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
            return url.toString().replace(/\/$/, "");
        } catch {
            return apiUrl
                .replace(/^http:/i, "ws:")
                .replace(/^https:/i, "wss:")
                .replace(/\/$/, "") + "/ws";
        }
    }

    if (typeof window !== "undefined") {
        const url = new URL(window.location.origin);
        url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        url.pathname = "/ws";
        return url.toString().replace(/\/$/, "");
    }

    return "ws://localhost:8000/ws";
}

export function useGlobalSocket({
    user_id,
    token,
    onMessage,
    onPresence,
    onRead,
    onMembership
}: {
    user_id: number | null;
    token: string | null;
    onMessage: (msg: Message) => void;
    onPresence?: (user_id: number, full_name: string, is_online: boolean, last_seen: string) => void;
    onRead?: (conversation_id: number, read_by: number) => void;
    onMembership?: (event: MembershipEvent) => void;
}) {
    const wsRef = useRef<WebSocket | null>(null);
    const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCount = useRef(0);
    const isMounted = useRef(true);
    const connectRef = useRef<() => void>(() => {});
    const onMessageRef = useRef(onMessage);
    const onPresenceRef = useRef(onPresence);
    const onReadRef = useRef(onRead);
    const onMembershipRef = useRef(onMembership);

    useLayoutEffect(() => {
        onMessageRef.current = onMessage;
        onPresenceRef.current = onPresence;
        onReadRef.current = onRead;
        onMembershipRef.current = onMembership;
    });

    const connect = useCallback(() => {
        if (!user_id || !token || !isMounted.current) return;
        const url = `${resolveWebSocketBaseUrl()}/user/${user_id}?token=${token}`;
        const ws = new WebSocket(url);

        console.log("WS URL", url);
        wsRef.current = ws;

        ws.onmessage = (e) => {
            if (!isMounted.current) return;
            try {
                const event = JSON.parse(e.data);
                if (event.type === "message") {
                    onMessageRef.current(event as Message);
                } else if (event.type === "presence") {
                    onPresenceRef.current?.(
                        Number(event.user_id),
                        event.full_name ?? "",
                        event.is_online ?? false,
                        event.last_seen ?? ""
                    );
                } else if (event.type === "read") {
                    onReadRef.current?.(Number(event.conversation_id), Number(event.read_by));
                } else if (event.type === "membership" && event.action && event.conversation_id !== undefined) {
                    onMembershipRef.current?.(event as MembershipEvent);
                }
            } catch {}
        };

        ws.onclose = () => {
            if (wsRef.current !== ws) return;
            if (!isMounted.current) return;
            if (retryCount.current < 5) {
                retryCount.current++;
                const delay = Math.min(1000 * Math.pow(2, retryCount.current - 1), 30000);
                retryTimeout.current = setTimeout(() => {
                    connectRef.current();
                }, delay);
            }
        };

        ws.onerror = () => ws.close();
    }, [user_id, token]);

    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
        isMounted.current = true;
        if (retryTimeout.current) clearTimeout(retryTimeout.current);
        wsRef.current?.close();
        retryCount.current = 0;
        connect();
        return () => {
            isMounted.current = false;
            if (retryTimeout.current) clearTimeout(retryTimeout.current);
            wsRef.current?.close();
        };
    }, [connect]);

    // Heartbeat — keeps proxy-idle connections alive
    useEffect(() => {
        const interval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "ping" }));
            }
        }, 25_000);
        return () => clearInterval(interval);
    }, []);
}
