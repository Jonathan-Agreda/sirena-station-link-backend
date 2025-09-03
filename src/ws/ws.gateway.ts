import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://host.docker.internal:3000',
      ...(process.env.CORS_ORIGINS?.split(',') || []),
    ],
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  namespace: '/ws',
  path: '/socket.io',
  // Configuraciones adicionales para Docker
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class WsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer()
  server: Server;

  // src/ws/ws.gateway.ts

  afterInit(server: Server) {
    this.logger.log('WebSocket initialized');
    this.logger.debug('CORS Origins:', process.env.CORS_ORIGINS?.split(','));

    // ✅ SOLUCIÓN ALTERNATIVA: Usar encadenamiento opcional
    server.engine?.on('connection_error', (err) => {
      this.logger.error('WebSocket connection error:', err.req);
      this.logger.error('Error details:', err.code, err.message, err.context);
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(
      `Client connected: ${client.id} from ${client.handshake.address}`,
    );
    this.logger.debug('Client headers:', client.handshake.headers.origin);

    // Enviar confirmación de conexión
    client.emit('connected', {
      clientId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Ejemplo: cliente envía mensaje "ping"
  @SubscribeMessage('ping')
  handlePing(client: Socket, payload: any) {
    this.logger.debug(`Ping from ${client.id}`, payload);
    client.emit('pong', {
      time: new Date().toISOString(),
      clientId: client.id,
    });
  }

  // Método público para emitir desde otros servicios
  emitEvent(event: string, data: any) {
    this.logger.debug(`Emitting event: ${event}`, data);
    this.server.emit(event, data);
  }

  // Método para obtener información de conexiones activas
  getConnectedClients(): number {
    return this.server.sockets.sockets.size;
  }
}
