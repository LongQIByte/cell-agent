import { RemoteError, type Device, type JsonRecord, type WireMessage } from '@codex-remote/protocol';
import { RemoteClient, type Connection, type ClientState } from './client';
import { rememberDevices } from './catalog-state';

type Event = Extract<WireMessage, { type: 'event' }>;
type Entry = {
  connection: Connection;
  client: RemoteClient;
  state: ClientState;
  dispose: () => void;
};
type DeviceCache = {
  read: (server: string) => Promise<Device[] | null>;
  write: (server: string, devices: Device[]) => Promise<void>;
};

// Every service keeps its own socket, authentication, retries and native IDs.
// The first service retains legacy IDs; other services have stable scoped IDs,
// so even two copied Agent installations cannot route to the wrong computer.
export class ConnectionHub extends RemoteClient {
  private entries = new Map<string, Entry>();
  private primaryServer = '';
  private running = false;
  private hubStates = new Set<(state: ClientState) => void>();
  private hubEvents = new Set<(event: Event) => void>();
  constructor(
    private factory = (connection: Connection) => new RemoteClient(connection),
    private deviceCache?: DeviceCache,
  ) { super({ server: '', token: '' }); }

  deviceKey(server: string, nativeId: string) {
    return server === this.primaryServer ? nativeId : JSON.stringify([server, nativeId]);
  }
  route(deviceId: string) {
    for (const entry of this.entries.values()) {
      for (const device of entry.state.devices) {
        if (this.deviceKey(entry.connection.server, device.id) === deviceId)
          return { ...entry, deviceId: device.id };
      }
    }
    try {
      const scoped = JSON.parse(deviceId);
      if (Array.isArray(scoped) && scoped.length === 2) {
        const [server, nativeId] = scoped;
        const entry = this.entries.get(server);
        return entry && typeof nativeId === 'string' ? { ...entry, deviceId: nativeId } : null;
      }
    } catch { /* Legacy cached selections use the first service's native ID. */ }
    const entry = this.entries.get(this.primaryServer);
    return entry ? { ...entry, deviceId } : null;
  }
  service(server: string) { return this.entries.get(server); }

  override onState(listener: (state: ClientState) => void) {
    this.hubStates.add(listener);
    listener(this.state);
    return () => { this.hubStates.delete(listener); };
  }
  override onEvent(listener: (event: Event) => void) {
    this.hubEvents.add(listener);
    return () => { this.hubEvents.delete(listener); };
  }
  private emit(event: Event) { for (const listener of this.hubEvents) listener(event); }
  private publish() {
    const entries = [...this.entries.values()];
    const statuses = entries.map((entry) => entry.state.status);
    const status = statuses.includes('connected') ? 'connected'
      : statuses.includes('connecting') ? 'connecting'
      : statuses.includes('reconnecting') ? 'reconnecting'
      : statuses.includes('error') ? 'error' : 'disconnected';
    this.state = {
      status,
      devices: entries.flatMap((entry) => entry.state.devices.map((device) => ({
        ...device, id: this.deviceKey(entry.connection.server, device.id),
        online: entry.state.status === 'connected' && device.online,
      }))),
      ...(status === 'error' ? { error: entries.find((entry) => entry.state.error)?.state.error } : {}),
    };
    for (const listener of this.hubStates) listener(this.state);
    this.emit({ type: 'event', method: 'devices/changed', params: { devices: this.state.devices } });
  }

  configure(connections: Connection[]) {
    this.primaryServer = connections[0]?.server ?? '';
    const servers = new Set(connections.map((connection) => connection.server));
    for (const [server, entry] of this.entries) {
      if (!servers.has(server)) {
        entry.dispose(); entry.client.disconnect(); this.entries.delete(server);
      }
    }
    for (const connection of connections) {
      let entry = this.entries.get(connection.server);
      if (entry && entry.connection.token !== connection.token) {
        entry.dispose(); entry.client.disconnect();
        const devices = entry.state.devices.map((device) => ({ ...device, online: false }));
        entry = this.createEntry(connection, devices);
      } else if (!entry) entry = this.createEntry(connection, []);
      entry.connection = connection;
      if (connection.disabled) entry.client.disconnect();
      else if (this.running) entry.client.connect();
    }
    this.publish();
  }
  private createEntry(connection: Connection, devices: Device[]) {
    const client = this.factory(connection);
    const entry: Entry = { connection, client, state: { status: 'disconnected', devices }, dispose: () => {} };
    this.entries.set(connection.server, entry);
    const offState = client.onState((next) => {
      entry.state = { ...next, devices: rememberDevices(entry.state.devices, next.devices, next.status === 'connected') };
      if (next.status === 'connected') void this.deviceCache?.write(connection.server, entry.state.devices).catch(() => {});
      this.publish();
    });
    const offEvent = client.onEvent((event) => {
      if (event.method === 'devices/changed') return; // The state callback already publishes the combined list.
      this.emit({ ...event, ...(event.deviceId ? { deviceId: this.deviceKey(connection.server, event.deviceId) } : {}) });
    });
    entry.dispose = () => { offState(); offEvent(); };
    void this.deviceCache?.read(connection.server).then((cached) => {
      if (this.entries.get(connection.server) !== entry || !cached) return;
      entry.state = { ...entry.state, devices: rememberDevices(cached, entry.state.devices, entry.state.status === 'connected') };
      this.publish();
    }).catch(() => {});
    return entry;
  }
  override connect() {
    this.running = true;
    for (const entry of this.entries.values()) if (!entry.connection.disabled) entry.client.connect();
  }
  override disconnect() {
    this.running = false;
    for (const entry of this.entries.values()) entry.client.disconnect();
  }
  override async request<T>(method: string, params: JsonRecord = {}, deviceId?: string): Promise<T> {
    const route = deviceId ? this.route(deviceId) : null;
    const entry = deviceId ? route : (this.entries.size === 1 ? [...this.entries.values()][0] : undefined);
    if (!entry) throw new RemoteError('NOT_CONNECTED', '请选择已连接的电脑');
    const result: any = await entry.client.request(method, params, route?.deviceId);
    const scope = (id: string) => this.deviceKey(entry.connection.server, id);
    if (method === 'projects/list') return {
      ...result,
      projects: result.projects.map((project: any) => ({ ...project, deviceId: scope(project.deviceId) })),
      recentSessions: result.recentSessions.map((recent: any) => ({ ...recent, deviceId: scope(recent.deviceId) })),
    } as T;
    if (method === 'projects/create') return { ...result, project: { ...result.project, deviceId: scope(result.project.deviceId) } } as T;
    return result;
  }
}
