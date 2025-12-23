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
    
    // Build URL params
    const grafanaUrl = process.env.GRAFANA_URL;
    const dashboardUid = process.env.GRAFANA_DASHBOARD_UID;
    
    const params = new URLSearchParams();
    params.append('orgId', '1');
    params.append('var-user_id', userId);
    
    // Append từng device name riêng lẻ
    devices.forEach(device => {
      params.append('var-devices', device.name);
    });
    
    params.append('from', 'now-24h');
    params.append('to', 'now');
    params.append('refresh', '5s');
    
    // Trả về URL để đi qua backend proxy
    const embedUrl = `${grafanaUrl}/d/${dashboardUid}/iot-dashboard-temperature-and-humidity?${params.toString()}&kiosk&theme=light`;
    
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
    
    const grafanaUrl = process.env.GRAFANA_URL;
    const dashboardUid = process.env.GRAFANA_DASHBOARD_UID;
    
    const params = new URLSearchParams({
      orgId: '1',
      'var-user_id': userId,
      'var-device': device.name,  
      theme: 'light',
      panelId: panelId || '2',
      from: `now-${timeRange || '24h'}`,
      to: 'now',
    });
    
    // URL cho single panel
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