# Kimai Time-Tracking Kiosk & Delayed Break Alert Ecosystem

A production-ready Docker Compose ecosystem combining [Kimai](https://www.kimai.org/) time-tracking, MariaDB, Redis, and a custom Node.js `alert-worker` to schedule delayed break alert notifications via BullMQ.

---

## Ecosystem Architecture

- **`kimai`** (`lscr.io/linuxserver/kimai`): Time-tracking interface accessible on host port `8080` (configurable via `KIMAI_PORT`).
- **`kimai-db`** (`mariadb:10.11`): Database backend with persistent volume storage (`mariadb_data`).
- **`redis`** (`redis:7-alpine`): In-memory database used by BullMQ to manage delayed queue timers.
- **`alert-worker`** (Custom Node.js container): Exposes internal Express webhook endpoint (`/webhook`) to process `"Break Started"` events and queue a 25-minute delayed SMS dispatch job (simulated Twilio integration).

> **Networking Constraint**: `alert-worker` has **no published host ports**. It resides exclusively on the internal `kiosk-network` Docker bridge network, ensuring strict isolation from external network traffic.

---

## Deployment Instructions

### Prerequisites
- Docker Engine & Docker Compose

### Quick Start
```bash
# Build and start all services in detached mode (default web UI port: 8080)
docker compose up -d --build

# Access Kimai UI in your browser at http://localhost:8080

# View logs from the alert worker service
docker compose logs -f alert-worker
```

### Customizing the Host Port
If port `8080` is also in use on your host system, set `KIMAI_PORT` when running compose or create a `.env` file:

```bash
# Option 1: Run inline with custom port (e.g., 9000)
KIMAI_PORT=9000 docker compose up -d --build

# Option 2: Copy .env.example to .env and adjust KIMAI_PORT
cp .env.example .env
docker compose up -d --build
```

---

## Webhook Integration Details

### Triggering a Test Break Event
From within the Docker network (e.g., executing `curl` inside the `kimai` container):

```bash
docker compose exec kimai curl -X POST http://alert-worker:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "Break Started",
    "user": {
      "username": "jdoe",
      "phone": "+15551234567"
    },
    "timesheet": {
      "id": 1001,
      "activity": "Break",
      "start_time": "2026-08-28T16:50:00Z"
    }
  }'
```

### Worker Log Output
Upon receiving the payload, `alert-worker` schedules a BullMQ job with a 25-minute delay:
```
[WEBHOOK RECEIVED] ...
[JOB QUEUED] Job ID 1 enqueued for 'jdoe'. Fires in 25 mins.
```

After 25 minutes, the worker fires the mock Twilio alert:
```
=================== [MOCK TWILIO SMS DISPATCH] ===================
[TIMESTAMP] : 2026-08-28T17:15:00.000Z
[TO]        : +15551234567
[FROM]      : +18005550199 (Kimai Kiosk Alert System)
[BODY]      : Alert: jdoe, your 25-minute break for timesheet #1001 (started at 2026-08-28T16:50:00Z) has ended. Please return to work.
[STATUS]    : 200 OK (Simulated Twilio Message SID: SM...)
==================================================================
```
