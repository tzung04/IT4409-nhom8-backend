import { getMQTTClient } from '../config/mqtt.js';
import Device from '../models/device.model.js';
import { writeSensorData } from '../config/influxdb.js';
import AlertRule from '../models/alertRule.model.js'; // Model AlertRule
import AlertLog from '../models/alertLog.model.js';   // Model AlertLog
import emailService from '../services/email.service.js'

const TOPIC_PROVISION_REQ = 'system/provisioning/req';

class MQTTService {
  constructor() {
    this.subscribedTopics = new Set();
  }


  checkCondition(value, condition, threshold) {
    switch (condition) {
      case 'greater_than': return value > threshold;
      case 'less_than': return value < threshold;
      case 'equal': return value === threshold;
      case 'not_equal': return value !== threshold;
      case 'greater_than_or_equal': return value >= threshold;
      case 'less_than_or_equal': return value <= threshold;
      default: return false;
    }
  }

  async checkAlertRules(device, payload) {
    try {
      const conditionMap = {
            'greater_than': '>',
            'less_than': '<',
            'equal': '=',
            'not_equal': '!=',
            'greater_than_or_equal': '>=',
            'less_than_or_equal': '<=',
        };
      
      const rules = await AlertRule.findEnabledByDeviceId(device.id);

      for (const rule of rules) {
        let sensorValue;
        let metricName = rule.metric_type.toLowerCase();
        
        const conditionSymbol = conditionMap[rule.condition] || rule.condition;

        if (metricName === 'temperature') sensorValue = payload.temperature;
        else if (metricName === 'humidity') sensorValue = payload.humidity;

        if (sensorValue === undefined || sensorValue === null) continue;

        // 1. Kiểm tra ngưỡng
        const isViolated = this.checkCondition(sensorValue, rule.condition, rule.threshold);

        if (isViolated) {
          // 2. Debounce (5 phút)
          const recentAlert = await AlertLog.findRecentByDeviceAndRule(device.id, rule.id, 5);
          if (recentAlert) {
            console.log(`[DEBOUNCE] Alert for ${device.name} skipped.`);
            continue;
          }

          // 3. Tạo Log
          const message = `[CẢNH BÁO ${rule.metric_type.toUpperCase()}] ${device.name}: ${sensorValue} ${rule.condition} ${rule.threshold}`;
          
          await AlertLog.create({
            device_id: device.id,
            rule_id: rule.id,
            value_at_time: sensorValue,
            message: message,
          });

          console.log(`\nALERT TRIGGERED: ${message}`);

          const ruleDisplay = `
          ${rule.metric_type} ${conditionSymbol} ${rule.threshold}
          (Giá trị vượt ngưỡng: ${sensorValue})
          `;
          // 4. Gửi Email
          try {
            const emailSent = await emailService.sendAlertEmail(rule.email_to, device.name, ruleDisplay);
            if (!emailSent) console.warn(`[MAIL FAIL] Could not send alert email to ${rule.email_to}`);
          } catch (mailErr) {
            console.error(`[MAIL ERROR] ${mailErr.message}`);
          }
        }
      }
    } catch (err) {
      console.error("[ALERT ERROR] Check rules failed:", err);
    }
  }

  // Subscribe tất cả devices đang active
  async subscribeAllDevices() {
    try {

      this.subscribeTopic(TOPIC_PROVISION_REQ);

      const devices = await Device.findActiveDevices();

      if (!devices) return;

      devices.forEach(device => {
        if (device.topic) {
          this.subscribeTopic(device.topic);
        }
      });

      console.log(`Subscribed to ${devices.length} device topics`);
    } catch (err) {
      console.error('Error subscribing to devices:', err);
    }
  }

