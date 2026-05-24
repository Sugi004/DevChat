"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import type { UseWebSocketOptions, WSMessage, WSOutgoing, MessageType, Message, MembershipEvent } from "@/types";

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


export function useWebSocket({
    conversation_id,
    token,
    onMessage,
    onTyping,
    onPresence,
    onRead,
    onUserJoined,
    onUserLeft,
    onMembership,
    onPong,
    onError
}: UseWebSocketOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCount = useRef(0);
    const isMounted = useRef(true);
    const [connected, setConnected] = useState(false);
    const connectRef = useRef<() => void>(() => {});
    const onMessageRef = useRef(onMessage);
    const onTypingRef = useRef(onTyping);
    const onPresenceRef = useRef(onPresence);
    const onReadRef = useRef(onRead);
    const onUserJoinedRef = useRef(onUserJoined);
    const onUserLeftRef = useRef(onUserLeft);
    const onMembershipRef = useRef(onMembership);
    const onPongRef = useRef(onPong);
    const onErrorRef = useRef(onError);

    useLayoutEffect(() => {
        onMessageRef.current = onMessage;
        onTypingRef.current = onTyping;
        onPresenceRef.current = onPresence;
        onReadRef.current = onRead;
        onUserJoinedRef.current = onUserJoined;
        onUserLeftRef.current = onUserLeft;
        onMembershipRef.current = onMembership;
        onPongRef.current = onPong;
        onErrorRef.current = onError;
    });

    const connect = useCallback(() => {
        if(!conversation_id || !token || !isMounted.current) return;
        
        const url = `${resolveWebSocketBaseUrl()}/${conversation_id}?token=${token}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
            if (!isMounted.current) return;
            setConnected(true);
            retryCount.current = 0
        };

        ws.onmessage = (e) => {
            if (!isMounted.current) return;
            try {
               const event: WSMessage = JSON.parse(e.data);
               if (event.type === "welcome") {
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: "read" }));
                    }
                    return;
               }
               switch (event.type){
                case "message":
                    if (event.id && event.sender){
                        onMessageRef.current(event as unknown as Message);
                    }
                    break;
                case "typing":
                    if (event.user_id !== undefined && event.full_name !== undefined){
                        onTypingRef.current(
                            Number(event.user_id), 
                            event.full_name, 
                            event.is_typing ?? false
                        );
                    }
                    break;
                case "presence":
                    if(event.user_id !== undefined && event.is_online !== undefined){
                        onPresenceRef.current(
                            Number(event.user_id),
                            event.full_name ?? "",
                            event.is_online,
                            event.last_seen ?? ""
                        );
                    }
                    break;
                case "read": 
                    if(event.conversation_id !== undefined && event.read_by !== undefined){
                        onReadRef.current?.(Number(event.conversation_id), Number(event.read_by));
                    }
                    break;
                case "user_joined":
                    if(event.user_id !== undefined && event.full_name !== undefined){
                        onUserJoinedRef.current(Number(event.user_id), event.full_name);
                    }
                    break;
                case  "user_left":
                    if(event.user_id !== undefined && event.full_name !== undefined){
                        onUserLeftRef.current(Number(event.user_id), event.full_name);
                    }
                    break;
                case "membership":
                    if (event.action && event.conversation_id !== undefined) {
                        onMembershipRef.current?.(event as MembershipEvent);
                    }
                    break;
                case "pong":
                    onPongRef.current();
                    break;
                case "error":
                    onErrorRef.current(event.content ?? "Unknown error");
                    break;
               }
            } catch (err){
                console.error("Failed to parse message:", err);
            }
        };

        ws.onclose = (e) => {
            if(wsRef.current !== ws) return;
            if(!isMounted.current) return;
            setConnected(false);
            // Only retry if it wasn't a clean close
            if (e.code !== 1000 && e.code !== 1001) {
                if(retryCount.current < 5){
                    retryCount.current++;
                    const delay = Math.min(1000 * Math.pow(2, retryCount.current - 1), 30000);
                    retryTimeout.current = setTimeout(() => {
                        connectRef.current();
                    }, delay);
                }
            }
        };

        ws.onerror = () => ws.close();

    }, [conversation_id, token]);

    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);


    // Connect / reconnect whenever conversation_id or token changes

    useEffect(() => {
        isMounted.current = true;
        if(retryTimeout.current) clearTimeout(retryTimeout.current);
        wsRef.current?.close()
        retryCount.current = 0;
        connect();
        return () => {
            isMounted.current = false;
            if(retryTimeout.current) clearTimeout(retryTimeout.current);
            wsRef.current?.close();
        };
    }, [connect]);

    // Heartbeat - keep connection alive through idle proxies

    useEffect(()=>{
        const interval = setInterval(()=>{
            if(wsRef.current?.readyState === WebSocket.OPEN){
                const ping: WSOutgoing = {type: "ping"};
                wsRef.current.send(JSON.stringify(ping));
            }
        }, 25_000);
        return () => clearInterval(interval);
    }, []);

    // Send message helpers

    const sendMessage = useCallback((
        content: string,
        message_type: MessageType = "text",
        extras: {file_url?: string; 
            language?: string; temp_id?: string} = {}
    ):boolean =>{
        if(wsRef.current?.readyState !== WebSocket.OPEN) return false;

        const frame: WSOutgoing = {
            type: "message",
            content,
            message_type,
            file_url: extras.file_url,
            language: extras.language,
            temp_id: extras.temp_id ?? crypto.randomUUID(),
        };
        wsRef.current.send(JSON.stringify(frame));
        return true;
    }, []);

    const sendTyping = useCallback((is_typing: boolean) => {
        if(wsRef.current?.readyState !== WebSocket.OPEN) return;
        const frame: WSOutgoing = {type: "typing", is_typing}
        wsRef.current.send(JSON.stringify(frame));
    },[]);

    const sendRead = useCallback((): boolean => {
        if(wsRef.current?.readyState !== WebSocket.OPEN) return false;
        const frame: WSOutgoing = {type: "read"}
        wsRef.current.send(JSON.stringify(frame));
        return true;
    },[]);

    return {connected, sendMessage, sendTyping, sendRead};
        
        

}
