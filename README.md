# PandaPrints Dashboard
A dashboard for tracking Bambu Lab AMS filament tray status, spool inventory, and manual stock updates.

## Features
- AMS state synced from Bambu printers via MQTT
- WebSocket live updates for frontend tray state
- Persistent SQLite storage (`ams_state` + `spool_inventory`)
- Add/edit/remove spool inventory
- Bambu URL fetch & auto metadata parsing
- CORS support for `localhost:3000` frontend

## Prerequisites
- Docker & Docker Compose
- (Optional) Node and npm for local development/testing

## Configuration
Copy and edit environment values:

```bash
cp .env.example .env
```

In `.env` set:

```bash
PRINTER_IP=<printer-ip>
PRINTER_SERIAL=<printer-serial>
PRINTER_ACCESS_CODE=<your-access-code>
PORT=3001
WS_PORT=8080
```

## Run (Docker)

```bash
docker compose down
docker compose up -d --build
```

Open frontend at `http://localhost:3000`.

## API Endpoints

### GET /api/ams_state
Return all AMS tray state rows.

### GET /api/spools
Get spool inventory.

### POST /api/spools
Create inventory spool.

Body JSON example:

```json
{
  "spool_id": "123",
  "name": "True Silk PLA",
  "brand": "Bambu Lab",
  "material": "PLA",
  "tray_id": 0,
  "with_spool": 1,
  "color": "True Silk",
  "type": "Spool",
  "rfid": "Yes",
  "supplier": "Bambu Lab",
  "cost": 49.99,
  "purchase_url": "https://...",
  "total_grams": 1000,
  "remaining_grams": 1000
}
```

### DELETE /api/spools/:id
Delete spool row by id.

### POST /api/spools/fetch-url
Fetch remote HTML, parse metadata, and create predicted spool JSON:

```json
{"url":"https://www.bambulab.com/products/true-silk-pla"}
```

Auto fields: `name`, `brand`, `material`, `color`, `supplier`, `rfid`, `with_spool`, `total_grams`, `remaining_grams`.

### POST /api/ams/:trayId/stock
Update AMS tray stock.

Body JSON example:

```json
{ "grams_remaining": 750, "grams_used": 250 }
```

## Troubleshooting
- If backend container restarts with exit code 139, ensure Docker image uses `node:18-bullseye-slim` (not `alpine`).
- If CORS errors appear, backend includes permissive CORS headers.
- For local test of fetch-url, run a local server and use container-accessible IP in `url` (e.g., `http://172.18.0.1:9999`).

