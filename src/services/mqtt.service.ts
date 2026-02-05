import mqtt, { MqttClient } from 'mqtt';
import { getMqttConfig, MqttConfig } from '../config/mqtt';
import { Alert, AlertType, AlertSeverity, IAlert } from '../models/alert.model';
import { notificationService } from './notification.service';

interface MqttAlertPayload {
  device_id: number;
  alert_type: string;
  value: number;
  threshold: number;
  timestamp?: number;
  message?: string;
}

export class MqttService {
  private client: MqttClient | null = null;
  private config: MqttConfig | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  /**
   * Connect to MQTT broker and subscribe to alert topics
   */
  connect(): boolean {
    this.config = getMqttConfig();

    if (!this.config) {
      console.log('MQTT service disabled - missing configuration');
      return false;
    }

    console.log(`Connecting to MQTT broker: ${this.config.brokerUrl}`);

    this.client = mqtt.connect(this.config.brokerUrl, this.config.options);

    this.setupEventHandlers();

    return true;
  }

  /**
   * Setup MQTT event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client || !this.config) return;

    this.client.on('connect', () => {
      console.log('Connected to MQTT broker');
      this.reconnectAttempts = 0;

      // Subscribe to alert topic
      this.client!.subscribe(this.config!.topics.alert, { qos: 1 }, (err) => {
        if (err) {
          console.error('Failed to subscribe to alert topic:', err);
        } else {
          console.log(`Subscribed to: ${this.config!.topics.alert}`);
        }
      });
    });

    this.client.on('message', async (topic: string, message: Buffer) => {
      console.log(`MQTT message received on ${topic}`);
      await this.handleMessage(topic, message.toString());
    });

    this.client.on('error', (error: Error) => {
      console.error('MQTT error:', error.message);
    });

    this.client.on('offline', () => {
      console.log('MQTT client went offline');
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      console.log(`MQTT reconnecting... (attempt ${this.reconnectAttempts})`);

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max MQTT reconnect attempts reached');
        this.client?.end();
      }
    });

    this.client.on('close', () => {
      console.log('MQTT connection closed');
    });
  }

  /**
   * Handle incoming MQTT message
   */
  private async handleMessage(topic: string, payload: string): Promise<void> {
    try {
      // Extract device ID from topic: plantformio/esp_001/alert -> esp_001
      const topicParts = topic.split('/');
      const deviceIdFromTopic = topicParts[1]; // esp_001

      console.log(`Processing alert from device: ${deviceIdFromTopic}`);
      console.log(`Payload: ${payload}`);

      const alertData: MqttAlertPayload = JSON.parse(payload);

      // Create alert in database
      const alert = await this.createAlert(deviceIdFromTopic, alertData);

      // Send push notification
      const result = await notificationService.sendAlertNotification(alert);

      // Update alert with notification status
      if (result.successCount > 0) {
        alert.notificationSent = true;
        await alert.save();
      }
    } catch (error) {
      console.error('Error processing MQTT alert message:', error);
      console.error('Raw payload:', payload);
    }
  }

  /**
   * Create alert record in database
   */
  private async createAlert(
    deviceIdFromTopic: string,
    data: MqttAlertPayload
  ): Promise<IAlert> {
    // Map alert type string to enum
    const alertType = this.mapAlertType(data.alert_type);
    const severity = this.determineSeverity(alertType, data.value, data.threshold);

    const alert = await Alert.create({
      deviceId: deviceIdFromTopic,
      alertType,
      severity,
      message: data.message || this.generateMessage(alertType, data),
      value: data.value,
      threshold: data.threshold,
      acknowledged: false,
      notificationSent: false,
    });

    console.log(`Alert created: ${alert._id} - ${alertType} for ${deviceIdFromTopic}`);
    return alert;
  }

  /**
   * Map string alert type to enum
   */
  private mapAlertType(type: string): AlertType {
    const typeMap: Record<string, AlertType> = {
      TEMPERATURE_HIGH: AlertType.TEMPERATURE_HIGH,
      TEMPERATURE_LOW: AlertType.TEMPERATURE_LOW,
      HUMIDITY_HIGH: AlertType.HUMIDITY_HIGH,
      HUMIDITY_LOW: AlertType.HUMIDITY_LOW,
      MOISTURE_HIGH: AlertType.MOISTURE_HIGH,
      MOISTURE_LOW: AlertType.MOISTURE_LOW,
      DEVICE_OFFLINE: AlertType.DEVICE_OFFLINE,
      // Lowercase versions
      temperature_high: AlertType.TEMPERATURE_HIGH,
      temperature_low: AlertType.TEMPERATURE_LOW,
      humidity_high: AlertType.HUMIDITY_HIGH,
      humidity_low: AlertType.HUMIDITY_LOW,
      moisture_high: AlertType.MOISTURE_HIGH,
      moisture_low: AlertType.MOISTURE_LOW,
      device_offline: AlertType.DEVICE_OFFLINE,
    };

    return typeMap[type] || AlertType.DEVICE_OFFLINE;
  }

  /**
   * Determine alert severity based on how much threshold was exceeded
   */
  private determineSeverity(
    type: AlertType,
    value: number,
    threshold: number
  ): AlertSeverity {
    const diff = Math.abs(value - threshold);
    const percentDiff = (diff / threshold) * 100;

    // Critical conditions
    if (
      type === AlertType.MOISTURE_LOW && value < 10 ||
      type === AlertType.TEMPERATURE_HIGH && value > 40 ||
      type === AlertType.TEMPERATURE_LOW && value < 5
    ) {
      return AlertSeverity.CRITICAL;
    }

    // High severity if > 30% difference
    if (percentDiff > 30) {
      return AlertSeverity.HIGH;
    }

    // Medium severity if > 15% difference
    if (percentDiff > 15) {
      return AlertSeverity.MEDIUM;
    }

    return AlertSeverity.LOW;
  }

  /**
   * Generate human-readable message
   */
  private generateMessage(type: AlertType, data: MqttAlertPayload): string {
    const messages: Record<AlertType, string> = {
      [AlertType.TEMPERATURE_HIGH]: `Temperature ${data.value}°C exceeds maximum ${data.threshold}°C`,
      [AlertType.TEMPERATURE_LOW]: `Temperature ${data.value}°C below minimum ${data.threshold}°C`,
      [AlertType.HUMIDITY_HIGH]: `Humidity ${data.value}% exceeds maximum ${data.threshold}%`,
      [AlertType.HUMIDITY_LOW]: `Humidity ${data.value}% below minimum ${data.threshold}%`,
      [AlertType.MOISTURE_HIGH]: `Soil moisture ${data.value}% exceeds maximum ${data.threshold}%`,
      [AlertType.MOISTURE_LOW]: `Soil moisture ${data.value}% below minimum ${data.threshold}%`,
      [AlertType.DEVICE_OFFLINE]: 'Device has gone offline',
    };

    return messages[type] || `Alert: ${data.alert_type}`;
  }

  /**
   * Disconnect from MQTT broker
   */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      console.log('MQTT disconnected');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client?.connected || false;
  }
}

// Singleton instance
export const mqttService = new MqttService();
