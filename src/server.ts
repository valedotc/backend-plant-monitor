// Load environment variables FIRST (before any other imports that may use them)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { connectDatabase } from './config/database';
import { initializeFirebase } from './config/firebase';
import { mqttService } from './services/mqtt.service';
import deviceRoutes from './routes/device.routes';
import notificationRoutes from './routes/notification.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/devices', deviceRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function start() {
  try {
    await connectDatabase();

    // Initialize Firebase Admin SDK (for push notifications)
    initializeFirebase();

    // Connect to MQTT broker and start ingesting telemetry + alerts
    mqttService.connect();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api/devices`);
      console.log(`Notifications API at http://localhost:${PORT}/api/notifications`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
