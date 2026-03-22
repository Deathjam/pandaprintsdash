![Panda Prints Dashboard](frontend/dist/assets/pandaprintslogo.svg)

A self-hosted filament tracking dashboard for Bambu Lab printers. Tracks AMS tray state live via MQTT, manages a spool inventory, and lets you assign spools to AMS slots to monitor remaining filament.

## Features

- **Live AMS sync** — tray colour, type, and remaining grams are updated in real time via MQTT from your Bambu printer
- **Spool inventory** — add, edit, and delete spools with full metadata (brand, material, colour, cost, purchase URL, etc.)
- **Assign spools to AMS trays** — link an inventory spool to a physical tray slot; remaining grams sync automatically
- **Sync grace period** — after pressing Load, auto-sync is paused briefly so a physical spool swap doesn't overwrite the wrong row
- **Manual stock override** — update remaining grams for a tray directly from the dashboard at any time
- **Auto-populate from URL** — paste a Bambu Lab product URL and the dashboard pre-fills spool metadata automatically
- **WebSocket live updates** — all connected browser tabs update instantly without polling
- **Persistent storage** — SQLite database stored in a Docker volume (`./backend/data/pandaprints.db`)

## Requirements

- Docker and Docker Compose

## Setup

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your printer details:

```env
# Bambu Printer MQTT Details
PRINTER_IP=192.168.1.100
PRINTER_SERIAL=00M00A000000000
PRINTER_ACCESS_CODE=12345678

# Dashboard Config
PORT=3001
WS_PORT=8080
AMS_ASSIGN_SYNC_GRACE_MS=30000
```

| Variable | Description |
|---|---|
| `PRINTER_IP` | Local IP address of your Bambu printer |
| `PRINTER_SERIAL` | Printer serial number (shown in Bambu Studio) |
| `PRINTER_ACCESS_CODE` | LAN access code (shown on the printer screen) |
| `PORT` | Backend HTTP port (default: `3001`) |
| `WS_PORT` | WebSocket port for live updates (default: `8080`) |
| `AMS_ASSIGN_SYNC_GRACE_MS` | Milliseconds to pause auto-sync after pressing Load, to allow time for a physical spool swap (default: `30000`) |

### 2. Start

```bash
docker compose up -d --build
```

Open the dashboard at [http://localhost:3000](http://localhost:3000).

### Rebuilding after config changes

```bash
docker compose up -d --build
```

## Spool Swap Workflow

When swapping a physical spool in the AMS:

1. Select the new spool in the AMS slot dropdown in the dashboard and press **Load**
2. Physically swap the spool in the AMS

Pressing Load first triggers the sync grace period, preventing the printer's next MQTT update from updating the wrong spool's remaining gram count.

## API Endpoints

### Spools

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/spools` | List all inventory spools |
| `POST` | `/api/spools` | Create a new spool |
| `PUT` | `/api/spools/:id` | Update a spool |
| `DELETE` | `/api/spools/:id` | Delete a spool |
| `POST` | `/api/spools/fetch-url` | Fetch and parse metadata from a product URL |

### AMS

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ams_state` | Get current state of all AMS trays |
| `POST` | `/api/ams/:trayId/assign-spool` | Assign an inventory spool to a tray |
| `POST` | `/api/ams/:trayId/unassign-spool` | Unassign the spool from a tray |
| `POST` | `/api/ams/:trayId/stock` | Manually update remaining grams for a tray |

#### POST /api/spools — example body

```json
{
  "spool_id": "BL-PLA-001",
  "name": "True Silk PLA",
  "brand": "Bambu Lab",
  "material": "PLA",
  "color": "True Silk",
  "type": "Spool",
  "rfid": "Yes",
  "supplier": "Bambu Lab",
  "cost": 49.99,
  "purchase_url": "https://bambulab.com/...",
  "total_grams": 1000,
  "remaining_grams": 1000,
  "with_spool": 1
}
```

#### POST /api/spools/fetch-url — example body

```json
{ "url": "https://bambulab.com/en-gb/filament/pla-basic" }
```

Auto-fills: `name`, `brand`, `material`, `color`, `supplier`, `rfid`, `with_spool`, `total_grams`, `remaining_grams`.

#### POST /api/ams/:trayId/stock — example body

```json
{ "grams_remaining": 750, "grams_used": 250 }
```

## Troubleshooting

- **Backend exits with code 139** — ensure the Docker image in `backend/Dockerfile` uses `node:18-bullseye-slim` and not an Alpine variant (SQLite native bindings require glibc).
- **Tray state not updating** — verify `PRINTER_IP`, `PRINTER_SERIAL`, and `PRINTER_ACCESS_CODE` in `.env` are correct and the printer is reachable on the local network.
- **Wrong spool remaining grams updated after swap** — increase `AMS_ASSIGN_SYNC_GRACE_MS` in `.env` and rebuild. The default `30000` (30 seconds) gives time to physically swap the spool after pressing Load.

