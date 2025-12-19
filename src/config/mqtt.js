import mqtt from 'mqtt';

let client = null;

export const connectMQTT = () => { 
  const options = {
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  };

  if (process.env.MQTT_USERNAME) {
    options.username = process.env.MQTT_USERNAME;
    options.password = process.env.MQTT_PASSWORD;
  }

  if (process.env.MQTT_BROKER && process.env.MQTT_BROKER.startsWith('mqtts://')) {
    options.protocol = 'mqtts';
    options.port = 8883;
  }

  client = mqtt.connect(process.env.MQTT_BROKER, options);

  client.on('connect', () => {
    console.log('✓ MQTT Broker connected');
  });

  client.on('error', (err) => {
    console.error('MQTT Error:', err.message);
  });

  client.on('reconnect', () => {
    console.log('MQTT reconnecting...');
  });

  client.on('close', () => {
    console.log('MQTT connection closed');
  });

  return client;
};

export const getMQTTClient = () => {
  if (!client) {
    throw new Error('MQTT client not initialized. Call connectMQTT() first.');
  }
  return client;
};

export const disconnectMQTT = () => {
  if (client) {
    client.end();
    console.log('MQTT disconnected');
  }
};