# IoT Monitoring Backend

Backend cho hệ thống giám sát IoT.

## Hướng dẫn chạy Backend

### Bước 1: Khởi động các services (InfluxDB, MQTT Broker)

Tại thư mục cha, chạy lệnh:

```bash
docker-compose up -d
```

Lệnh này sẽ khởi động:
- **InfluxDB** (port 8086) - Lưu trữ time series data
- **Mosquitto MQTT Broker** (port 1884) - Nhận dữ liệu từ sensors
Lưu ý: có thể xem/sửa port trong file docker-compose.yml 

### Bước 2: Cài đặt dependencies

```bash
cd backend
npm install
```

### Bước 3: Cấu hình môi trường

Tạo file `.env` trong thư mục `backend/`:

```env
# Server
PORT=5000

# PostgreSQL (Metadata)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=iot_monitoring
PG_USER=postgres
PG_PASSWORD=your_password

# InfluxDB (Time Series Data)
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your_influx_token
INFLUX_ORG=your_org
INFLUX_BUCKET=iot_sensors

# MQTT Broker
MQTT_BROKER=mqtt://localhost:1884
MQTT_USERNAME=
MQTT_PASSWORD=

# JWT
JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRE=7d

# Email (for password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=IoT Monitor <noreply@iotmonitor.com>

# Grafana
GRAFANA_URL=http://localhost:3001
GRAFANA_DASHBOARD_UID=dashboard_uid
```

### Bước 4: Setup Database

**Tạo PostgreSQL database:**
```bash
psql -U postgres
CREATE DATABASE iot_monitoring;
\q
```

**Chạy migration để tạo tables:**
```bash
node src/database/setup.js
```

### Bước 5.1: Setup InfluxDB

1. Truy cập: `http://localhost:8086`
2. Tạo tài khoản admin
3. Tạo Organization (ví dụ: `my-org`)
4. Tạo Bucket tên: `iot_sensors`
5. Vào **API Tokens** → Copy token và paste vào `.env`

### Bước 5.2: Setup Grafana

1. Truy cập:
- URL: `http://localhost:3001`
- Login: `admin` / `admin`
2. Vào Connections/Data Sources
3. Add data source: chọn InfluxDB
  Cấu hình:
    ```
    Name: InfluxDB-IoT

    Query Language: Flux

    HTTP:
      URL: http://influxdb:8086

    InfluxDB Details(xem ở bước 5.1):
      Organization: 
      Token: 
      Default Bucket: 
    ```
4. Click **Save & Test** → Phải thấy "Success"
5. Tạo Dashboard:
  5.1 Tạo Dashboard mới

    1. Click **+** (sidebar) → **Create Dashboard**
    2. Click **Add visualization**
    3. Chọn data source: **InfluxDB-IoT**

  5.2 Tạo Variables (quan trọng!)

  Click **Dashboard settings** → **Variables** → **Add variable**

  Variable 1: user_id
  ```
  Name: user_id
  Type: Query
  Data source: InfluxDB-IoT
  Query:
    from(bucket: "iot_sensors")
      |> range(start: -7d)
      |> filter(fn: (r) => r._measurement == "sensor_data")
      |> keep(columns: ["user_id"])
      |> distinct(column: "user_id")

  Multi-value: NO
  Include All option: NO
  ```

  Variable 2: devices
  ```
  Name: devices
  Type: Query
  Data source: InfluxDB-IoT
  Query:
    from(bucket: "iot_sensors")
      |> range(start: -7d)
      |> filter(fn: (r) => r._measurement == "sensor_data")
      |> filter(fn: (r) => r.user_id == "${user_id}")
      |> keep(columns: ["device"])
      |> distinct(column: "device")

  Multi-value: YES
  Include All option: YES

  Sau đó Save
6. Tạo Panels
Panel 1: Temperature Time Series
  Click Add panel
  Query:
  ```
  from(bucket: "iot_sensors")
    |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
    |> filter(fn: (r) => r._measurement == "sensor_data")
    |> filter(fn: (r) => r.user_id == "${user_id}")
    |> filter(fn: (r) => r.device =~ /^${devices:regex}$/)
    |> filter(fn: (r) => r._field == "temperature")
    |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)
  ```
  Visualization:

  Type: Time series
  Title: Temperature Over Time

  Panel options:

  Unit: Celsius (°C)
  Legend: Show

  Click Save

Panel 2: Humidity Time Series
Tương tự Panel 1, chỉ đổi:
```
|> filter(fn: (r) => r._field == "humidity")
```
Panel options:

Unit: Percent (0-100)
Title: Humidity Over Time

Panel 3: Latest Temperature (Stat)
Click Add panel
Query:
```
from(bucket: "iot_sensors")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "sensor_data")
  |> filter(fn: (r) => r.user_id == "${user_id}")
  |> filter(fn: (r) => r.device =~ /^${devices:regex}$/)
  |> filter(fn: (r) => r._field == "temperature")
  |> last()
