import { ChangeStream, ChangeStreamInsertDocument } from 'mongodb';
import mongoose from 'mongoose';
import { Alert, IAlert } from '../models/alert.model';
import { notificationService } from './notification.service';

/**
 * AlertWatcherService - Uses MongoDB Change Streams to watch for new alerts
 * and send push notifications when they arrive.
 *
 * This approach is consistent with the existing architecture where:
 * - ESP32 sends data to MQTT (HiveMQ Cloud)
 * - MongoDB Atlas Trigger writes data to MongoDB
 * - Backend reads from MongoDB
 *
 * For alerts:
 * - ESP32 publishes to plantformio/esp_XXX/alert
 * - MongoDB Atlas Trigger writes to 'alerts' collection
 * - This service watches for new alerts and sends FCM push
 */
export class AlertWatcherService {
  private changeStream: ChangeStream | null = null;
  private isWatching = false;

  /**
   * Start watching for new alerts
   */
  async startWatching(): Promise<void> {
    if (this.isWatching) {
      console.log('Alert watcher already running');
      return;
    }

    // Wait for mongoose connection
    if (mongoose.connection.readyState !== 1) {
      console.log('Waiting for MongoDB connection before starting alert watcher...');
      await new Promise<void>((resolve) => {
        mongoose.connection.once('connected', () => resolve());
      });
    }

    try {
      // Create change stream on alerts collection
      // Only watch for insert operations (new alerts)
      this.changeStream = Alert.watch(
        [{ $match: { operationType: 'insert' } }],
        { fullDocument: 'updateLookup' }
      );

      this.changeStream.on('change', async (change) => {
        await this.handleAlertInsert(change as ChangeStreamInsertDocument<IAlert>);
      });

      this.changeStream.on('error', (error) => {
        console.error('Alert watcher error:', error);
        // Try to restart after error
        this.restartWatcher();
      });

      this.changeStream.on('close', () => {
        console.log('Alert watcher closed');
        this.isWatching = false;
      });

      this.isWatching = true;
      console.log('Alert watcher started - listening for new alerts');
    } catch (error) {
      console.error('Failed to start alert watcher:', error);
      // Change streams require replica set or sharded cluster (MongoDB Atlas has this)
      console.warn(
        'Note: Change Streams require MongoDB replica set. ' +
          'MongoDB Atlas supports this by default.'
      );
    }
  }

  /**
   * Handle new alert insertion
   */
  private async handleAlertInsert(
    change: ChangeStreamInsertDocument<IAlert>
  ): Promise<void> {
    const alert = change.fullDocument;

    if (!alert) {
      console.warn('Received change event without document');
      return;
    }

    console.log(`New alert detected: ${alert.alertType} for ${alert.deviceId}`);

    // Check if notification was already sent (to avoid duplicates)
    if (alert.notificationSent) {
      console.log('Notification already sent for this alert, skipping');
      return;
    }

    try {
      // Send push notification
      const result = await notificationService.sendAlertNotification(alert);

      // Update alert to mark notification as sent
      if (result.successCount > 0) {
        await Alert.findByIdAndUpdate(alert._id, { notificationSent: true });
        console.log(`Push notification sent for alert ${alert._id}`);
      }
    } catch (error) {
      console.error('Error sending notification for alert:', error);
    }
  }

  /**
   * Restart watcher after error
   */
  private async restartWatcher(): Promise<void> {
    console.log('Restarting alert watcher in 5 seconds...');
    this.isWatching = false;

    setTimeout(async () => {
      await this.stopWatching();
      await this.startWatching();
    }, 5000);
  }

  /**
   * Stop watching for alerts
   */
  async stopWatching(): Promise<void> {
    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
    }
    this.isWatching = false;
    console.log('Alert watcher stopped');
  }

  /**
   * Check if watcher is active
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

// Singleton instance
export const alertWatcherService = new AlertWatcherService();
