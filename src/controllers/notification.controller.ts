import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { Alert } from '../models/alert.model';

/**
 * Register FCM token for push notifications
 * POST /api/notifications/tokens
 */
export async function registerToken(req: Request, res: Response): Promise<void> {
  try {
    const { appInstanceId, fcmToken, platform, deviceIds } = req.body;

    if (!appInstanceId || !fcmToken || !platform) {
      res.status(400).json({
        error: 'Missing required fields: appInstanceId, fcmToken, platform',
      });
      return;
    }

    if (!['ios', 'android'].includes(platform)) {
      res.status(400).json({ error: 'Platform must be ios or android' });
      return;
    }

    const token = await notificationService.registerToken(
      appInstanceId,
      fcmToken,
      platform,
      deviceIds || []
    );

    res.status(201).json({
      success: true,
      tokenId: token._id,
      message: 'FCM token registered successfully',
    });
  } catch (error) {
    console.error('Error registering token:', error);
    res.status(500).json({ error: 'Failed to register token' });
  }
}

/**
 * Sync device IDs for a token
 * POST /api/notifications/tokens/sync
 */
export async function syncDeviceIds(req: Request, res: Response): Promise<void> {
  try {
    const { fcmToken, deviceIds } = req.body;

    if (!fcmToken || !deviceIds) {
      res.status(400).json({ error: 'Missing required fields: fcmToken, deviceIds' });
      return;
    }

    await notificationService.syncDeviceIds(fcmToken, deviceIds);

    res.json({
      success: true,
      message: 'Device IDs synced successfully',
    });
  } catch (error) {
    console.error('Error syncing device IDs:', error);
    res.status(500).json({ error: 'Failed to sync device IDs' });
  }
}

/**
 * Unregister FCM token
 * DELETE /api/notifications/tokens/:token
 */
export async function unregisterToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ error: 'Token parameter required' });
      return;
    }

    await notificationService.unregisterToken(token);

    res.json({
      success: true,
      message: 'Token unregistered successfully',
    });
  } catch (error) {
    console.error('Error unregistering token:', error);
    res.status(500).json({ error: 'Failed to unregister token' });
  }
}

/**
 * Get alerts for a device or all devices
 * GET /api/notifications/alerts
 * GET /api/notifications/alerts/:deviceId
 */
export async function getAlerts(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId } = req.params;
    const { limit = 50, acknowledged, from, to } = req.query;

    const query: Record<string, unknown> = {};

    if (deviceId) {
      query.deviceId = deviceId;
    }

    if (acknowledged !== undefined) {
      query.acknowledged = acknowledged === 'true';
    }

    if (from || to) {
      query.createdAt = {};
      if (from) (query.createdAt as Record<string, unknown>).$gte = new Date(from as string);
      if (to) (query.createdAt as Record<string, unknown>).$lte = new Date(to as string);
    }

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string, 10));

    res.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

/**
 * Acknowledge an alert
 * PATCH /api/notifications/alerts/:alertId/ack
 */
export async function acknowledgeAlert(req: Request, res: Response): Promise<void> {
  try {
    const { alertId } = req.params;

    const alert = await Alert.findByIdAndUpdate(
      alertId,
      { acknowledged: true },
      { new: true }
    );

    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    res.json({
      success: true,
      alert,
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
}

/**
 * Acknowledge all alerts for a device
 * PATCH /api/notifications/alerts/ack-all
 */
export async function acknowledgeAllAlerts(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId } = req.body;

    const query: Record<string, unknown> = { acknowledged: false };
    if (deviceId) {
      query.deviceId = deviceId;
    }

    const result = await Alert.updateMany(query, { acknowledged: true });

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Error acknowledging alerts:', error);
    res.status(500).json({ error: 'Failed to acknowledge alerts' });
  }
}

/**
 * Get unacknowledged alert count
 * GET /api/notifications/alerts/unread-count
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId } = req.query;

    const query: Record<string, unknown> = { acknowledged: false };
    if (deviceId) {
      query.deviceId = deviceId;
    }

    const count = await Alert.countDocuments(query);

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
}
