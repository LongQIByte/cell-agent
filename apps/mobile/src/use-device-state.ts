import { useCallback, useEffect, useRef, useState } from 'react';
import type { Device } from '@codex-remote/protocol';
import type { ClientState } from './client';
import { rememberDevices } from './catalog-state';
import { readCache, saveCache } from './storage';

const disconnected = (): ClientState => ({ status: 'disconnected', devices: [] });

// A computer is known as soon as the relay confirms it, independently of catalog reads.
export function useDeviceState(server: string | undefined) {
  const [state, setState] = useState<ClientState>(disconnected);
  const current = useRef({ server, state });
  const key = `known-computers:${server ?? 'none'}`;
  useEffect(() => {
    const snapshot = { server, state: disconnected() };
    current.current = snapshot;
    setState(snapshot.state);
    if (!server) return;
    void readCache<Device[]>(key).then((saved) => {
      if (current.current !== snapshot) return;
      snapshot.state = {
        ...snapshot.state,
        devices: rememberDevices(saved ?? [], snapshot.state.devices, snapshot.state.status === 'connected'),
      };
      setState(snapshot.state);
      if (snapshot.state.status === 'connected' && snapshot.state.devices.length)
        void saveCache(key, snapshot.state.devices).catch(() => {});
    }).catch(() => {});
  }, [server, key]);

  const update = useCallback((next: ClientState) => {
    if (current.current.server !== server) return;
    const value = {
      ...next,
      devices: rememberDevices(current.current.state.devices, next.devices, next.status === 'connected'),
    };
    current.current.state = value;
    setState(value);
    if (server && next.status === 'connected' && value.devices.length)
      void saveCache(key, value.devices).catch(() => {});
  }, [server, key]);
  return [state, update] as const;
}
