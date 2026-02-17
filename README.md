# Plant Monitor Backend

Backend API for the Plant Monitor IoT system. Receives real-time telemetry from ESP32 sensors via MQTT, stores data in MongoDB, and sends push notifications to the mobile app through Firebase Cloud Messaging.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Messaging:** MQTT (HiveMQ Cloud)
- **Notifications:** Firebase Admin SDK (FCM)
- **Deployment:** Railway

## Project Structure

```
src/
├── config/
│   ├── database.ts             # MongoDB connection
│   ├── firebase.ts             # Firebase Admin SDK init
│   └── mqtt.ts                 # MQTT topics & config
├── models/
│   ├── reading.model.ts        # Telemetry readings schema
│   ├── alert.model.ts          # Alert schema (severity levels)
│   └── device-token.model.ts   # FCM token storage
├── controllers/
│   ├── device.controller.ts    # Device data endpoints
│   └── notification.controller.ts
├── services/
│   ├── mqtt.service.ts         # MQTT client & message handling
│   └── notification.service.ts # Push notification logic
├── routes/
│   ├── device.routes.ts
│   └── notification.routes.ts
└── server.ts                   # App entry point
```

## API Endpoints

### Devices — `GET /api/devices`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all devices with latest readings |
| GET | `/:deviceId/latest` | Latest reading for a device |
| GET | `/:deviceId/readings` | Reading history (supports `limit`, `offset`, `from`, `to`) |
| GET | `/:deviceId/summary` | Latest reading + 24h stats |
| GET | `/:deviceId/stats` | Aggregated stats for charts (`period`: `24h`, `7d`, `30d`) |

### Notifications — `/api/notifications`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tokens` | Register FCM token |
| POST | `/tokens/sync` | Sync device IDs for a token |
| DELETE | `/tokens/:token` | Unregister FCM token |
| GET | `/alerts/unread-count` | Unacknowledged alert count |
| GET | `/alerts` | All unacknowledged alerts |
| GET | `/alerts/:deviceId` | Alerts for a specific device |
| PATCH | `/alerts/:alertId/ack` | Acknowledge an alert |
| PATCH | `/alerts/ack-all` | Acknowledge all alerts |

### Health — `GET /health`

## How It Works

```
ESP32 Sensors
    │
    ├─ MQTT (plantformio/+/telemetry) ──→ Store readings in MongoDB
    └─ MQTT (plantformio/+/alert) ──────→ Create alert → Send push notification
                                                              │
                                                              ▼
                                                         Mobile App
```

1. ESP32 devices publish sensor data (temperature, humidity, soil moisture, light) to MQTT topics
2. The backend subscribes to these topics, parses the payloads, and stores readings in MongoDB
3. When an alert is received, it is saved and a push notification is sent via FCM to registered devices
4. The mobile app queries the REST API for historical data, stats, and alert management

### Alert Types

| Type | Severity |
|------|----------|
| Temperature high/low | Based on threshold deviation (critical if >40°C or <5°C) |
| Humidity high/low | Based on threshold deviation |
| Soil moisture high/low | Critical if <10% |
| Device offline | — |

## Setup

### Prerequisites

- Node.js >= 18
- MongoDB Atlas cluster
- HiveMQ Cloud broker
- Firebase project (for push notifications)

### Installation

```bash
cd backend
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `PORT` | Server port (default: `3000`) |
| `READINGS_COLLECTION` | MongoDB collection name for telemetry (default: `telemetry`) |
| `MQTT_BROKER_URL` | HiveMQ Cloud broker hostname |
| `MQTT_PORT` | MQTT port (default: `8883`) |
| `MQTT_USERNAME` | MQTT broker username |
| `MQTT_PASSWORD` | MQTT broker password |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON key |

### Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm run build
npm start
```
