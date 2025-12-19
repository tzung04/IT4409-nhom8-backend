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
export const writeSensorData = async (deviceSerial, userId, measurements) => {
  try {
    const point = new Point('sensor_data')
      .tag('device', deviceSerial)
      .tag('user_id', userId.toString());

    // Add fields dynamically
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

// Query sensor data
export const querySensorData = async (deviceSerial, hours = 24) => {
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "sensor_data")
      |> filter(fn: (r) => r.user_id == "${userId}")
      |> filter(fn: (r) => r.device == "${deviceSerial}")
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