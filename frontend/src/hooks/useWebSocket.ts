import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

const WS_URL = "/ws";
const RECONNECT_DELAY = 3000;

const RESOURCE_TO_QUERY: Record<string, string[]> = {
  kanban: ["tasks"],
  clocks: ["clocks"],
  settings: ["settings"],
};

export function useWebSocket() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
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
        timerRef.current = setTimeout(connect, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      socketRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queryClient]);
}