```
Visualization:

Type: Stat
Title: Current Temperature
Unit: Celsius (°C)
Graph mode: None
Text size: Auto
Panel 4: Latest Humidity (Gauge)
Query:
```
from(bucket: "iot_sensors")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "sensor_data")
  |> filter(fn: (r) => r.user_id == "${user_id}")
  |> filter(fn: (r) => r.device =~ /^${devices:regex}$/)
  |> filter(fn: (r) => r._field == "humidity")
  |> last()
```
Visualization:

Type: Gauge
Title: Current Humidity
Unit: Percent (0-100)
Min: 0
Max: 100

7. Lưu Dashboard

Click Save dashboard (góc trên bên phải)
Name: dashboard_name
Click Save

Lấy Dashboard UID: xem url của dashboard, uid nằm ở /d/uid/dashboard_name

Copy UID (ví dụ: abc123xyz)
Paste vào .env

8. Giả sử đã đặt dashboard_name là IoT-monitoring
có thể lấy url sau để test:
nhớ tạo 1 user có 1 device xác định topic, bắn dữ liệu vô topic liên tục để test
 có thể dùng dashboardRoutes để lấy url
http://localhost:3001/d/abc123xyz/iot-monitoring?orgId=1&var-user_id=1&theme=light&from=now-15m&to=now&timezone=browser&refresh=5s

### Huong dan tao va kich hoat thiet bi
#### 1. Them thiet bi logic
```bash
POST /api/devices/
Content-Type: application/json

{
  "name": "Cam bien kho 1",
  "mac_address": "AABBCCDDEEFF" (dia chi mac lay in tren thiet bi, nguoi dung tu nhap vao)
}
```
**response**
```json
{
    "id": 1,
    "user_id": 1,
    "place_id": null,
    "mac_address": "AABBCCDDEEFF",
    "device_serial": "E248D27E014AAAC6",
    "name": "Cam bien kho 1",
    "topic": "/devices/AABBCCDDEEFF/E248D27E014AAAC6/data",
    "is_active": false,
    "created_at": "2025-12-16T01:23:10.933Z"
}
```
#### 2. Ket noi voi thiet bi vat ly
Đến bước này sẽ do esp32 làm việc với server
Cụ thể như sau:
- Cấp nguồn cho esp32
- esp32 kết nối wifi, kết nối mqtt broker sau đó subscribe topic system/provisioning/${mac}/res để chờ phản hồi từ server
- esp32 gửi message {"mac": "AABBCCDDEEFF"} đến topic: system/provisioning/req
- server active device logic, gửi topic nhận data đã tạo về cho esp32 qua topic system/provisioning/${mac}/res
- esp32 nhận được res thì bắt đầu publish data vào topic server gửi về (/devices/AABBCCDDEEFF/E248D27E014AAAC6/data)

thế là xong!

[Nếu không có esp32 bạn dùng mqtt client tuỳ ý giả làm esp32 mà làm nhé]
vi du: 
1. send req: 
 mosquitto_pub -h localhost -p 1884 -t system/provisioning/req -m '{"mac": "AABBCCDDEEFF"}'
2. recv res: 
 mosquitto_sub -h localhost -p 1884 -t system/provisioning/AABBCCDDEEFF/res
{"status":"success","topic":"/devices/AABBCCDDEEFF/E248D27E014AAAC6/data"} (dong nay xuat hien khi ong vua publish o phia tren!)



### Bước 6: Khởi động Server

```bash
node src/server.js
```

Server sẽ chạy tại: `http://localhost:5000`

Bạn sẽ thấy log:
```
✓ PostgreSQL pool created
✓ InfluxDB connected
✓ Email service ready
✓ MQTT Broker connected
MQTT listening for messages
Subscribed to X device topics
Server running on port 5000
```

