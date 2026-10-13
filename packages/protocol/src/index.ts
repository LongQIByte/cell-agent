import { z } from 'zod';

export const PROTOCOL_VERSION = 2;
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
  projectId: string | null;
  cwd: string;
  name: string;
  updatedAt: number;
  status: string;
  forkedFromId?: string | null;
}
export interface RecentSession {
  deviceId: string;
  session: Session;
}
export interface Model {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
}
export type PermissionMode = 'full-access' | 'approval';
export type ApprovalPolicy = 'untrusted' | 'on-request' | 'never' | {
  granular: {
    sandbox_approval: boolean;
    rules: boolean;
    skill_approval: boolean;
    request_permissions: boolean;
    mcp_elicitations: boolean;
  };
};
export type SandboxPolicy =
  | { type: 'dangerFullAccess' }
  | { type: 'readOnly'; networkAccess: boolean }
  | { type: 'externalSandbox'; networkAccess: 'restricted' | 'enabled' }
  | {
      type: 'workspaceWrite';
      writableRoots: string[];
      networkAccess: boolean;
      excludeTmpdirEnvVar: boolean;
      excludeSlashTmp: boolean;
    };
export interface SessionPermissions {
  mode: PermissionMode | null;
  approvalPolicy: ApprovalPolicy;
  sandboxPolicy: SandboxPolicy;
  approvalsReviewer: 'user' | 'auto_review' | 'guardian_subagent';
  profile: { id: string; extends: string | null } | null;
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
  images?: { source: string; name: string }[];
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
  model: string | null;
  reasoningEffort: string | null;
  permissions: SessionPermissions | null;
  permissionsUnavailableReason?: string;
  items: ChatItem[];
  nextCursor: string | null;
  activeTurnId: string | null;
  requests: CodexRequest[];
  sequence: number;
  mode?: 'default' | 'plan';
  goal?: SessionGoal | null;
  capabilities?: SessionCapabilities;
  metrics?: RunMetrics | null;
}
export interface SessionGoal {
  threadId: string;
  objective: string;
  status: 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete';
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}
export interface SessionCapabilities {
  plan: boolean;
  goal: boolean;
  goalBudget: boolean;
  planReason?: string;
  goalReason?: string;
}
export interface TokenUsage {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}
export interface RunMetrics {
  turnId: string;
  status: 'waiting' | 'generating' | 'tool' | 'confirmation' | 'completed' | 'stopped' | 'failed';
  startedAt: number;
  endedAt: number | null;
  firstOutputAt: number | null;
  lastOutputAt: number | null;
  assistantCharacters: number;
  contextUsed: number | null;
  contextWindow: number | null;
  usage: TokenUsage | null;
}
export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  previewUri?: string;
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
