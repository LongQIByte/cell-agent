import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_WIRE_BYTES = 12 * 1024 * 1024;
export type JsonRecord = Record<string, unknown>;
export interface Device {
  id: string;
  name: string;
  platform: string;
  online: boolean;
  lastSeen: number;
}
export interface Session {
  id: string;
  projectId: string;
  name: string;
  updatedAt: number;
  status: string;
}
export interface Project {
  id: string;
  deviceId: string;
  name: string;
  path: string;
  available: boolean;
  updatedAt: number;
  sessions: Session[];
}
export type ItemKind = 'user' | 'assistant' | 'command' | 'file' | 'activity' | 'error';
export interface ChatItem {
  id: string;
  turnId: string;
  kind: ItemKind;
  text: string;
  details?: string;
  status?: string;
  timestamp: number;
  attachments?: string[];
  clientId?: string;
}
export interface CodexRequest {
  id: string;
  method: string;
  params: JsonRecord;
  createdAt: number;
}
export interface SessionHistory {
  session: Session;
  items: ChatItem[];
  nextCursor: string | null;
  activeTurnId: string | null;
  requests: CodexRequest[];
  sequence: number;
}
export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}
export interface RpcError {
  code: string;
  message: string;
}
export type WireMessage =
  | {
      type: 'hello';
      role: 'mobile' | 'agent';
      token: string;
      version: number;
      device?: Pick<Device, 'id' | 'name' | 'platform'>;
    }
  | { type: 'ready'; version: number; devices: Device[] }
  | { type: 'request'; id: string; method: string; deviceId?: string; params: JsonRecord }
  | { type: 'response'; id: string; result?: unknown; error?: RpcError }
  | { type: 'event'; method: string; deviceId?: string; params: JsonRecord };

export const helloSchema = z.object({
  type: z.literal('hello'),
  role: z.enum(['mobile', 'agent']),
  token: z.string().min(16).max(256),
  version: z.literal(PROTOCOL_VERSION),
  device: z
    .object({
      id: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9_-]+$/),
      name: z.string().trim().min(1).max(80),
      platform: z.string().max(40),
    })
    .optional(),
});
export const requestSchema = z.object({
  type: z.literal('request'),
  id: z.string().min(1).max(150),
  method: z.string().min(1).max(100),
  deviceId: z.string().max(100).optional(),
  params: z.record(z.unknown()).default({}),
});
export const idSchema = z.string().min(1).max(150);
export class RemoteError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}
export function errorPayload(error: unknown): RpcError {
  if (error instanceof RemoteError) return { code: error.code, message: error.message };
  if (error instanceof z.ZodError)
    return {
      code: 'INVALID_PARAMS',
      message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  return { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '请求失败' };
}
