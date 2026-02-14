import { Router } from 'express';
import {
  registerToken,
  syncDeviceIds,
  unregisterToken,
  getUnreadCount,
  getAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
} from '../controllers/notification.controller';

const router = Router();

// FCM Token management
router.post('/tokens', registerToken);
router.post('/tokens/sync', syncDeviceIds);
router.delete('/tokens/:token', unregisterToken);

// Alerts
router.get('/alerts/unread-count', getUnreadCount);
router.get('/alerts', getAlerts);
router.get('/alerts/:deviceId', getAlerts);
router.patch('/alerts/:alertId/ack', acknowledgeAlert);
router.patch('/alerts/ack-all', acknowledgeAllAlerts);

export default router;
