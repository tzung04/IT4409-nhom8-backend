import { querySensorData, querySensorDataRaw } from '../config/influxdb.js';
import Device from '../models/device.model.js';

/**
 * Xác định status của device dựa vào is_active và data gần nhất
 */
const determineDeviceStatus = (device, latestData) => {
  if (!device.is_active) return 'inactive';
  if (!latestData || !latestData.time) return 'offline';
  
  const lastDataTime = new Date(latestData.time);
  const now = new Date();
  const diffMinutes = (now - lastDataTime) / 1000 / 60;
  
  return diffMinutes > 2 ? 'offline' : 'online';
};

/**
 * Lấy dữ liệu lịch sử của 1 thiết bị 
 */
export const handlerGetDeviceData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;
    const { hours = 24, raw = false } = req.query; 

    // Verify device belongs to user
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    if (device.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Query InfluxDB (aggregated by default)
    const influxData = raw === 'true' 
      ? await querySensorDataRaw(device.name, userId, parseInt(hours))
      : await querySensorData(device.name, userId, parseInt(hours));

    // Transform data cho frontend
    // InfluxDB format: [{ time, temperature, humidity }]
    // Frontend expect: [{ timestamp, metric_type, value }]
    const transformedData = [];
    
    influxData.forEach(point => {
      // Add temperature point
      if (point.temperature !== undefined && point.temperature !== null) {
        transformedData.push({
          timestamp: point.time,
          metric_type: 'temperature',
          value: point.temperature
        });
      }
      
      // Add humidity point
      if (point.humidity !== undefined && point.humidity !== null) {
        transformedData.push({
          timestamp: point.time,
          metric_type: 'humidity',
          value: point.humidity
        });
      }
    });

    return res.json({
      device: {
        id: device.id,
        name: device.name,
        serial: device.device_serial
      },
      timeRange: `${hours} hours`,
      dataPoints: transformedData.length,
      data: transformedData,
      aggregated: raw !== 'true' // Thông báo cho frontend biết data đã aggregated
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Lấy dữ liệu mới nhất của 1 thiết bị
 */
export const handlerGetLatestData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    if (device.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Query last 1 hour 
    const data = await querySensorDataRaw(device.name, userId, 1, 100);
    const latest = data.length > 0 ? data[data.length - 1] : null;

    const status = determineDeviceStatus(device, latest);

    return res.json({
      device: {
        id: device.id,
        name: device.name,
        serial: device.device_serial,
        is_active: device.is_active
      },
      latest: latest,
      status: status
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Lấy dữ liệu mới nhất cho TẤT CẢ thiết bị (Dashboard overview)
 */
export const handlerGetAllDevicesLatest = async (req, res) => {
  try {
    const userId = req.user.id;
    const devices = await Device.findByUserId(userId);

    const devicePromises = devices.map(async (device) => {
      try {
        // Query latest data (không cần aggregate)
        const data = await querySensorDataRaw(device.name, userId, 1, 100);
        const latest = data.length > 0 ? data[data.length - 1] : null;
        const status = determineDeviceStatus(device, latest);

        return {
          id: device.id,
          name: device.name,
          serial: device.device_serial,
          place_name: device.place_name,
          is_active: device.is_active,
          latest: latest,
          status: status,
          lastSeen: latest ? latest.time : null
        };
      } catch (err) {
        console.error(`Error getting data for device ${device.id}:`, err);
        return {
          id: device.id,
          name: device.name,
          serial: device.device_serial,
          latest: null,
          status: 'error'
        };
      }
    });

    const summary = await Promise.all(devicePromises);

    const stats = {
      total: devices.length,
      online: summary.filter(d => d.status === 'online').length,
      offline: summary.filter(d => d.status === 'offline').length,
      inactive: summary.filter(d => d.status === 'inactive').length
    };

    return res.json({
      stats: stats,
      devices: summary
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};