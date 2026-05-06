# STOMP FI View Server

TypeScript sibling service to `stomp-fixed-income-server`: **synthetic fixed-income positions/trades**, **same STOMP destinations and triggers**, snapshot → **Success:** completion line → live updates **only for rows delivered in that snapshot**.

Default listen: **8081** (so it can run beside the original on 8080).

## Protocol compatibility

Matches `stomp-server/protocolContract.js`:

- `CONNECT` / `STOMP` → `CONNECTED` (`version:1.2`, `server:stomp-fixed-income/1.0.0`, `heart-beat:0,0`)
- Subscribe: `/snapshot/positions`, `/snapshot/trades`, or `/snapshot/{type}/{clientId}`
- Trigger: `/snapshot/{type}/{rate}[/{batchSize}]` or `/snapshot/{type}/{clientId}/{rate}[/{batchSize}]`
- Snapshot batches: `content-type:application/json`, `message-type:snapshot` (legacy path includes these)
- Completion: body starts with `Success: All …`
- Live: JSON array of one row, `message-type:live-update`

## Extension (optional)

Clients **that want a configurable snapshot size** (1k–20k by default env bounds) may add a STOMP header on the **SEND** frame:

- `snapshot-rows: 15000`  
- Alias: `row-count`

Existing clients that omit this header keep prior behavior with server defaults.

Example (stompjs):

```javascript
client.send('/snapshot/positions/TRADER001/1000/50', { 'snapshot-rows': '4000' }, '');
```

## Configuration

| Variable | Default |
|----------|---------|
| `PORT` | `8081` |
| `DEFAULT_SNAPSHOT_ROWS` | `20000` |
| `MIN_SNAPSHOT_ROWS` | `1000` |
| `MAX_SNAPSHOT_ROWS` | `20000` |
| `DEBUG` | unset (`1` / `true` for verbose logs) |

## Scripts

```bash
npm install
npm run dev      # tsx watch
npm run build
npm start        # node dist/main.js
```

## Data

Rows are **deterministic from a seed** (stable IDs and shapes per client/topic). Instrument coverage includes gov, credit, securitized, EM, derivatives overlay, money-market styles, with wide nested payloads for grid/view testing.
