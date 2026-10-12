export function sessionPinKey(deviceId: string, sessionId: string) {
  return `${deviceId}:${sessionId}`;
}

export function normalizeSessionPins(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string' && key.length > 0) : []);
}
