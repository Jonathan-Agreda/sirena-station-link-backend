// Cliente de prueba WebSocket (Socket.IO) para SirenaStationLink

import { io } from 'socket.io-client';

// ⚠️ Ajusta si tu backend corre en otro host/puerto
const socket = io('http://localhost:4000/ws', {
  transports: ['websocket'], // fuerza solo WebSocket
});

socket.on('connect', () => {
  console.log('✅ Conectado al servidor WS:', socket.id);

  // Enviamos un ping de prueba
  socket.emit('ping', { hello: 'world' });
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
