import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

const WS_URL = "/ws";
const RECONNECT_DELAY = 3000;

const RESOURCE_TO_QUERY: Record<string, string[]> = {
  kanban: ["tasks"],
  clocks: ["clocks"],
  settings: ["settings"],
  inbox: ["inbox"],
  customers: ["customers"],
  notes: ["notes"],
  knowledge: ["knowledge"],
};

export function useWebSocket() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Guards against the unmount race: ``close()`` fires
    // ``onclose`` asynchronously, which would otherwise
    // schedule a reconnect *after* cleanup ran — leaving
    // an orphan timer and a zombie socket (doubled under
    // React StrictMode's mount/unmount/remount).
    let closed = false;

    function connect() {
      if (closed) return;
      const protocol =
        window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}${WS_URL}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            resource?: string;
          };
          const key = RESOURCE_TO_QUERY[msg.resource ?? ""];
          if (key) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        } catch {
          // ignore unparseable messages
        }
      };

      ws.onclose = () => {
        if (closed) return;
        timerRef.current = setTimeout(connect, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      closed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      const ws = socketRef.current;
      if (ws) {
        // Drop the handler before closing so the async
        // ``onclose`` can't resurrect the connection.
        ws.onclose = null;
        ws.close();
        socketRef.current = null;
      }
    };
  }, [queryClient]);
}
