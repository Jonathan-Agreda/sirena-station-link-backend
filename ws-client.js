// Cliente de prueba WebSocket (Socket.IO) para SirenaStationLink
// Si ves el warning de "MODULE_TYPELESS_PACKAGE_JSON",
// agrega "type": "module" a tu package.json o renombra este archivo a .mjs.

import { io } from 'socket.io-client';

// ⚠️ Ajusta si tu backend corre en otro host/puerto
const WS_URL = process.env.WS_URL ?? 'http://localhost:4000/ws';

const socket = io(WS_URL, {
  transports: ['websocket'], // fuerza solo WebSocket
});

socket.on('connect', () => {
  console.log('✅ Conectado al servidor WS:', socket.id);
  // Enviamos un ping de prueba
  socket.emit('ping', { hello: 'world' });
});

socket.on('connect_error', (err) => {
  console.error('⚠️ connect_error:', err?.message || err);
});

socket.on('error', (err) => {
  console.error('⚠️ socket error:', err);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Desconectado:', reason);
});

socket.on('pong', (data) => {
  console.log('🔄 Pong recibido:', data);
});

// --- Eventos que emite el backend ---
socket.on('device.state', (data) => {
  console.log('📡 Estado:', JSON.stringify(data, null, 2));
});

socket.on('device.lwt', (data) => {
  console.log('⚠️ LWT (offline):', JSON.stringify(data, null, 2));
});

socket.on('device.heartbeat', (data) => {
  console.log('💓 Heartbeat:', JSON.stringify(data, null, 2));
});

socket.on('device.ack', (data) => {
  console.log('✅ ACK:', JSON.stringify(data, null, 2));
});
