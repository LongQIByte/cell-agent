import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Project, Session } from '@codex-remote/protocol';
import { RemoteClient, websocketUrl, type Connection, type ClientState } from './client';
import { loadConnection, saveConnection, clearConnection, readCache, saveCache } from './storage';
import { Projects } from './Projects';
import { Settings } from './Settings';
import { Chat } from './Chat';
import { NewProject } from './NewProject';
import { Icon } from './icons';
import { palette } from './ui';

type Selected = { project: Project; session: Session };
function useViewportHeight() {
  const dimensions = useWindowDimensions();
  const [visualHeight, setVisualHeight] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => setVisualHeight(viewport.height);
    viewport.addEventListener('resize', update);
    update();
    return () => viewport.removeEventListener('resize', update);
  }, []);
  return visualHeight ?? dimensions.height;
}
function Main() {
  const height = useViewportHeight();
  const [booted, setBooted] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [tab, setTab] = useState<'projects' | 'settings'>('projects');
  const [state, setState] = useState<ClientState>({ status: 'disconnected', devices: [] });
  const [projects, setProjects] = useState<Project[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const client = useMemo(
    () => (connection ? new RemoteClient(connection) : null),
    [connection?.server, connection?.token],
  );
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshInProgress = useRef(false);
  const currentClient = useRef(client);
  currentClient.current = client;
  const cacheKey = `catalog:${connection?.server ?? 'none'}`;
  async function applyPairingLink(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    const params = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const server = params.get('server') ?? parsed.searchParams.get('server');
    const token = params.get('key') ?? parsed.searchParams.get('key');
    if (!server || !token || token.length < 16) return false;
    const value = { server: websocketUrl(server), token };
    await saveConnection(value);
    setConnection(value);
    if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);
    return true;
  }
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const url = Platform.OS === 'web' ? window.location.href : await Linking.getInitialURL();
        if (!url || !(await applyPairingLink(url))) {
          const saved = await loadConnection();
          if (alive) setConnection(saved);
        }
        if (Platform.OS === 'web' && window.history.state?.selected && alive)
          setSelected(window.history.state.selected);
      } catch {
        /* A missing persisted connection should still open Projects. */
      } finally {
        if (alive) setBooted(true);
      }
    })();
    const subscription = Linking.addEventListener('url', (event) => {
      void applyPairingLink(event.url).catch(() => {});
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  const refresh = useCallback(async () => {
    const target = client;
    if (!target || target.state.status !== 'connected' || refreshInProgress.current) return;
    refreshInProgress.current = true;
    setRefreshing(true);
    setError('');
    const online = target.state.devices.filter((d) => d.online);
    try {
      const results = await Promise.allSettled(
        online.map((device) =>
          target.request<{ projects: Project[] }>('projects/list', {}, device.id),
        ),
      );
      if (currentClient.current !== target) return;
      const succeeded = new Set<string>();
      const incoming: Project[] = [];
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          succeeded.add(online[index].id);
          incoming.push(...result.value.projects);
        } else errors.push(`${online[index].name}：${result.reason?.message ?? '读取失败'}`);
      });
      setProjects((previous) => {
        const next = [...previous.filter((p) => !succeeded.has(p.deviceId)), ...incoming];
        void saveCache(cacheKey, { projects: next, devices: target.state.devices }).catch(() => {});
        return next;
      });
      setError(errors.join('\n'));
    } finally {
      if (currentClient.current === target) {
        refreshInProgress.current = false;
        setRefreshing(false);
      }
    }
  }, [client, cacheKey]);
  useEffect(() => {
    let alive = true;
    setProjects([]);
    setError('');
    refreshInProgress.current = false;
    void readCache<{ projects: Project[]; devices: ClientState['devices'] }>(cacheKey)
      .then((cached) => {
        if (alive && cached) {
          setProjects((previous) => (previous.length ? previous : cached.projects));
          if (!client || client.state.status !== 'connected')
            setState((previous) => ({
              ...previous,
              devices: cached.devices.map((d) => ({ ...d, online: false })),
            }));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cacheKey]);
  useEffect(() => {
    if (!client) {
      setState({ status: 'disconnected', devices: [] });
      return;
    }
    const offState = client.onState((next) => {
      setState(next);
      if (next.status === 'connected') void refresh();
    });
    const offEvents = client.onEvent((event) => {
      if (event.method === 'catalog/changed' || event.method === 'devices/changed') {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void refresh(), 350);
      }
    });
    client.connect();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        client.connect();
        void refresh();
      }
    });
    return () => {
      offState();
      offEvents();
      subscription.remove();
      clearTimeout(refreshTimer.current);
      client.disconnect();
    };
  }, [client, refresh]);
  useEffect(() => {
    if (selected) return;
    const timer = setInterval(() => void refresh(), 20000);
    return () => clearInterval(timer);
  }, [selected, refresh]);
  const goBack = useCallback(() => {
    if (Platform.OS === 'web' && window.history.state?.selected) window.history.back();
    else setSelected(null);
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const pop = (event: PopStateEvent) => setSelected(event.state?.selected ?? null);
      const key = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && selected && !newProject) goBack();
      };
      window.addEventListener('popstate', pop);
      window.addEventListener('keydown', key);
      return () => {
        window.removeEventListener('popstate', pop);
        window.removeEventListener('keydown', key);
      };
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selected) {
        setSelected(null);
        return true;
      }
      if (tab === 'settings') {
        setTab('projects');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [selected, tab, goBack, newProject]);
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Platform.OS === 'ios' &&
          !!selected &&
          gesture.x0 < 24 &&
          gesture.dx > 24 &&
          Math.abs(gesture.dy) < 35,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 85) goBack();
        },
      }),
    [selected, goBack],
  );
  function open(project: Project, session: Session) {
    const value = { project, session };
    setSelected(value);
    if (Platform.OS === 'web')
      window.history.pushState(
        { selected: value },
        '',
        `#session=${encodeURIComponent(session.id)}`,
      );
  }
  async function createSession(project: Project) {
    if (!client || creatingId) return;
    setCreatingId(`${project.deviceId}:${project.id}`);
    setError('');
    try {
      const { session } = await client.request<{ session: Session }>(
        'sessions/create',
        { projectId: project.id },
        project.deviceId,
      );
      open(project, session);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingId(null);
    }
  }
  if (!booted)
    return (
      <View style={[styles.root, { height, justifyContent: 'center' }]}>
        <ActivityIndicator color={palette.ink} />
      </View>
    );
  return (
    <View style={[styles.root, { height }]}>
      <StatusBar style="dark" backgroundColor="white" />
      {selected ? (
        <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }} {...swipe.panHandlers}>
          <Chat
            key={`${connection?.server}:${selected.project.deviceId}:${selected.session.id}`}
            project={selected.project}
            session={selected.session}
            client={client}
            clientState={state}
            server={connection?.server ?? ''}
          />
        </SafeAreaView>
      ) : (
        <SafeAreaView style={{ flex: 1 }}>
          {tab === 'projects' ? (
            <Projects
              projects={projects}
              state={state}
              refreshing={refreshing}
              error={error}
              creatingId={creatingId}
              onRefresh={refresh}
              onSettings={() => setTab('settings')}
              onCreateProject={() => {
                if (!client || !state.devices.some((d) => d.online)) setTab('settings');
                else setNewProject(true);
              }}
              onCreateSession={createSession}
              onOpen={open}
            />
          ) : (
            <Settings
              key={`${connection?.server}:${connection?.token}`}
              connection={connection}
              state={state}
              client={client}
              onSave={async (value) => {
                await saveConnection(value);
                if (connection?.server === value.server && connection?.token === value.token)
                  client?.connect();
                else setConnection(value);
              }}
              onDisconnect={() => {
                client?.disconnect();
                void clearConnection().catch(() => {});
                setConnection(null);
              }}
            />
          )}
          <View style={styles.tabs} testID="bottom-tabs">
            {(['projects', 'settings'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityLabel={value === 'projects' ? 'Projects' : 'Settings'}
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                style={styles.tab}
              >
                <Icon name={value} size={20} color={tab === value ? palette.ink : '#aaa'} />
                <Text style={[styles.tabText, tab === value && { color: palette.ink }]}>
                  {value === 'projects' ? 'Projects' : 'Settings'}
                </Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      )}
      {newProject && client && (
        <NewProject
          devices={state.devices}
          client={client}
          onClose={() => setNewProject(false)}
          onCreated={() => {
            setNewProject(false);
            void refresh();
          }}
        />
      )}
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { backgroundColor: 'white', width: '100%', flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e8e8',
    minHeight: 66,
    backgroundColor: 'white',
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 11, gap: 5 },
  tabText: { color: '#aaa', fontSize: 11 },
});
