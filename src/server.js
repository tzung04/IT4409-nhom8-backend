import dotenv from 'dotenv';
import express, { json, urlencoded } from 'express';
import cors from 'cors';


import {setupDatabase} from './database/setup.js'
import {connectMQTT} from './config/mqtt.js'
import mqttService from './services/mqtt.service.js'
import emailService from './services/email.service.js';
import { testConnection } from './config/influxdb.js';


// Import routes
import authRoutes from './routes/auth.routes.js';
import deviceRoutes from './routes/device.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import dataRoutes from './routes/data.routes.js';
import alertRoutes from './routes/alert.routes.js';
import historyRoutes from './routes/history.routes.js';
import placeRoutes from './routes/place.routes.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cors());
app.use(json());
app.use(urlencoded({ extended: true }));

// Setup Database
await setupDatabase();

// Test InfluxDB
await testConnection();

// Test Email Service
emailService.testConnection();

// MQTT server
connectMQTT();
mqttService.startListening();
setTimeout(() => {
      mqttService.subscribeAllDevices();
    }, 5000);

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString() 
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/alert', alertRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/places', placeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
