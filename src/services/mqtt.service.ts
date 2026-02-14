import mqtt, { MqttClient } from 'mqtt';
import { getMqttConfig, MqttConfig } from '../config/mqtt';
import { Reading } from '../models/reading.model';

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

      // Subscribe to telemetry topic
      this.client!.subscribe(this.config!.topics.telemetry, { qos: 1 }, (err) => {
        if (err) {
          console.error('Failed to subscribe to telemetry topic:', err);
        } else {
          console.log(`Subscribed to: ${this.config!.topics.telemetry}`);
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
      // Extract device ID from topic: plantformio/esp_001/telemetry -> esp_001
      const topicParts = topic.split('/');
      const deviceId = topicParts[1];
      const messageType = topicParts[2]; // "telemetry" or "alert"

      if (messageType !== 'telemetry') return;

      const data = JSON.parse(payload);

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
    } catch (error) {
      console.error('Error processing MQTT message:', error);
      console.error('Raw payload:', payload);
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      console.log('MQTT disconnected');
    }
  }
}

export const mqttService = new MqttService();
