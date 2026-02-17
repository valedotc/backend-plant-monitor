export interface MqttConfig {
  brokerUrl: string;
  options: {
    username: string;
    password: string;
    protocol: 'mqtts';
    rejectUnauthorized: boolean;
    reconnectPeriod: number;
    connectTimeout: number;
  };
  topics: {
    telemetry: string;
    alert: string;
  };
}

export function getMqttConfig(): MqttConfig | null {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  const port = parseInt(process.env.MQTT_PORT || '8883', 10);

  if (!brokerUrl || !username || !password) {
    console.warn('MQTT credentials not configured - MQTT service disabled');
    return null;
  }

  return {
    brokerUrl: `mqtts://${brokerUrl}:${port}`,
    options: {
      username,
      password,
      protocol: 'mqtts',
      rejectUnauthorized: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    },
    topics: {
      telemetry: 'plantformio/+/telemetry',
      alert: 'plantformio/+/alert',
    },
  };
}
