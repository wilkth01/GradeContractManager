import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface WSMessage {
  type: string;
  classId?: number;
  payload?: unknown;
  message?: string;
}

interface UseWebSocketOptions {
  onProgressUpdate?: (payload: unknown) => void;
}

/**
 * Hook for managing WebSocket connection to receive real-time updates
 */
export function useWebSocket(
  classId: number | null,
  options: UseWebSocketOptions = {}
) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    if (!classId) return;

    // Determine WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    setStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      // Subscribe to the class
      ws.send(JSON.stringify({ type: "subscribe", classId }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        switch (message.type) {
          case "connected":
            console.log("WebSocket authenticated");
            break;

          case "subscribed":
            setStatus("connected");
            console.log(`Subscribed to class ${message.classId}`);
            break;

          case "PROGRESS_UPDATE":
            console.log("Progress update received:", message.payload);
            // Invalidate relevant queries to refresh data
            queryClient.invalidateQueries({
              queryKey: [`/api/classes/${classId}/students/progress`],
            });
            // Call custom handler if provided
            options.onProgressUpdate?.(message.payload);
            break;

          case "error":
            console.error("WebSocket error:", message.message);
            break;

          default:
            console.log("Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setStatus("disconnected");
      wsRef.current = null;

      // Attempt to reconnect after 5 seconds (unless intentionally closed)
      if (event.code !== 1000 && classId) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Attempting to reconnect...");
          connect();
        }, 5000);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("error");
    };
  }, [classId, queryClient, options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }

    setStatus("disconnected");
  }, []);

  // Connect when classId changes
  useEffect(() => {
    if (classId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [classId, connect, disconnect]);

  return {
    status,
    isConnected: status === "connected",
    reconnect: connect,
    disconnect,
  };
}
