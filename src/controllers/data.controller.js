import { querySensorData } from '../config/influxdb.js'; 
import Device from '../models/device.model.js';        

// Lấy dữ liệu lịch sử của 1 thiết bị 
export const handlerGetDeviceData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;
    const { hours = 24 } = req.query;
    
    // Verify device belongs to user
    const device = await Device.findById(deviceId);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    if (device.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Query InfluxDB
    const data = await querySensorData(device.device_serial, parseInt(hours));
    
    return res.json({
      device: {
        id: device.id,
        name: device.name,
        serial: device.device_serial
      },
      timeRange: `${hours} hours`,
      dataPoints: data.length,
      data: data
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Lấy dữ liệu mới nhất của 1 thiết bị (hiển thị thẻ chi tiết)
export const handlerGetLatestData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;
    
    // Verify device belongs to user
    const device = await Device.findById(deviceId);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    if (device.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Query last 1 hour to get latest
    const data = await querySensorData(device.device_serial, 1);
    
    if (data.length === 0) {
      return res.json({
        device: {
          id: device.id,
          name: device.name
        },
        latest: null,
        status: 'offline'
      });
    }
    
    // Get most recent reading (phần tử cuối cùng trong mảng)
    const latest = data[data.length - 1];
    
    return res.json({
      device: {
        id: device.id,
        name: device.name,
        serial: device.device_serial
      },
      latest: latest,
      status: 'online'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Lấy dữ liệu mới nhất cho TẤT CẢ thiết bị (Dashboard tổng quan)
export const handlerGetAllDevicesLatest = async (req, res) => {
  try {
    const userId = req.user.id;
    const devices = await Device.findByUserId(userId);

    const devicePromises = devices.map(async (device) => {
      try {
        const data = await querySensorData(device.device_serial, 1);
        const latest = data.length > 0 ? data[data.length - 1] : null;

        // Trả về object kết quả thành công
        return {
          id: device.id,
          name: device.name,
          serial: device.device_serial,
          place_name: device.place_name,
          latest: latest,
          status: latest ? 'online' : 'offline'
        };
      } catch (err) {
        console.error(`Error getting data for device ${device.id}:`, err);
        // Trả về object lỗi
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

    return res.json({
      totalDevices: devices.length,
      devices: summary
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};