---

## Hướng dẫn sử dụng API

### 1. Authentication

#### Register (Đăng ký)
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "john",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "john",
    "email": "john@example.com"
  }
}
```

#### Login (Đăng nhập)
```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "john",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "john",
    "email": "john@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer YOUR_TOKEN
```

#### Change Password
```bash
PUT /api/auth/change-password
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "currentPassword": "password123",
  "newPassword": "newpassword456"
}
```

#### Forgot Password
```bash
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```
Hệ thống sẽ gửi mã 6 ký tự qua email.

#### Reset Password
```bash
POST /api/auth/reset-password
Content-Type: application/json

{
  "email": "john@example.com",
  "code": "ABC123",
  "newPassword": "newpassword456"
}
```

---

## Test MQTT và InfluxDB

### 1. Thêm device vào database

```bash
POST /api/devices
Content-Type: application/json

{
  "mac_address": "AABBCCDDEEFF",
  "name": "Cam bien kho 1",
  "place_id": "1" (co roi thi them khong thi thoi nhe)
}
```

### 2. Publish test data qua MQTT

**Cài mosquitto client:**
```bash
# Ubuntu/Debian
sudo apt-get install mosquitto-clients

# Mac
brew install mosquitto
```

**Gửi dữ liệu sensor:**
topic ban vao database xem nhe
```bash
mosquitto_pub -h localhost -t "/devices/AABBCCDDEEFF/{serial}/data" \
  -m '{"temperature": 25.5, "humidity": 60.3}'
```

### 3. Kiểm tra kết quả

**Trong terminal server:**
```
Message from /devices/AABBCCDDEEFF: { temperature: 25.5, humidity: 60.3 }
✓ Data saved to InfluxDB for device: Cảm biến kho 1
```

**Trong InfluxDB UI** (`http://localhost:8086`):
1. Vào **Data Explorer**
2. Chọn bucket: `iot_sensors`
3. Filter: `_measurement = sensor_data`
4. Xem dữ liệu temperature và humidity

---

## Cấu trúc Database

### PostgreSQL (Metadata)

**users**
- id, username, email, password_hash
- reset_code, reset_expires
- created_at

**places**
- id, user_id, name, description
- created_at

**devices**
- id, user_id, place_id
- mac_address, device_serial, name, topic
- is_active, created_at

**alert_rules**
- id, device_id
- metric_type, condition, threshold
- email_to, is_enabled, created_at

**alert_logs**
- id, device_id, rule_id
- value_at_time, message, triggered_at

### InfluxDB (Time Series)

**Measurement:** `sensor_data`
- **Tags:** `device` (device_serial)
- **Fields:** `temperature`, `humidity`
- **Timestamp:** auto

---

## Cấu hình Email (Gmail)

1. Vào **Google Account** → **Security**
2. Bật **2-Factor Authentication**
3. Tạo **App Password** cho Mail
4. Copy App Password vào `.env` → `EMAIL_PASSWORD`

---

## Workflow Hệ Thống

1. **Device** gửi dữ liệu qua MQTT → Topic đã đăng ký
2. **Backend** nhận message → Parse JSON
3. Tìm **device** trong PostgreSQL theo topic
4. Lưu data vào **InfluxDB** (time series)
5. Kiểm tra **Alert Rules** → Gửi email nếu vượt ngưỡng

---

## Troubleshooting

### PostgreSQL không kết nối
```bash
# Kiểm tra PostgreSQL đang chạy
sudo systemctl status postgresql

# Kiểm tra credentials trong .env
```

### MQTT không kết nối
```bash
# Kiểm tra Mosquitto đang chạy
docker ps | grep mosquitto

# Test connection
mosquitto_sub -h localhost -t "#"
```

### InfluxDB không hoạt động
```bash
# Kiểm tra container đang chạy
docker ps | grep influxdb

# Xem logs
docker logs influxdb
```

### Email không gửi được
- Kiểm tra đã tạo App Password chưa
- Kiểm tra EMAIL_USER và EMAIL_PASSWORD trong .env
- Test connection: server sẽ log `✓ Email service ready`

---

## Notes

- JWT token hết hạn sau **7 ngày**
- Reset code hết hạn sau **5 phút**
- MQTT QoS: **1** (at least once delivery)
- PostgreSQL pool: max **20 connections**

---