  // Subscribe 1 topic
  subscribeTopic(topic) {
    try {
      const client = getMQTTClient();

      if (this.subscribedTopics.has(topic)) {
        console.log(`Already subscribed to: ${topic}`);
        return;
      }

      client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          this.subscribedTopics.add(topic);
          console.log(`✓ Subscribed to: ${topic}`);
        }
      });
    } catch (error) {
      console.error("MQTT Client not ready yet");
    }
  }

  // Unsubscribe 1 topic
  unsubscribeTopic(topic) {
    try {
      const client = getMQTTClient();

      if (!this.subscribedTopics.has(topic)) {
        return;
      }

      client.unsubscribe(topic, (err) => {
        if (err) {
          console.error(`Failed to unsubscribe from ${topic}:`, err);
        } else {
          this.subscribedTopics.delete(topic);
          console.log(`Unsubscribed from: ${topic}`);
        }
      });
    } catch (error) {
      console.error("MQTT Client not ready yet");
    }
  }

  // Xử lý message nhận được
  async handleMessage(topic, message) {
    try {
      // 1. Xử lý yêu cầu Provisioning (Kích hoạt thiết bị)
      if (topic === TOPIC_PROVISION_REQ) {
        await this.handleProvisioning(message);
        return;
      }

      // 2. Xử lý dữ liệu cảm biến thông thường
      await this.handleSensorData(topic, message);

    } catch (err) {
      console.error(`Error handling message from ${topic}:`, err);
    }
  }

  // --- Provisioning ---
  async handleProvisioning(message) {
    try {
      const payload = JSON.parse(message.toString());
      const { mac } = payload; 

      if (!mac) return; 

      console.log(`[PROVISION] Request from mac_address: ${mac}`);

      const device = await Device.findByMac(mac); 
      const replyTopic = `system/provisioning/${mac}/res`;
      const client = getMQTTClient();

      if (device) {
        
        if (!device.is_active) {
            console.log(`[PROVISION] Activating new device: ${device.name}...`);
            
            await Device.update(device.id, { is_active: true });
            
            device.is_active = true; 
        }

        const response = { status: "success", topic: device.topic };
        
        client.publish(replyTopic, JSON.stringify(response), { qos: 1 });
        console.log(`[PROVISION] ✓ Approved ${device.name}. Sent topic: ${device.topic}`);
        
        this.subscribeTopic(device.topic); 

      } else {
        const response = { status: "error", message: "Device not registered" };
        client.publish(replyTopic, JSON.stringify(response), { qos: 1 });
        console.warn(`[PROVISION] ✗ Denied mac_address: ${mac}`);
      }
    } catch (e) {
      console.error("[PROVISION ERROR]", e);
    }
  }

  // --- Xử lý Data Cảm biến ---
  async handleSensorData(topic, message) {
    const payload = JSON.parse(message.toString());

    console.log(`[DATA] ${topic} -> T:${payload.temperature} H:${payload.humidity}`);

    // Tìm device theo topic
    const device = await Device.findByTopic(topic);

    if (!device) {
      console.warn(`[WARN] Unknown topic: ${topic}`);
      this.unsubscribeTopic(topic); 
      return;
    }

    if (!device.is_active) return;

    if (!this.isValidPayload(payload)) {
      console.warn('[WARN] Invalid payload format');
      return;
    }

    // Lưu InfluxDB
    const saved = await writeSensorData(device.device_serial, device.user_id, payload);
    if (!saved) console.error(`[INFLUX] Failed to save data for ${device.name}`);

    // Kiểm tra cảnh báo
    await this.checkAlertRules(device, payload);
  }

  // Validate payload
  isValidPayload(payload) {
    return payload && (
      typeof payload.temperature === 'number' ||
      typeof payload.humidity === 'number'
    );
  }

  // Bắt đầu lắng nghe messages
  startListening() {
    try {
      const client = getMQTTClient();

      client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });

      console.log('MQTT listening for messages');
    } catch (error) {
      console.error("Cannot start listening: MQTT Client not initialized");
    }
  }

  // Publish message
  publish(topic, message) {
    try {
      const client = getMQTTClient();

      const payload = typeof message === 'string' ? message : JSON.stringify(message);

      client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`Failed to publish to ${topic}:`, err);
        } else {
          console.log(`✓ Published to ${topic}`);
        }
      });
    } catch (error) {
      console.error("Cannot publish: MQTT Client not initialized");
    }
  }
}


const mqttService = new MQTTService();
export default mqttService;