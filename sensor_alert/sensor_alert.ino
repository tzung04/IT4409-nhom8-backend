#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

/* ========= WIFI ========= */
const char* WIFI_SSID = "KTCN";
const char* WIFI_PASS = "123456789";

/* ========= MQTT ========= */
const char* MQTT_BROKER = "0f81cbb30b3d48af8ce6181dc82fd078.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_USER = "iot_backend";
const char* MQTT_PASS = "Nhom8web";

/* ========= SENSOR ========= */
#define LED_TEMP 15
#define BUZZ_TEMP 16
#define LED_HUMID 17
#define BUZZ_HUMID 18
#define DHTPIN 4
#define DHTTYPE DHT11  // đổi DHT11 nếu cần
DHT dht(DHTPIN, DHTTYPE);

/* ========= GLOBAL ========= */
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

String deviceMac;
String deviceTopic = "";
unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL = 5000;
bool tempAlert = false;
bool humidAlert = false;

unsigned long lastBlink = 0;
bool blinkState = false;
unsigned long lastTempAlertTime = 0;
unsigned long lastHumidAlertTime = 0;

const unsigned long ALERT_TIMEOUT = 2000;  // 2 giây


/* ========= MQTT CALLBACK ========= */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0';
  String msg = String((char*)payload);

  Serial.println("\n[MQTT RECEIVED]");
  Serial.println(topic);
  Serial.println(msg);

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) return;

  /* ===== 1. PROVISIONING RESPONSE ===== */
  if (doc.containsKey("status")) {

    if (doc["status"] == "success") {
      deviceTopic = doc["topic"].as<String>();

      String alertTopic = deviceTopic + "/alert";
      mqttClient.subscribe(alertTopic.c_str(), 1);

      Serial.println("Provisioning SUCCESS");
      Serial.print("Assigned topic: ");
      Serial.println(deviceTopic);
    } 
    else {
      Serial.println("Provisioning FAILED");
    }

    return; //  QUAN TRỌNG: kết thúc tại đây
  }

  /* ===== 2. ALERT COMMAND ===== */
  if (doc.containsKey("metric") && doc.containsKey("state")) {

    String metric = doc["metric"];
    String state  = doc["state"];
    bool on = (state == "ON");

    unsigned long now = millis();

    if (metric == "temperature") {
      tempAlert = on;
      if (on) lastTempAlertTime = now;
    } 
    else if (metric == "humidity") {
      humidAlert = on;
      if (on) lastHumidAlertTime = now;
    }

    return;
  }

  // Nếu message không thuộc 2 loại trên → bỏ qua
}


/* ========= PROVISION ========= */
void sendProvisionRequest() {
  StaticJsonDocument<128> doc;
  doc["mac"] = deviceMac;

  char buffer[128];
  serializeJson(doc, buffer);

  mqttClient.publish("system/provisioning/req", buffer, true);
  Serial.println("Sent provisioning request");
}

void handleAlertActuators() {
  unsigned long now = millis();

  // Auto clear alert nếu timeout
  if (tempAlert && (now - lastTempAlertTime > ALERT_TIMEOUT)) {
    tempAlert = false;
  }

  if (humidAlert && (now - lastHumidAlertTime > ALERT_TIMEOUT)) {
    humidAlert = false;
  }

  if (now - lastBlink >= 1000) {
    lastBlink = now;
    blinkState = !blinkState;
  }

  // Temperature
  digitalWrite(LED_TEMP, tempAlert && blinkState);
  digitalWrite(BUZZ_TEMP, tempAlert && blinkState);

  // Humidity
  digitalWrite(LED_HUMID, humidAlert && blinkState);
  digitalWrite(BUZZ_HUMID, humidAlert && blinkState);
}

/* ========= WIFI ========= */
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

/* ========= MQTT ========= */
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting MQTT...");
    String clientId = "esp32_" + deviceMac;

    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("connected");

      String resTopic = "system/provisioning/" + deviceMac + "/res";
      mqttClient.subscribe(resTopic.c_str(), 1);

      sendProvisionRequest();
    } else {
      Serial.print("failed, rc=");
      Serial.println(mqttClient.state());
      delay(2000);
    }
  }
}

/* ========= SETUP ========= */
void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(LED_TEMP, OUTPUT);
  pinMode(BUZZ_TEMP, OUTPUT);
  pinMode(LED_HUMID, OUTPUT);
  pinMode(BUZZ_HUMID, OUTPUT);

  connectWiFi();
  deviceMac = WiFi.macAddress();
  deviceMac.toUpperCase();

  secureClient.setInsecure();  // giống simulator (không pin CA)
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

/* ========= LOOP ========= */
void loop() {
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();
  handleAlertActuators();


  if (deviceTopic == "") return;

  unsigned long now = millis();
  if (now - lastSend > SEND_INTERVAL) {
    lastSend = now;

    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (isnan(t) || isnan(h)) {
      Serial.println("Failed to read DHT");
      return;
    }

    StaticJsonDocument<128> doc;
    doc["temperature"] = round(t * 10) / 10.0;
    doc["humidity"] = round(h * 10) / 10.0;

    char buffer[128];
    serializeJson(doc, buffer);

    mqttClient.publish(deviceTopic.c_str(), buffer, false);
    Serial.printf("Sent: T=%.1f H=%.1f\n", t, h);
  }
}
