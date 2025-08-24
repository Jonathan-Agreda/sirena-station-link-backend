import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mqtt, {
  IClientOptions,
  MqttClient,
  IClientPublishOptions,
  ISubscriptionGrant,
} from 'mqtt';
import {
  CommandPayload,
  DeviceStatePayload,
  HeartbeatPayload,
  LastState,
} from './mqtt.types';
import { ActivationLogService } from '../devices/activation-log.service';
import { ActivationAction, ActivationResult } from '@prisma/client';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient | null = null;

  private lastStates = new Map<string, LastState>();
  private autoOffTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly config: ConfigService,
    private readonly activationLog: ActivationLogService,
    private readonly devicesService: DevicesService, // ✅ inyectamos DevicesService
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.clearAllAutoOff();
    if (this.client) {
      this.client.end(true);
      this.client.removeAllListeners();
      this.client = null;
    }
  }

  /** Conectar a EMQX */
  private connect() {
    const host = this.config.get<string>('EMQX_HOST', 'localhost');
    const port = Number(this.config.get<string>('EMQX_PORT', '1883'));
    const username = this.config.get<string>('EMQX_USERNAME');
    const password = this.config.get<string>('EMQX_PASSWORD');
    const clientId = `backend-api_${process.pid}_${Math.random()
      .toString(16)
      .slice(2)}`;

    const opts: IClientOptions = {
      clientId,
      username,
      password,
      keepalive: 30,
      reconnectPeriod: 2000,
      clean: true,
    };

    const url = `mqtt://${host}:${port}`;
    this.logger.log(`MQTT connecting to ${url} as ${clientId}...`);

    this.client = mqtt.connect(url, opts);

    this.client.on('connect', () => {
      this.logger.log('MQTT connected ✔');
      this.subscribeAll();
    });

    this.client.on('reconnect', () => {
      this.logger.warn('MQTT reconnecting…');
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err?.message || err}`);
    });

    this.client.on('close', () => {
      this.logger.warn('MQTT connection closed');
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });
  }

  /** Suscripciones */
  private subscribeAll() {
    if (!this.client) return;

    const subs: Array<[string, { qos: 0 | 1 | 2 }]> = [
      ['status/+/state', { qos: 1 }],
      ['status/+/lwt', { qos: 1 }],
      ['tele/+/heartbeat', { qos: 1 }],
      ['cmd/+/ack', { qos: 1 }],
    ];

    for (const [topic, opts] of subs) {
      this.client.subscribe(
        topic,
        opts,
        (err, granted?: ISubscriptionGrant[]) => {
          if (err) {
            this.logger.error(`Subscribe error on "${topic}": ${err.message}`);
            return;
          }
          const g: ISubscriptionGrant[] = granted ?? [];
          const msg =
            g.length > 0
              ? g.map((gr) => `${gr.topic} (q${gr.qos})`).join(', ')
              : `${topic} (q${opts.qos})`;
          this.logger.log(`Subscribed to ${msg}`);
        },
      );
    }
  }

  /** Manejar mensajes entrantes */
  private handleMessage(topic: string, buf: Buffer) {
    const msg = buf.toString('utf8').trim();
    const [root, deviceId, sub] = topic.split('/');

    try {
      if (root === 'status' && sub === 'state') {
        const data = this.safeJson<DeviceStatePayload>(msg);
        if (!data) return;

        const id = data.deviceId || deviceId;
        if (!id) return;

        const nowIso = new Date().toISOString();
        const state: LastState = {
          deviceId: id,
          online: data.online ?? true,
          relay: data.relay,
          siren: data.siren,
          ip: data.ip,
          updatedAt: data.updatedAt || nowIso,
        };

        this.lastStates.set(id, {
          ...(this.lastStates.get(id) || state),
          ...state,
        });

        this.logger.debug(
          `[state] ${id} → online=${state.online} relay=${state.relay} siren=${state.siren}`,
        );
      }

      if (root === 'status' && sub === 'lwt') {
        const id = deviceId;
        const prev = this.lastStates.get(id);
        const nowIso = new Date().toISOString();
        const offline: LastState = {
          deviceId: id,
          online: false,
          relay: prev?.relay ?? 'OFF',
          siren: prev?.siren ?? 'OFF',
          ip: prev?.ip,
          updatedAt: nowIso,
          lastHeartbeatAt: prev?.lastHeartbeatAt,
        };
        this.lastStates.set(id, offline);
        this.logger.warn(`[lwt] ${id} → offline`);
      }

      if (root === 'tele' && sub === 'heartbeat') {
        const hb = this.safeJson<HeartbeatPayload>(msg) || { deviceId };
        const id = hb.deviceId || deviceId;
        const prev = this.lastStates.get(id);
        const nowIso = hb.ts || new Date().toISOString();

        this.lastStates.set(id, {
          deviceId: id,
          online: prev?.online ?? true,
          relay: prev?.relay ?? 'OFF',
          siren: prev?.siren ?? 'OFF',
          ip: prev?.ip,
          updatedAt: prev?.updatedAt ?? nowIso,
          lastHeartbeatAt: nowIso,
        });

        this.logger.debug(`[heartbeat] ${id} @ ${nowIso}`);
      }

      if (root === 'cmd' && sub === 'ack') {
        this.logger.debug(`[ack] ${deviceId} → ${msg}`);
      }
    } catch (e: any) {
      this.logger.error(`Error handling topic "${topic}": ${e?.message || e}`);
    }
  }

  /** Publicar comando */
  async publishCommand(deviceId: string, payload: CommandPayload) {
    if (!this.client || !this.isConnected())
      throw new Error('MQTT not connected');

    const defaultTtl = this.config.get<number>('DEFAULT_CMD_TTL_MS') ?? 300_000;
    payload.ttlMs = payload.ttlMs ?? defaultTtl;

    const topic = `cmd/${deviceId}/set`;
    const options: IClientPublishOptions = { qos: 1, retain: false };

    this.client.publish(topic, JSON.stringify(payload), options, (err) => {
      if (err) this.logger.error(`Publish error to ${topic}: ${err.message}`);
      else
        this.logger.log(
          `[cmd->set] ${deviceId} action=${payload.action} ttlMs=${payload.ttlMs}`,
        );
    });

    if (payload.action === 'ON') {
      this.scheduleAutoOff(deviceId, payload.ttlMs);
    } else if (payload.action === 'OFF') {
      this.clearAutoOff(deviceId);
    }
  }

  /** Auto-OFF */
  private scheduleAutoOff(deviceId: string, ms: number) {
    this.clearAutoOff(deviceId);
    const timer = setTimeout(async () => {
      this.logger.log(`[auto-off] Ejecutando OFF automático para ${deviceId}`);

      await this.publishCommand(deviceId, {
        commandId: `autooff_${Date.now()}`,
        action: 'OFF',
        ttlMs: 0,
        requestedBy: 'system:auto-off',
        cause: 'auto',
      } as CommandPayload);

      // ✅ Buscar sirenId real en la BD
      const siren = await this.devicesService.findByDeviceId(deviceId);
      if (siren) {
        await this.activationLog.record({
          sirenId: siren.id, // 🔹 usamos UUID correcto
          userId: null,
          action: ActivationAction.OFF,
          result: ActivationResult.ACCEPTED,
          reason: 'AUTO_OFF',
          ip: 'system',
        });
      } else {
        this.logger.error(
          `[auto-off] No se encontró siren para deviceId=${deviceId}`,
        );
      }
    }, ms);

    this.autoOffTimers.set(deviceId, timer);
    this.logger.log(`[auto-off] Programado OFF en ${ms}ms para ${deviceId}`);
  }

  private clearAutoOff(deviceId: string) {
    const t = this.autoOffTimers.get(deviceId);
    if (t) {
      clearTimeout(t);
      this.autoOffTimers.delete(deviceId);
      this.logger.debug(`[auto-off] Cancelado para ${deviceId}`);
    }
  }

  private clearAllAutoOff() {
    for (const t of this.autoOffTimers.values()) clearTimeout(t);
    this.autoOffTimers.clear();
  }

  /** Helpers */
  isConnected(): boolean {
    return !!this.client && this.client.connected === true;
  }

  getClientId(): string | null {
    return (this.client as any)?.options?.clientId ?? null;
  }

  getAllStates(): LastState[] {
    return Array.from(this.lastStates.values()).sort((a, b) =>
      a.deviceId.localeCompare(b.deviceId),
    );
  }

  getState(deviceId: string): LastState | undefined {
    return this.lastStates.get(deviceId);
  }

  private safeJson<T = any>(txt: string): T | null {
    try {
      return JSON.parse(txt) as T;
    } catch {
      return null;
    }
  }
}
