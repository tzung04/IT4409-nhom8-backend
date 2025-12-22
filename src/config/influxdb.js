import { InfluxDB, Point } from '@influxdata/influxdb-client';

// Khởi tạo Client
export const influxDB = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN
});

// Tạo Write API (để ghi dữ liệu)
export const writeApi = influxDB.getWriteApi(
  process.env.INFLUX_ORG,
  process.env.INFLUX_BUCKET,
  'ms' // Độ chính xác thời gian (milliseconds)
);

// Tạo Query API (để đọc dữ liệu)
export const queryApi = influxDB.getQueryApi(process.env.INFLUX_ORG);

// Write sensor data
export const writeSensorData = async (deviceName, userId, measurements) => {
  try {
    const point = new Point('sensor_data')
      .tag('device_name', deviceName)
      .tag('user_id', userId);

    if (measurements.temperature !== undefined) {
      point.floatField('temperature', measurements.temperature);
    }
    if (measurements.humidity !== undefined) {
      point.floatField('humidity', measurements.humidity);
    }

    point.timestamp(new Date());
    writeApi.writePoint(point);
    await writeApi.flush();
    return true;
  } catch (err) {
    console.error('InfluxDB write error:', err);
    return false;
  }
};

/**
 * Auto-calculate aggregation window size dựa vào time range
 */
const getAggregationWindow = (hours) => {
  if (hours <= 1) return '1m';      // ≤1h: 1 phút (60 points)
  if (hours <= 6) return '2m';      // ≤6h: 2 phút (180 points)
  if (hours <= 24) return '5m';     // ≤24h: 5 phút (288 points)
  if (hours <= 72) return '15m';    // ≤3d: 15 phút (288 points)
  return '1h';                       // >3d: 1 giờ
};

/**
 * Query sensor data với AUTO AGGREGATION
 * @param {string} deviceName - Tên device
 * @param {string} userId - User ID
 * @param {number} hours - Số giờ lấy data
 * @returns {Promise<Array>} Array of data points
 */
export const querySensorData = async (deviceName, userId, hours = 24) => {
  // Tự động chọn window size
  const windowSize = getAggregationWindow(hours);
  
  console.log(`[InfluxDB] Query ${deviceName}, ${hours}h, window: ${windowSize}`);
  
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "sensor_data")
      |> filter(fn: (r) => r.user_id == "${userId}")
      |> filter(fn: (r) => r.device_name == "${deviceName}")
      |> aggregateWindow(every: ${windowSize}, fn: mean, createEmpty: false)
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;

  const result = [];
  return new Promise((resolve, reject) => {
    queryApi.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        result.push({
          time: o._time,
          temperature: o.temperature,
          humidity: o.humidity
        });
      },
      error(error) {
        console.error('InfluxDB query error:', error);
        reject(error);
      },
      complete() {
        console.log(`[InfluxDB] Returned ${result.length} aggregated points`);
        resolve(result);
      }
    });
  });
};

/**
 * Query RAW data (không aggregate) - Dùng cho export hoặc detail view
 * @param {string} deviceName - Tên device
 * @param {string} userId - User ID
 * @param {number} hours - Số giờ lấy data
 * @param {number} limit - Giới hạn số records (default: 10000)
 * @returns {Promise<Array>} Array of data points
 */
export const querySensorDataRaw = async (deviceName, userId, hours = 24, limit = 10000) => {
  console.log(`[InfluxDB] Query RAW ${deviceName}, ${hours}h, limit: ${limit}`);
  
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "sensor_data")
      |> filter(fn: (r) => r.user_id == "${userId}")
      |> filter(fn: (r) => r.device_name == "${deviceName}")
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> limit(n: ${limit})
  `;

  const result = [];
  return new Promise((resolve, reject) => {
    queryApi.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        result.push({
          time: o._time,
          temperature: o.temperature,
          humidity: o.humidity
        });
      },
      error(error) {
        console.error('InfluxDB query error:', error);
        reject(error);
      },
      complete() {
        console.log(`[InfluxDB] Returned ${result.length} raw points`);
        resolve(result);
      }
    });
  });
};

// Test connection
export const testConnection = async () => {
  try {
    const query = `from(bucket: "${process.env.INFLUX_BUCKET}") |> range(start: -1m) |> limit(n: 1)`;
    await queryApi.collectRows(query);
    console.log('✓ InfluxDB connected');
    return true;
  } catch (err) {
    console.error('InfluxDB connection failed:', err.message);
    return false;
  }
};