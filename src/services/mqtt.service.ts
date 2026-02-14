import mqtt, { MqttClient } from 'mqtt';
import { getMqttConfig, MqttConfig } from '../config/mqtt';
import { Reading } from '../models/reading.model';
import { Alert, AlertType, AlertSeverity } from '../models/alert.model';
import { notificationService } from './notification.service';

class MqttService {
  private client: MqttClient | null = null;
  private config: MqttConfig | null = null;

  connect(): boolean {
    this.config = getMqttConfig();

    if (!this.config) {
      return false;
    }

    console.log(`Connecting to MQTT broker: ${this.config.brokerUrl}`);
    this.client = mqtt.connect(this.config.brokerUrl, this.config.options);
    this.setupEventHandlers();
    return true;
  }

  private setupEventHandlers(): void {
    if (!this.client || !this.config) return;

    this.client.on('connect', () => {
      console.log('Connected to MQTT broker');

      // Subscribe to telemetry and alert topics
      const topics = [this.config!.topics.telemetry, this.config!.topics.alert];
      this.client!.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          console.error('Failed to subscribe:', err);
        } else {
          console.log(`Subscribed to: ${topics.join(', ')}`);
        }
      });
    });

    this.client.on('message', async (topic, message) => {
      console.log(`MQTT message on ${topic}`);
      await this.handleMessage(topic, message.toString());
    });

    this.client.on('error', (error) => {
      console.error('MQTT error:', error.message);
    });

    this.client.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });

    this.client.on('close', () => {
      console.log('MQTT connection closed');
    });
  }

  private async handleMessage(topic: string, payload: string): Promise<void> {
    try {
      const topicParts = topic.split('/');
      const deviceId = topicParts[1];
      const messageType = topicParts[2];

      const data = JSON.parse(payload);

      if (messageType === 'telemetry') {
        await this.handleTelemetry(deviceId, data);
      } else if (messageType === 'alert') {
        await this.handleAlert(deviceId, data);
      }
    } catch (error) {
      console.error('Error processing MQTT message:', error);
      console.error('Raw payload:', payload);
    }
  }

  private async handleTelemetry(deviceId: string, data: any): Promise<void> {
    await Reading.create({
      deviceId,
      ts: new Date(),
      temperature: data.temperature,
      humidity: data.humidity,
      chlorophyll: null,
      raw: {
        status: data.status,
        temperature: data.temperature,
        humidity: data.humidity,
        moisture: data.moisture,
        light: data.light,
        device_id: data.device_id,
      },
    });
    console.log(`Telemetry saved for ${deviceId}`);
  }

  private async handleAlert(deviceId: string, data: any): Promise<void> {
    // If the ESP sends a structured alert with alert_type/value/threshold, use it directly.
    // Otherwise, the ESP sends telemetry-format data on the alert topic — skip it
    // since it's already handled by the telemetry subscriber.
    if (!data.alert_type) {
      console.log(`Alert topic received telemetry-format data from ${deviceId}, skipping`);
      return;
    }

    const alertType = this.mapAlertType(data.alert_type);
    const severity = this.determineSeverity(alertType, data.value, data.threshold);

    const alert = await Alert.create({
      deviceId,
      alertType,
      severity,
      message: data.message || this.generateMessage(alertType, data),
      value: data.value,
      threshold: data.threshold,
      acknowledged: false,
      notificationSent: false,
    });

    console.log(`Alert created: ${alert._id} - ${alertType} for ${deviceId}`);

    // Send push notification
    const result = await notificationService.sendAlertNotification(alert);
    if (result.successCount > 0) {
      alert.notificationSent = true;
      await alert.save();
    }
  }

  private mapAlertType(type: string): AlertType {
    const typeMap: Record<string, AlertType> = {
      TEMPERATURE_HIGH: AlertType.TEMPERATURE_HIGH,
      TEMPERATURE_LOW: AlertType.TEMPERATURE_LOW,
      HUMIDITY_HIGH: AlertType.HUMIDITY_HIGH,
      HUMIDITY_LOW: AlertType.HUMIDITY_LOW,
      MOISTURE_HIGH: AlertType.MOISTURE_HIGH,
      MOISTURE_LOW: AlertType.MOISTURE_LOW,
      DEVICE_OFFLINE: AlertType.DEVICE_OFFLINE,
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

  private determineSeverity(type: AlertType, value: number, threshold: number): AlertSeverity {
    const diff = Math.abs(value - threshold);
    const percentDiff = (diff / threshold) * 100;

    if (
      (type === AlertType.MOISTURE_LOW && value < 10) ||
      (type === AlertType.TEMPERATURE_HIGH && value > 40) ||
      (type === AlertType.TEMPERATURE_LOW && value < 5)
    ) {
      return AlertSeverity.CRITICAL;
    }

    if (percentDiff > 30) return AlertSeverity.HIGH;
    if (percentDiff > 15) return AlertSeverity.MEDIUM;
    return AlertSeverity.LOW;
  }

  private generateMessage(type: AlertType, data: any): string {
    const messages: Record<string, string> = {
      [AlertType.TEMPERATURE_HIGH]: `Temperature ${data.value}C exceeds maximum ${data.threshold}C`,
      [AlertType.TEMPERATURE_LOW]: `Temperature ${data.value}C below minimum ${data.threshold}C`,
      [AlertType.HUMIDITY_HIGH]: `Humidity ${data.value}% exceeds maximum ${data.threshold}%`,
      [AlertType.HUMIDITY_LOW]: `Humidity ${data.value}% below minimum ${data.threshold}%`,
      [AlertType.MOISTURE_HIGH]: `Soil moisture ${data.value}% exceeds maximum ${data.threshold}%`,
      [AlertType.MOISTURE_LOW]: `Soil moisture ${data.value}% below minimum ${data.threshold}%`,
      [AlertType.DEVICE_OFFLINE]: 'Device has gone offline',
    };
    return messages[type] || `Alert: ${data.alert_type}`;
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      console.log('MQTT disconnected');
    }
  }
}

export const mqttService = new MqttService();
