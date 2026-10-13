import type { RunMetrics, TokenUsage } from '@codex-remote/protocol';

export interface MetricsSnapshot {
  metrics: RunMetrics;
  total: TokenUsage | null;
  baseline: TokenUsage | null;
  texts: Record<string, string>;
}
export function beginMetrics(turnId: string, previous?: MetricsSnapshot | null, now = Date.now()): MetricsSnapshot {
  return { total: previous?.total ?? null, baseline: previous?.total ?? null, texts: {}, metrics: {
    turnId, status: 'waiting', startedAt: now, endedAt: null, firstOutputAt: null,
    lastOutputAt: null, assistantCharacters: 0,
    contextUsed: previous?.metrics.contextUsed ?? null, contextWindow: previous?.metrics.contextWindow ?? null,
    usage: null,
  } };
}
export function assistantOutput(snapshot: MetricsSnapshot, itemId: string, text: string, now = Date.now()) {
  const previous = snapshot.texts[itemId] ?? '';
  if (previous === text) return;
  snapshot.texts[itemId] = text;
  snapshot.metrics.assistantCharacters = Object.values(snapshot.texts).reduce((sum, value) => sum + Array.from(value).length, 0);
  snapshot.metrics.firstOutputAt ??= now;
  snapshot.metrics.lastOutputAt = now;
  if (!snapshot.metrics.endedAt) snapshot.metrics.status = 'generating';
}
export function updateTokenUsage(snapshot: MetricsSnapshot, value: { total: TokenUsage; last: TokenUsage; modelContextWindow: number | null }) {
  // `last` is the latest model request, not the cumulative session counter.
  snapshot.metrics.contextUsed = value.last.totalTokens;
  snapshot.metrics.contextWindow = value.modelContextWindow;
  if (snapshot.baseline) {
    snapshot.metrics.usage = Object.fromEntries(Object.keys(value.total).map((key) => [key,
      Math.max(0, value.total[key as keyof TokenUsage] - (snapshot.baseline![key as keyof TokenUsage] ?? 0)),
    ])) as unknown as TokenUsage;
  } else {
    // A fresh thread's first event is also its baseline; a resumed thread with
    // no earlier telemetry must not label all historical tokens as this turn.
    snapshot.metrics.usage = null;
  }
  snapshot.total = value.total;
}
