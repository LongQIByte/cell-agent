import type { Model, PermissionMode, SessionHistory, SessionPermissions } from '@codex-remote/protocol';

// Only explicit edits are stored. Changing a model must not restore an older
// permission policy over a newer policy selected on the computer.
export interface TurnOverrides {
  mode?: 'default' | 'plan';
  model?: string;
  effort?: string | null;
  permissionMode?: PermissionMode;
}

export interface TurnSelection {
  model: string | null;
  effort: string | null;
  permissionMode: PermissionMode | null;
}

export function sessionTurnSettings(
  history: SessionHistory,
  pending: TurnOverrides | null,
): TurnSelection {
  return {
    model: pending?.model ?? history.model,
    effort: pending && 'effort' in pending ? pending.effort ?? null : history.reasoningEffort,
    permissionMode: pending?.permissionMode ?? history.permissions?.mode ?? null,
  };
}

export function selectTurnModel(current: TurnSelection, model: Model): TurnOverrides {
  const supported = model.supportedReasoningEfforts;
  return {
    model: model.model,
    effort: supported.length
      ? supported.some((option) => option.reasoningEffort === current.effort)
        ? current.effort
        : model.defaultReasoningEffort
      : null,
  };
}

export function turnSettingsParams(history: SessionHistory, pending: TurnOverrides | null) {
  const selected = sessionTurnSettings(history, pending);
  return {
    ...(selected.model ? { model: selected.model } : {}),
    ...(selected.effort ? { effort: selected.effort } : {}),
    ...(pending?.permissionMode ? { permissionMode: pending.permissionMode } : {}),
    ...(pending?.mode ? { mode: pending.mode } : {}),
  };
}

export function sameTurnOverrides(a: TurnOverrides | null, b: TurnOverrides | null) {
  return (
    a?.model === b?.model &&
    a?.effort === b?.effort &&
    a?.permissionMode === b?.permissionMode
    && a?.mode === b?.mode
  );
}

const effortLabels: Record<string, string> = {
  none: '无',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '最高',
  max: '最大',
};
export const reasoningLabel = (effort: string) => effortLabels[effort] ?? effort;

export const permissionOptions: { mode: PermissionMode; label: string; description: string }[] = [
  {
    mode: 'full-access',
    label: '完全访问',
    description: '允许访问文件、运行命令和使用网络，无需逐次审批。',
  },
  {
    mode: 'approval',
    label: '需要审批',
    description: '允许读写当前工作目录；目录之外的写入和网络访问可能需要你批准。',
  },
];

export function permissionLabel(mode: PermissionMode | null) {
  return permissionOptions.find((option) => option.mode === mode)?.label ?? '自定义';
}

export function customPermissionsDescription(permissions: SessionPermissions) {
  const sandbox = permissions.sandboxPolicy;
  const access = {
    dangerFullAccess: '文件与命令完全访问',
    workspaceWrite: '允许读写工作目录，其他写入受沙箱限制',
    readOnly: '文件只读',
    externalSandbox: '访问范围由外部沙箱控制',
  }[sandbox.type];
  const network =
    sandbox.type === 'dangerFullAccess' ||
    (sandbox.type === 'externalSandbox' ? sandbox.networkAccess === 'enabled' : sandbox.networkAccess)
      ? '网络已允许'
      : '网络受限制';
  const approval = permissions.approvalPolicy;
  const review =
    typeof approval === 'object'
      ? '按此会话的细分审批规则执行'
      : {
          never: '不发起审批请求',
          'on-request': 'Codex 可发起审批请求',
          untrusted: '不受信任的操作需要审批',
        }[approval];
  const reviewer =
    permissions.approvalsReviewer === 'user' ? '由你处理审批' : '由电脑的自动审批配置处理';
  return [access, network, review, reviewer, permissions.profile?.id].filter(Boolean).join('；');
}
