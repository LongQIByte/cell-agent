import test from 'node:test';
import assert from 'node:assert/strict';
import type { Model, SessionHistory, SessionPermissions, WireMessage } from '@codex-remote/protocol';
import { applySessionEvent } from '../apps/mobile/src/session-state.js';
import { selectTurnModel, sessionTurnSettings, turnSettingsParams } from '../apps/mobile/src/turn-settings.js';

const customPermissions: SessionPermissions = {
  mode: null,
  approvalPolicy: 'on-request',
  sandboxPolicy: { type: 'readOnly', networkAccess: false },
  approvalsReviewer: 'user',
  profile: { id: 'read-only', extends: null },
};
const history: SessionHistory = {
    session: {
      id: 'chat',
      projectId: null,
      cwd: '/workspace',
      name: 'Chat',
      updatedAt: 0,
      status: 'idle',
    },
    model: 'model-a',
    reasoningEffort: 'high',
    permissions: customPermissions,
    items: [
      {
        id: 'answer',
        turnId: 'turn',
        kind: 'assistant',
        text: '# Answer\n\n**Ready**',
        timestamp: 0,
      },
    ],
    requests: [],
    activeTurnId: null,
    nextCursor: null,
    sequence: 4,
  };

test('canonical settings updates preserve custom policies and reject stale or other-session events', () => {
  const event: Extract<WireMessage, { type: 'event' }> = {
    type: 'event',
    method: 'session/settings',
    params: {
      threadId: 'chat',
      model: 'model-b',
      reasoningEffort: 'low',
      permissions: customPermissions,
      sequence: 5,
    },
  };
  const updated = applySessionEvent(history, event);
  assert.equal(updated.model, 'model-b');
  assert.equal(updated.reasoningEffort, 'low');
  assert.equal(updated.permissions, customPermissions);
  assert.equal(updated.sequence, 5);
  assert.equal(updated.items, history.items);
  assert.equal(
    applySessionEvent(updated, {
      ...event,
      params: { ...event.params, model: 'model-a', sequence: 4 },
    }),
    updated,
  );
  assert.equal(
    applySessionEvent(updated, {
      ...event,
      params: { ...event.params, threadId: 'other', sequence: 6 },
    }),
    updated,
  );
});

test('switching models retains supported effort and uses the new native default for unsupported effort', () => {
  const model: Model = {
    id: 'model-b',
    model: 'model-b',
    displayName: 'Model B',
    description: '',
    isDefault: false,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: '' },
      { reasoningEffort: 'medium', description: '' },
    ],
  };
  assert.deepEqual(selectTurnModel(sessionTurnSettings(history, null), model), {
    model: 'model-b', effort: 'low',
  });
  assert.deepEqual(selectTurnModel({ model: 'model-a', effort: 'medium', permissionMode: 'full-access' }, model), {
    model: 'model-b', effort: 'medium',
  });
  assert.deepEqual(selectTurnModel(sessionTurnSettings(history, null), { ...model, supportedReasoningEfforts: [] }), {
    model: 'model-b', effort: null,
  });
});

test('pending model and effort never elevate a newly restricted canonical permission policy', () => {
  const pending = { model: 'model-b', effort: 'low' };
  const fullAccess: SessionPermissions = {
    mode: 'full-access',
    approvalPolicy: 'never',
    sandboxPolicy: { type: 'dangerFullAccess' },
    approvalsReviewer: 'user',
    profile: null,
  };
  assert.equal(sessionTurnSettings({ ...history, permissions: fullAccess }, pending).permissionMode, 'full-access');
  assert.equal(sessionTurnSettings(history, pending).permissionMode, null);
  assert.deepEqual(turnSettingsParams(history, pending), { model: 'model-b', effort: 'low' });
  assert.equal(history.permissions, customPermissions);
  assert.deepEqual(turnSettingsParams(history, { ...pending, permissionMode: 'approval' }), {
    model: 'model-b', effort: 'low', permissionMode: 'approval',
  });
  assert.deepEqual(turnSettingsParams(history, { model: 'model-b', effort: null }), { model: 'model-b' });
  assert.equal(sessionTurnSettings({ ...history, permissions: null }, null).permissionMode, null);
});
