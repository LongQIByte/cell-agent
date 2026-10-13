import type { ChatItem, SessionHistory, WireMessage, CodexRequest } from '@codex-remote/protocol';
export function mergeChatItems(older: ChatItem[], newer: ChatItem[]) {
  const values = new Map(older.map((item) => [`${item.turnId}:${item.id}`, item]));
  for (const item of newer) values.set(`${item.turnId}:${item.id}`, item);
  return [...values.values()];
}
export function applySessionEvent(
  state: SessionHistory,
  event: Extract<WireMessage, { type: 'event' }>,
): SessionHistory {
  const p = event.params as any;
  if (
    p.threadId !== state.session.id ||
    (typeof p.sequence === 'number' && p.sequence <= state.sequence)
  )
    return state;
  const next = { ...state, sequence: p.sequence ?? state.sequence };
  if (event.method === 'session/item') {
    const item = p.item as ChatItem;
    // An acknowledged native user item replaces a matching optimistic item.
    next.items = mergeChatItems(
      state.items.filter(
        (i) => !(i.id.startsWith('pending-') && item.clientId && i.clientId === item.clientId),
      ),
      [item],
    );
  } else if (event.method === 'session/delta') {
    const existing = state.items.find((i) => i.id === p.itemId && i.turnId === p.turnId);
    const item: ChatItem = existing ?? {
      id: p.itemId,
      turnId: p.turnId,
      kind: p.kind,
      text: '',
      timestamp: Date.now(),
      status: 'inProgress',
    };
    const field = p.field === 'details' ? 'details' : 'text';
    next.items = mergeChatItems(state.items, [
      { ...item, [field]: p.value ?? (item[field] ?? '') + p.delta },
    ]);
  } else if (event.method === 'session/status') {
    next.activeTurnId = p.status === 'inProgress' ? p.turnId : null;
    if (p.status !== 'inProgress')
      next.items = state.items.map((i) =>
        i.turnId === p.turnId && i.status === 'inProgress' ? { ...i, status: p.status } : i,
      );
  } else if (event.method === 'session/settings') {
    next.model = p.model;
    next.reasoningEffort = p.reasoningEffort;
    next.permissions = p.permissions;
    next.permissionsUnavailableReason = p.permissionsUnavailableReason;
  } else if (event.method === 'session/outbox') {
    next.outbox = p.outbox;
  } else if (event.method === 'session/metrics') {
    next.metrics = p.metrics;
  } else if (event.method === 'session/goal') {
    next.goal = p.goal;
  } else if (event.method === 'session/name') {
    next.session = { ...state.session, name: p.name };
  } else if (event.method === 'session/mode') {
    next.mode = p.mode;
  } else if (event.method === 'session/request') {
    next.requests = [
      ...state.requests.filter((r) => r.id !== p.request.id),
      p.request as CodexRequest,
    ];
  } else if (event.method === 'session/requestResolved')
    next.requests = state.requests.filter((r) => r.id !== p.requestId);
  return next;
}
