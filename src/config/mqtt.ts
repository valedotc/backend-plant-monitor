import { IClientOptions } from 'mqtt';

export interface MqttConfig {
  brokerUrl: string;
  options: IClientOptions;
  topics: {
    alert: string;
    telemetry: string;
  };
}

export function getMqttConfig(): MqttConfig | null {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  const port = parseInt(process.env.MQTT_PORT || '8883', 10);

  if (!brokerUrl || !username || !password) {
    console.warn('MQTT credentials not fully configured - MQTT service disabled');
    console.warn('Required: MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD');
    return null;
  }

  return {
    brokerUrl: `mqtts://${brokerUrl}:${port}`,
    options: {
      username,
      password,
      protocol: 'mqtts',
      rejectUnauthorized: true,
      reconnectPeriod: 5000, // Reconnect after 5 seconds
      connectTimeout: 30000, // 30 second timeout
    },
    topics: {
      // Subscribe to all ESP32 alert topics: plantformio/esp_001/alert, plantformio/esp_002/alert, etc.
      alert: 'plantformio/+/alert',
      telemetry: 'plantformio/+/telemetry',
    },
  };
}
