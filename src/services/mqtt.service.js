import { getMQTTClient } from '../config/mqtt.js';
import Device from '../models/device.model.js';
import { writeSensorData } from '../config/influxdb.js';
import AlertRule from '../models/alertRule.model.js'; 
import AlertLog from '../models/alertLog.model.js'; 
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
        'greater_than_or_equal': '≥',
        'less_than_or_equal': '≤'
      };
      
      console.log(`\n[ALERT CHECK] Starting for device: ${device.name} (ID: ${device.id})`);
      console.log(`[ALERT CHECK] Server time (Node.js): ${new Date().toISOString()}`);
      console.log(`[ALERT CHECK] Server timestamp: ${Date.now()}`);
      
      const rules = await AlertRule.findEnabledByDeviceId(device.id);
      
      if (!rules || rules.length === 0) {
        console.log(`[ALERT CHECK] No rules found for device ${device.id}`);
        return;
      }
      
      console.log(`[ALERT CHECK] Found ${rules.length} rule(s) to check`);

      for (const rule of rules) {
        let sensorValue;
        let metricName = rule.metric_type.toLowerCase();
        
        const conditionSymbol = conditionMap[rule.condition] || rule.condition;

        if (metricName === 'temperature') sensorValue = payload.temperature;
        else if (metricName === 'humidity') sensorValue = payload.humidity;

        if (sensorValue === undefined || sensorValue === null) {
          console.log(`[ALERT CHECK] No ${metricName} data in payload, skipping rule ${rule.id}`);
          continue;
        }

        console.log(`\n[RULE ${rule.id}] Checking: ${metricName} ${conditionSymbol} ${rule.threshold}`);
        console.log(`[RULE ${rule.id}] Current value: ${sensorValue}`);

        // 1. Kiểm tra ngưỡng
        const isViolated = this.checkCondition(sensorValue, rule.condition, rule.threshold);
        console.log(`[RULE ${rule.id}] Violated: ${isViolated}`);

        if (isViolated) {
          // 2. Debounce (5 phút)
          // BƯỚC 1: LUÔN LUÔN PUBLISH LỆNH ĐIỀU KHIỂN (Để ESP32 luôn phản ứng kịp thời)
          const alertTopic = `${device.topic}/alert`;
          this.publish(alertTopic, {
              metric: rule.metric_type.toLowerCase(),
              state: "ON"
          });

          // BƯỚC 2: KIỂM TRA DEBOUNCE CHO CÁC TÁC VỤ NẶNG (Email, DB Log)
          console.log(`[RULE ${rule.id}] Checking for recent alerts...`);
          
          const recentAlert = await AlertLog.findRecentByDeviceAndRule(device.id, rule.id, 5);
          
          if (recentAlert) {
            console.log(`[DEBOUNCE] Recent alert found!`);
            console.log(`[DEBOUNCE]   Alert ID: ${recentAlert.id}`);
            console.log(`[DEBOUNCE]   Triggered at (from DB): ${recentAlert.triggered_at}`);
            console.log(`[DEBOUNCE]   Triggered at (ISO): ${new Date(recentAlert.triggered_at).toISOString()}`);
            console.log(`[DEBOUNCE]   Triggered timestamp: ${new Date(recentAlert.triggered_at).getTime()}`);
            
            // Tính thủ công để debug
            const now = Date.now();
            const alertTime = new Date(recentAlert.triggered_at + "UTC").getTime();
            const diffMs = now - alertTime;
            const diffMinutes = diffMs / 1000 / 60;
            
            console.log(`[DEBOUNCE]   Current time: ${now}`);
            console.log(`[DEBOUNCE]   Alert time: ${alertTime}`);
            console.log(`[DEBOUNCE]   Difference (ms): ${diffMs}`);
            console.log(`[DEBOUNCE]   Difference (minutes): ${diffMinutes.toFixed(2)}`);
            console.log(`[DEBOUNCE] ⏭️  Alert skipped (within 5 min window)`);
            continue;
          } else {
            console.log(`[DEBOUNCE] No recent alert found, proceeding...`);
          }

          // 3. Tạo Log
          const message = `[CẢNH BÁO ${rule.metric_type.toUpperCase()}] ${device.name}: ${sensorValue} ${conditionSymbol} ${rule.threshold}`;
          
          console.log(`[ALERT CREATE] Creating new alert log...`);
          console.log(`[ALERT CREATE] Message: ${message}`);
          
          await AlertLog.create({
            device_id: device.id,
            rule_id: rule.id,
            rule_severity: rule.severity,
            value_at_time: sensorValue,
            message: message,
          });

          console.log(`\n🚨 ALERT TRIGGERED: ${message}`);
          console.log(`🚨 Time: ${new Date().toISOString()}\n`);

          

          const ruleDisplay = `
          ${rule.metric_type} ${conditionSymbol} ${rule.threshold}
          (Giá trị vượt ngưỡng: ${sensorValue})
          `;
          
          // 4. Gửi Email
          try {
            console.log(`[EMAIL] Sending alert to: ${rule.email_to}`);
            const emailSent = await emailService.sendAlertEmail(rule.email_to, device.name, ruleDisplay);
            
            if (emailSent) {
              console.log(`[EMAIL] ✓ Successfully sent to ${rule.email_to}`);
            } else {
              console.warn(`[EMAIL] ✗ Failed to send to ${rule.email_to}`);
            }
          } catch (mailErr) {
            console.error(`[EMAIL ERROR] ${mailErr.message}`);
            console.error(mailErr.stack);
          }
        }
      }
      
      console.log(`[ALERT CHECK] Completed for device: ${device.name}\n`);
    } catch (err) {
      console.error("[ALERT ERROR] Check rules failed:", err);
      console.error(err.stack);
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
    const saved = await writeSensorData(device.name, device.user_id, payload);
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

      console.log(`[MQTT SEND] Topic: ${topic} | Payload: ${payload}`);
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