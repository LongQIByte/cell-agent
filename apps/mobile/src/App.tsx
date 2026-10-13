import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Dimensions,
  Keyboard,
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
import type { Project, RecentSession, Session } from '@codex-remote/protocol';
import { RemoteClient, websocketUrl, type Connection } from './client';
import { loadConnection, saveConnection, clearConnection, readCache, saveCache } from './storage';
import { Projects } from './Projects';
import { Settings } from './Settings';
import { Chat } from './Chat';
import { NewProject } from './NewProject';
import { Icon } from './icons';
import { UIProvider, useUI, useThemedStyles, type Palette } from './ui';
import { SplitLayout } from './SplitLayout';
import { mergeProjects, mergeRecentSessions } from './catalog-state';
import { horizontalBackSwipe } from './navigation-gesture';
import { useDeviceState } from './use-device-state';

type Selected = { deviceId: string; project: Project | null; session: Session };
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
  const { palette, scheme } = useUI();
  const styles = useThemedStyles(createStyles);
  const height = useViewportHeight();
  const dimensions = useWindowDimensions();
  const screen = Dimensions.get('screen');
  const canSplit = dimensions.width >= 600 &&
    (Platform.OS === 'web' || Math.min(screen.width, screen.height) >= 600);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [tab, setTab] = useState<'projects' | 'settings'>('projects');
  const [state, setState] = useDeviceState(connection?.server);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [archived, setArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const collapseLoaded = useRef(false);
  const pendingCollapse = useRef(new Map<string, boolean>());
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Selected | null>(null);
  useEffect(() => { Keyboard.dismiss(); }, [selected?.session.id, tab]);
  const [newProject, setNewProject] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const client = useMemo(
    () => (connection ? new RemoteClient(connection) : null),
    [connection?.server, connection?.token],
  );
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshInProgress = useRef(false);
  const refreshAgain = useRef(false);
  const catalogLoaded = useRef(false);
  const currentClient = useRef(client);
  currentClient.current = client;
  const cacheKey = `native-catalog:${connection?.server ?? 'none'}:${archived ? 'archived' : 'active'}`;
  const collapseKey = `collapsed-projects:${connection?.server ?? 'none'}`;
  const currentCatalog = useRef(cacheKey);
  currentCatalog.current = cacheKey;
  const catalogGeneration = useRef(0);
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
        if (Platform.OS === 'web' && alive) {
          const value = window.history.state?.selected;
          if (value?.deviceId && value?.session?.id) setSelected(value);
        }
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
  const refresh = useCallback(async (manual = false) => {
    const target = client;
    if (!target || target.state.status !== 'connected') return;
    const generation = catalogGeneration.current;
    if (refreshInProgress.current) {
      refreshAgain.current = true;
      if (manual) setRefreshing(true);
      return;
    }
    refreshInProgress.current = true;
    setRefreshing(manual);
    setLoading(!catalogLoaded.current);
    const online = target.state.devices.filter((d) => d.online);
    try {
      const results = await Promise.allSettled(
        online.map((device) =>
          target.request<{ projects: Project[]; recentSessions: RecentSession[] }>('projects/list', { archived }, device.id),
        ),
      );
      if (currentClient.current !== target || currentCatalog.current !== cacheKey || catalogGeneration.current !== generation) return;
      catalogLoaded.current = true;
      const succeeded = new Set<string>();
      const incoming: Project[] = [];
      const incomingRecent: RecentSession[] = [];
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          succeeded.add(online[index].id);
          incoming.push(...result.value.projects);
          incomingRecent.push(...result.value.recentSessions);
        } else errors.push(`${online[index].name}：${result.reason?.message ?? '读取失败'}`);
      });
      setProjects((previous) => mergeProjects(previous, incoming, succeeded));
      setRecentSessions((previous) => mergeRecentSessions(previous, incomingRecent, succeeded));
      setError(errors.join('\n'));
    } finally {
      if (currentClient.current === target && currentCatalog.current === cacheKey && catalogGeneration.current === generation) {
        refreshInProgress.current = false;
        setRefreshing(false);
        setLoading(false);
        if (refreshAgain.current) {
          refreshAgain.current = false;
          void currentRefresh.current();
        }
      }
    }
  }, [client, cacheKey, archived]);
  const currentRefresh = useRef(refresh);
  currentRefresh.current = refresh;
  useEffect(() => {
    let alive = true;
    catalogGeneration.current += 1;
    setProjects([]);
    setRecentSessions([]);
    setError('');
    setArchiveError('');
    setArchivingId(null);
    setRefreshing(false);
    setLoading(false);
    refreshInProgress.current = false;
    refreshAgain.current = false;
    catalogLoaded.current = false;
    void readCache<{ projects: Project[]; recentSessions: RecentSession[] }>(cacheKey)
      .then((cached) => {
        if (alive && cached && !catalogLoaded.current) {
          setProjects((previous) => (previous.length ? previous : cached.projects));
          setRecentSessions((previous) => (previous.length ? previous : cached.recentSessions));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cacheKey, client]);
  useEffect(() => {
    if (catalogLoaded.current) {
      void saveCache(cacheKey, { projects, recentSessions }).catch(() => {});
    }
  }, [cacheKey, projects, recentSessions]);
  useEffect(() => {
    let alive = true;
    collapseLoaded.current = false;
    pendingCollapse.current.clear();
    setCollapsed(new Set());
    void readCache<string[]>(collapseKey).then((saved) => {
      if (!alive) return;
      const next = new Set(saved ?? []);
      for (const [key, closed] of pendingCollapse.current) {
        if (closed) next.add(key);
        else next.delete(key);
      }
      pendingCollapse.current.clear();
      setCollapsed(next);
      collapseLoaded.current = true;
    }).catch(() => { if (alive) collapseLoaded.current = true; });
    return () => { alive = false; };
  }, [collapseKey]);
  const toggleProject = useCallback((project: Project) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      const key = `${connection?.server}:${project.deviceId}:${project.id}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (!collapseLoaded.current) pendingCollapse.current.set(key, next.has(key));
      return next;
    });
  }, [connection?.server]);
  useEffect(() => {
    if (collapseLoaded.current) void saveCache(collapseKey, [...collapsed]).catch(() => {});
  }, [collapsed, collapseKey]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setCreatingId(null);
    if (!client) {
      setState({ status: 'disconnected', devices: [] });
      return;
    }
    let connected = false;
    const offState = client.onState((next) => {
      setState(next);
      if (next.status === 'connected' && !connected) void currentRefresh.current();
      connected = next.status === 'connected';
    });
    const offEvents = client.onEvent((event) => {
      if (event.method === 'catalog/changed' || event.method === 'devices/changed') {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void currentRefresh.current(), 350);
      }
    });
    client.connect();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        client.connect();
        void currentRefresh.current();
      }
    });
    return () => {
      offState();
      offEvents();
      subscription.remove();
      clearTimeout(refreshTimer.current);
      client.disconnect();
    };
  }, [client]);
  useEffect(() => {
    if ((selected && !(canSplit && sidebarOpen)) || tab !== 'projects') return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') void refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [selected, canSplit, sidebarOpen, tab, refresh]);
  const goBack = useCallback(() => {
    setSelected(null);
    if (Platform.OS === 'web' && window.history.state?.selected) window.history.back();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const pop = (event: PopStateEvent) => {
        const value = event.state?.selected;
        setSelected(value?.deviceId && value?.session?.id ? value : null);
      };
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
          !!selected &&
          !newProject &&
          gesture.y0 < height - 160 &&
          horizontalBackSwipe(gesture.dx, gesture.dy, 40),
        onPanResponderRelease: (_, gesture) => {
          if (horizontalBackSwipe(gesture.dx, gesture.dy, 120)) goBack();
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false,
      }),
    [selected, newProject, height, goBack],
  );
  function open(project: Project, session: Session) {
    openSelection({ deviceId: project.deviceId, project, session });
  }
  function openRecent(entry: RecentSession) {
    openSelection({ deviceId: entry.deviceId, project: null, session: entry.session });
  }
  function openSelection(value: Selected) {
    setSelected(value);
    setTab('projects');
    if (Platform.OS === 'web') {
      const url = `#session=${encodeURIComponent(value.session.id)}`;
      if (window.history.state?.selected) window.history.replaceState({ selected: value }, '', url);
      else window.history.pushState({ selected: value }, '', url);
    }
  }
  async function createSession(project: Project) {
    if (!client || creatingId) return;
    const target = client;
    setCreatingId(`${project.deviceId}:${project.id}`);
    setError('');
    try {
      const { session } = await target.request<{ session: Session }>(
        'sessions/create',
        { projectId: project.id },
        project.deviceId,
      );
      if (currentClient.current === target) {
        open(project, session);
        void currentRefresh.current();
      }
    } catch (e) {
      if (currentClient.current === target) setError((e as Error).message);
    } finally {
      if (currentClient.current === target) setCreatingId(null);
    }
  }
  async function archive(project: Project) {
    if (!client || archivingId) return;
    const target = client;
    setArchivingId(`${project.deviceId}:${project.id}`);
    setArchiveError('');
    try {
      await target.request(
        'projects/archive',
        { projectId: project.id, threadIds: project.sessions.map((item) => item.id) },
        project.deviceId,
      );
    } catch (e) {
      if (currentClient.current === target) setArchiveError((e as Error).message);
    } finally {
      if (currentClient.current === target) {
        setArchivingId(null);
        void currentRefresh.current();
      }
    }
  }
  async function renameSession(entry: RecentSession, name: string) {
    if (!client) throw new Error('请先连接电脑');
    await client.request('sessions/rename', { threadId: entry.session.id, name }, entry.deviceId);
    const replace = (session: Session) => session.id === entry.session.id ? { ...session, name } : session;
    setProjects((previous) => previous.map((project) => project.deviceId === entry.deviceId ? { ...project, sessions: project.sessions.map(replace) } : project));
    setRecentSessions((previous) => previous.map((item) => item.deviceId === entry.deviceId ? { ...item, session: replace(item.session) } : item));
    if (selected?.deviceId === entry.deviceId && selected.session.id === entry.session.id)
      setSelected({ ...selected, session: replace(selected.session) });
    void currentRefresh.current();
  }
  async function forkSession(entry: RecentSession) {
    if (!client) throw new Error('请先连接电脑');
    const { session } = await client.request<{ session: Session }>('sessions/fork', { threadId: entry.session.id }, entry.deviceId);
    openSelection({ deviceId: entry.deviceId, session,
      project: projects.find((project) => project.deviceId === entry.deviceId && project.id === session.projectId) ?? null });
    void currentRefresh.current();
  }
  async function archiveSession(deviceId: string, session: Session, restore = false) {
    if (!client || archivingId) return;
    const target = client;
    setArchivingId(`${deviceId}:${session.id}`);
    setArchiveError('');
    try {
      await target.request(restore ? 'sessions/unarchive' : 'sessions/archive', { threadId: session.id }, deviceId);
    } catch (e) {
      if (currentClient.current === target) setArchiveError((e as Error).message);
    } finally {
      if (currentClient.current === target) {
        setArchivingId(null);
        void currentRefresh.current();
      }
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
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} backgroundColor={palette.background} />
      <SafeAreaView
        edges={selected ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}
        style={{ flex: 1 }}
      >
        <SplitLayout
          split={!!selected && canSplit && sidebarOpen}
          projectHidden={(!!selected && !(canSplit && sidebarOpen)) || (!selected && tab !== 'projects')}
          project={<Projects
              projects={projects}
              recentSessions={recentSessions}
              state={state}
              refreshing={refreshing}
              loading={loading}
              archived={archived}
              archivingId={archivingId}
              collapsed={collapsed}
              onToggle={toggleProject}
              collapsePrefix={connection?.server ?? ''}
              compact={!!selected && canSplit && sidebarOpen}
              error={[error, archiveError].filter(Boolean).join('\n')}
              creatingId={creatingId}
              onRefresh={() => void refresh(true)}
              onArchivedChange={setArchived}
              onArchive={archive}
              onArchiveSession={(deviceId, session) => void archiveSession(deviceId, session)}
              onRestoreSession={(deviceId, session) => void archiveSession(deviceId, session, true)}
              onRenameSession={renameSession}
              onForkSession={forkSession}
              onSettings={() => setTab('settings')}
              onCreateProject={() => {
                if (!client || !state.devices.some((d) => d.online)) setTab('settings');
                else setNewProject(true);
              }}
              onCreateSession={createSession}
              onOpen={open}
              onOpenRecent={openRecent}
            />}
        >
          {selected ? (
            <View style={styles.chatPanel} testID="session-panel" {...swipe.panHandlers}>
              {canSplit && (
                <View style={styles.splitControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={sidebarOpen ? '收起项目栏' : '显示项目栏'}
                    accessibilityState={{ expanded: sidebarOpen }}
                    onPress={() => setSidebarOpen((previous) => !previous)}
                    style={styles.splitButton}
                  >
                    <Icon name="projects" size={18} color={palette.secondary} />
                    <Text style={styles.splitText}>{sidebarOpen ? '收起项目' : '显示项目'}</Text>
                  </Pressable>
                </View>
              )}
              <Chat
                key={`${connection?.server}:${selected.deviceId}:${selected.session.id}`}
                project={selected.project}
                deviceId={selected.deviceId}
                session={selected.session}
                client={client}
                clientState={state}
                server={connection?.server ?? ''}
                onOpenSource={(session) => openSelection({ deviceId: selected.deviceId, session,
                  project: projects.find((project) => project.deviceId === selected.deviceId && project.id === session.projectId) ?? null })}
              />
            </View>
          ) : tab === 'settings' ? (
            <Settings
              key={connection?.server ?? 'none'}
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
          ) : null}
        </SplitLayout>
        {!selected && <View style={styles.tabs} testID="bottom-tabs">
            {(['projects', 'settings'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityLabel={value === 'projects' ? 'Projects' : 'Settings'}
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                style={styles.tab}
              >
                <Icon name={value} size={20} color={tab === value ? palette.ink : palette.muted} />
                <Text style={[styles.tabText, tab === value && { color: palette.ink }]}>
                  {value === 'projects' ? 'Projects' : 'Settings'}
                </Text>
              </Pressable>
            ))}
          </View>}
      </SafeAreaView>
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
      <UIProvider>
        <Main />
      </UIProvider>
    </SafeAreaProvider>
  );
}
const createStyles = (palette: Palette) => StyleSheet.create({
  root: { backgroundColor: palette.background, width: '100%', flex: 1 },
  chatPanel: { flex: 1, minWidth: 0, minHeight: 0 },
  splitControls: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 2 },
  splitButton: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 8, alignSelf: 'flex-start' },
  splitText: { fontSize: 13, color: palette.secondary },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    minHeight: 66,
    backgroundColor: palette.background,
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 11, gap: 5 },
  tabText: { color: palette.muted, fontSize: 11 },
});
