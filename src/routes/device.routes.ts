import { Router } from 'express';
import {
  getLatestReading,
  getReadings,
  getStats,
  getSummary,
  getAllDevices,
} from '../controllers/device.controller';

const router = Router();

// Get all devices with their latest reading
router.get('/', getAllDevices);

// Get summary for a device (latest + 24h stats)
router.get('/:deviceId/summary', getSummary);

// Get latest reading for a device
router.get('/:deviceId/latest', getLatestReading);

// Get readings history (with pagination and date filters)
router.get('/:deviceId/readings', getReadings);

// Get aggregated stats for charts
router.get('/:deviceId/stats', getStats);

export default router;
