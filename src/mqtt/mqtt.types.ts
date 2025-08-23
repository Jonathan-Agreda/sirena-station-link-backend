// src/mqtt/mqtt.types.ts
export type OnOff = 'ON' | 'OFF';

export interface DeviceStatePayload {
  deviceId: string;
  online: boolean;
  relay: OnOff;
  siren: OnOff;
  ip?: string;
  updatedAt?: string; // ISO string
}

export interface HeartbeatPayload {
  deviceId: string;
  ts?: string; // ISO string opcional
}

export interface CommandPayload {
  commandId: string;
  action: OnOff;
  ttlMs: number; // p.ej. 300000 (5 min)
  requestedBy: string; // userId o email
  cause?: 'manual' | 'auto';
}

export interface LastState {
  deviceId: string;
  online: boolean;
  relay: OnOff;
  siren: OnOff;
  ip?: string;
  updatedAt: string; // ISO
  lastHeartbeatAt?: string; // ISO
}
