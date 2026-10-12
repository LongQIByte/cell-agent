import { useCallback, useEffect, useRef, useState } from 'react';
import { readCache, saveCache } from './storage';
import { normalizeSessionPins, sessionPinKey } from './session-pins';

const emptyPins = new Set<string>();
type PinState = { server: string; pins: Set<string>; ready: boolean };

export function useSessionPins(server: string) {
  const [state, setState] = useState<PinState>({ server, pins: emptyPins, ready: false });
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const activeServer = useRef(server);
  activeServer.current = server;
  const pendingSave = useRef(Promise.resolve());
  const saveGeneration = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let current = true;
    setState({ server, pins: emptyPins, ready: false });
    setError('');
    void readCache<unknown>(`session-pins:${server}`).then((saved) => {
      if (current && activeServer.current === server)
        setState({ server, pins: normalizeSessionPins(saved), ready: true });
    }).catch(() => {
      if (current && activeServer.current === server) setError('读取置顶设置失败，请重试。');
    });
    return () => { current = false; };
  }, [server, attempt]);
  useEffect(() => {
    if (!state.ready || state.server !== server) return;
    const generation = ++saveGeneration.current;
    const pins = [...state.pins];
    const report = (message: string) => {
      if (alive.current && activeServer.current === server && saveGeneration.current === generation) setError(message);
    };
    pendingSave.current = pendingSave.current
      .then(() => saveCache(`session-pins:${server}`, pins))
      .then(() => report(''))
      .catch(() => report('置顶设置保存失败，请重试。'));
  }, [server, state.pins, state.ready, state.server]);
  const togglePin = useCallback((deviceId: string, sessionId: string) => {
    setState((previous) => {
      if (previous.server !== server || !previous.ready) return previous;
      const pins = new Set(previous.pins);
      const key = sessionPinKey(deviceId, sessionId);
      if (pins.has(key)) pins.delete(key);
      else pins.add(key);
      return { ...previous, pins };
    });
  }, [server]);
  const retry = useCallback(() => {
    if (state.server === server && state.ready) setState((previous) => ({ ...previous, pins: new Set(previous.pins) }));
    else setAttempt((previous) => previous + 1);
  }, [server, state.server, state.ready]);
  return {
    pins: state.server === server ? state.pins : emptyPins,
    ready: state.server === server && state.ready,
    error: state.server === server ? error : '',
    togglePin,
    retry,
  };
}
