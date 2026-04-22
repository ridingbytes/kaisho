# WebSocket

Real-time updates via WebSocket.

**Endpoint:** `ws://localhost:8765/ws`

## Connection

Open a WebSocket connection to receive server-side broadcast events.
The connection is one-directional: the server pushes events, the
client does not send data.

```javascript
const ws = new WebSocket("ws://localhost:8765/ws");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Update:", data);
};
```

## Events

The server broadcasts events when data changes. Events are triggered
by file watchers that detect changes to the underlying data files.

Events include updates to:

- Clock entries (start, stop, edit)
- Tasks (create, move, edit)
- Inbox items
- Notes
- Settings changes

The frontend uses these events to refresh data via React Query
invalidation, keeping the UI in sync without polling.

## Reconnection

If the connection drops, clients should implement reconnection with
exponential backoff. The frontend handles this automatically.
