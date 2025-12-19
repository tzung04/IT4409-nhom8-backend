import Device from '../models/device.model.js';

export const handlerGetDashboardUrl = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Lấy tất cả devices của user
    const devices = await Device.findByUserId(userId);
    
    if (devices.length === 0) {
      return res.json({
        message: 'No devices found',
        embedUrl: null,
        devices: []
      });
    }
    
    // Lấy device serials để pass vào Grafana variables
    const deviceSerials = devices.map(d => d.device_serial).join(',');
    
    // Generate Grafana embed URL
    const grafanaUrl = process.env.GRAFANA_URL || 'http://localhost:3001';
    const dashboardUid = process.env.GRAFANA_DASHBOARD_UID || 'iot-dashboard';
    
    // Build URL với parameters
    const params = new URLSearchParams({
      orgId: '1',
      'var-user_id': userId,
      'var-devices': deviceSerials, // Cần khớp với tên biến trong Grafana Dashboard
      theme: 'light',
      kiosk: 'tv', // Hide Grafana UI (sidebar, header)
      from: 'now-24h',
      to: 'now',
      refresh: '5s'
    });
    
    const embedUrl = `${grafanaUrl}/d/${dashboardUid}/iot-monitoring?${params.toString()}`;
    
    return res.json({
      embedUrl: embedUrl,
      devices: devices.map(d => ({
        id: d.id,
        name: d.name,
        serial: d.device_serial,
        is_active: d.is_active
      }))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const handlerGetPanelUrl = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId, panelId, timeRange } = req.query;
    
    // Verify device belongs to user
    const device = await Device.findById(deviceId);
    
    if (!device || device.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const grafanaUrl = process.env.GRAFANA_URL || 'http://localhost:3001';
    const dashboardUid = process.env.GRAFANA_DASHBOARD_UID || 'iot-dashboard';
    
    // d-solo for single panel embed
    const params = new URLSearchParams({
      orgId: '1',
      'var-device': device.device_serial,
      theme: 'light',
      panelId: panelId || '2', // Panel ID trong Grafana
      from: `now-${timeRange || '24h'}`,
      to: 'now'
    });
    
    const embedUrl = `${grafanaUrl}/d-solo/${dashboardUid}/iot-monitoring?${params.toString()}`;
    
    return res.json({
      embedUrl: embedUrl,
      device: {
        id: device.id,
        name: device.name,
        serial: device.device_serial
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};