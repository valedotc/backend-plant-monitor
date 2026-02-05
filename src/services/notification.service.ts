import { admin, isFirebaseInitialized } from '../config/firebase';
import { DeviceToken, IDeviceToken } from '../models/device-token.model';
import { IAlert, AlertType } from '../models/alert.model';

interface SendResult {
  success: boolean;
  successCount: number;
  failureCount: number;
}

export class NotificationService {
  /**
   * Send push notification for a critical alert
   */
  async sendAlertNotification(alert: IAlert): Promise<SendResult> {
    if (!isFirebaseInitialized()) {
      console.warn('Firebase not initialized - skipping push notification');
      return { success: false, successCount: 0, failureCount: 0 };
    }

    // Find all active tokens monitoring this device
    const tokens = await DeviceToken.find({
      deviceIds: alert.deviceId,
      isActive: true,
    });

    if (tokens.length === 0) {
      console.log(`No registered tokens for device: ${alert.deviceId}`);
      return { success: true, successCount: 0, failureCount: 0 };
    }

    const message = this.buildAlertMessage(alert);
    const tokenStrings = tokens.map((t) => t.fcmToken);

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokenStrings,
        ...message,
      });

      // Handle failed tokens (invalidate them)
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(tokenStrings[idx]);
          }
        }
      });

      // Deactivate invalid tokens
      if (failedTokens.length > 0) {
        await DeviceToken.updateMany(
          { fcmToken: { $in: failedTokens } },
          { isActive: false }
        );
        console.log(`Deactivated ${failedTokens.length} invalid FCM tokens`);
      }

      console.log(
        `Push notification sent: ${response.successCount} success, ${response.failureCount} failed`
      );

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      console.error('Error sending FCM notification:', error);
      return { success: false, successCount: 0, failureCount: 0 };
    }
  }

  /**
   * Build FCM message payload for an alert
   */
  private buildAlertMessage(alert: IAlert) {
    const { title, body } = this.getAlertContent(alert);

    return {
      notification: {
        title,
        body,
      },
      data: {
        type: 'CRITICAL_ALERT',
        alertId: alert._id?.toString() || '',
        deviceId: alert.deviceId,
        alertType: alert.alertType,
        value: alert.value.toString(),
        threshold: alert.threshold.toString(),
        severity: alert.severity,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'critical_alerts',
          priority: 'high' as const,
          sound: 'default',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
        headers: {
          'apns-priority': '10',
        },
      },
    };
  }

  /**
   * Get human-readable title and body for alert type
   */
  private getAlertContent(alert: IAlert): { title: string; body: string } {
    const deviceName = alert.deviceId.replace('esp32_', 'Plant #');

    const contents: Record<AlertType, { title: string; body: string }> = {
      [AlertType.TEMPERATURE_HIGH]: {
        title: '🌡️ Temperature Alert',
        body: `${deviceName} temperature is too high (${alert.value}°C, threshold: ${alert.threshold}°C)`,
      },
      [AlertType.TEMPERATURE_LOW]: {
        title: '🌡️ Temperature Alert',
        body: `${deviceName} temperature is too low (${alert.value}°C, threshold: ${alert.threshold}°C)`,
      },
      [AlertType.HUMIDITY_HIGH]: {
        title: '💧 Humidity Alert',
        body: `${deviceName} humidity is too high (${alert.value}%, threshold: ${alert.threshold}%)`,
      },
      [AlertType.HUMIDITY_LOW]: {
        title: '💧 Humidity Alert',
        body: `${deviceName} humidity is too low (${alert.value}%, threshold: ${alert.threshold}%)`,
      },
      [AlertType.MOISTURE_HIGH]: {
        title: '🌱 Overwatering Alert',
        body: `${deviceName} soil moisture is too high (${alert.value}%, threshold: ${alert.threshold}%)`,
      },
      [AlertType.MOISTURE_LOW]: {
        title: '🌱 Water Your Plant!',
        body: `${deviceName} needs water! Soil moisture at ${alert.value}% (min: ${alert.threshold}%)`,
      },
      [AlertType.DEVICE_OFFLINE]: {
        title: '📡 Device Offline',
        body: `${deviceName} has gone offline. Check the device connection.`,
      },
    };

    return contents[alert.alertType] || {
      title: 'Plant Alert',
      body: alert.message,
    };
  }

  /**
   * Register or update FCM token
   */
  async registerToken(
    appInstanceId: string,
    fcmToken: string,
    platform: 'ios' | 'android',
    deviceIds: string[]
  ): Promise<IDeviceToken> {
    // Check if token already exists
    let token = await DeviceToken.findOne({ fcmToken });

    if (token) {
      // Update existing token
      token.appInstanceId = appInstanceId;
      token.platform = platform;
      token.deviceIds = deviceIds;
      token.isActive = true;
      await token.save();
    } else {
      // Check if this app instance has an old token and deactivate it
      await DeviceToken.updateMany(
        { appInstanceId, fcmToken: { $ne: fcmToken } },
        { isActive: false }
      );

      // Create new token
      token = await DeviceToken.create({
        appInstanceId,
        fcmToken,
        platform,
        deviceIds,
        isActive: true,
      });
    }

    console.log(`FCM token registered for ${platform} app (${deviceIds.length} devices)`);
    return token;
  }

  /**
   * Sync device IDs for a token
   */
  async syncDeviceIds(fcmToken: string, deviceIds: string[]): Promise<void> {
    await DeviceToken.updateOne({ fcmToken, isActive: true }, { deviceIds });
  }

  /**
   * Unregister FCM token
   */
  async unregisterToken(fcmToken: string): Promise<void> {
    await DeviceToken.updateOne({ fcmToken }, { isActive: false });
    console.log('FCM token unregistered');
  }
}

// Singleton instance
export const notificationService = new NotificationService();
