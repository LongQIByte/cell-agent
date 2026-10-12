import { z } from 'zod';
import {
  RemoteError,
  type ApprovalPolicy,
  type PermissionMode,
  type SandboxPolicy,
  type SessionPermissions,
} from '@codex-remote/protocol';

const approvalSchema = z.union([
  z.enum(['untrusted', 'on-request', 'never']),
  z.object({ granular: z.object({
    sandbox_approval: z.boolean(), rules: z.boolean(), skill_approval: z.boolean(),
    request_permissions: z.boolean(), mcp_elicitations: z.boolean(),
  }) }),
]);
const sandboxSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dangerFullAccess') }),
  z.object({ type: z.literal('readOnly'), networkAccess: z.boolean() }),
  z.object({ type: z.literal('externalSandbox'), networkAccess: z.enum(['restricted', 'enabled']) }),
  z.object({
    type: z.literal('workspaceWrite'), writableRoots: z.array(z.string()),
    networkAccess: z.boolean(), excludeTmpdirEnvVar: z.boolean(), excludeSlashTmp: z.boolean(),
  }),
]);
const settingsSchema = z.object({
  model: z.string().min(1),
  effort: z.string().nullable(),
  approvalPolicy: approvalSchema,
  sandboxPolicy: sandboxSchema,
  approvalsReviewer: z.enum(['user', 'auto_review', 'guardian_subagent']),
  activePermissionProfile: z.object({ id: z.string(), extends: z.string().nullable() }).nullable(),
});

export interface SessionSettings {
  model: string;
  reasoningEffort: string | null;
  permissions: SessionPermissions;
}

export function settingsFromNotification(raw: unknown): SessionSettings {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success)
    throw new RemoteError('CODEX_UNSUPPORTED_API', '当前 Codex 未提供完整会话配置，请配置新版 CODEX_BIN');
  const settings = parsed.data;
  const sandbox = settings.sandboxPolicy;
  let mode: PermissionMode | null = null;
  // Named profiles may carry additional restrictions beyond the legacy policy
  // projection. Preserve their identity as custom rather than claiming a preset.
  if (settings.approvalsReviewer === 'user' && settings.activePermissionProfile === null) {
    if (sandbox.type === 'dangerFullAccess' && settings.approvalPolicy === 'never') mode = 'full-access';
    if (sandbox.type === 'workspaceWrite' && settings.approvalPolicy === 'on-request' &&
        !sandbox.networkAccess && !sandbox.excludeTmpdirEnvVar && !sandbox.excludeSlashTmp) mode = 'approval';
  }
  return {
    model: settings.model,
    reasoningEffort: settings.effort,
    permissions: {
      mode,
      approvalPolicy: settings.approvalPolicy,
      sandboxPolicy: sandbox,
      approvalsReviewer: settings.approvalsReviewer,
      profile: settings.activePermissionProfile,
    },
  };
}

export function settingsFromResume(raw: any): SessionSettings {
  return settingsFromNotification({
    model: raw.model,
    effort: raw.reasoningEffort,
    approvalPolicy: raw.approvalPolicy,
    sandboxPolicy: raw.sandbox,
    approvalsReviewer: raw.approvalsReviewer,
    activePermissionProfile: raw.activePermissionProfile,
  });
}

export function permissionPreset(mode: PermissionMode, roots: string[]): {
  approvalPolicy: ApprovalPolicy;
  sandboxPolicy: SandboxPolicy;
  approvalsReviewer: 'user';
} {
  if (mode === 'approval' && !z.array(z.string()).safeParse(roots).success)
    throw new RemoteError('CODEX_UNSUPPORTED_API', '当前 Codex 未提供会话工作区范围，请配置新版 CODEX_BIN');
  return mode === 'full-access'
    ? { approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' }, approvalsReviewer: 'user' }
    : {
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandboxPolicy: {
          type: 'workspaceWrite', writableRoots: [...roots], networkAccess: false,
          excludeTmpdirEnvVar: false, excludeSlashTmp: false,
        },
      };
}
