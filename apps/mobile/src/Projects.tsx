import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Device, Project, Session } from '@codex-remote/protocol';
import type { ClientState } from './client';
import { Icon } from './icons';
import { Button, common, palette } from './ui';
export function activityTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  if (now.getTime() - timestamp < 6 * 86400000)
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
export function Projects({
  projects,
  state,
  refreshing,
  error,
  creatingId,
  onRefresh,
  onSettings,
  onCreateProject,
  onCreateSession,
  onOpen,
}: {
  projects: Project[];
  state: ClientState;
  refreshing: boolean;
  error: string;
  creatingId: string | null;
  onRefresh: () => void;
  onSettings: () => void;
  onCreateProject: () => void;
  onCreateSession: (project: Project) => void;
  onOpen: (project: Project, session: Session) => void;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const keyOf = (project: Project) => `${project.deviceId}:${project.id}`;
  const devices = new Map<string, Device>(state.devices.map((d) => [d.id, d]));
  const onlineCount = state.devices.filter((d) => d.online).length;
  const filtered = useMemo(() => {
    const needle = query.toLocaleLowerCase().trim();
    return [...projects]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter(
        (p) =>
          !needle ||
          `${p.name} ${p.path}`.toLocaleLowerCase().includes(needle) ||
          p.sessions.some((s) => s.name.toLocaleLowerCase().includes(needle)),
      );
  }, [projects, query]);
  const connectionText =
    state.status === 'connected'
      ? `${onlineCount} 台电脑在线`
      : state.status === 'connecting'
        ? '连接中…'
        : state.status === 'reconnecting'
          ? '正在重新连接…'
          : '连接你的电脑，继续工作';
  return (
    <View style={common.page} testID="projects-screen">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.ink} />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 36 }}
      >
        <View style={[common.content, { paddingTop: 38 }]}>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={common.title}>
              Projects
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="新建项目"
              hitSlop={8}
              onPress={onCreateProject}
              style={({ pressed }) => [styles.add, pressed && { backgroundColor: palette.soft }]}
            >
              <Icon name="plus" size={27} />
            </Pressable>
          </View>
          <Text style={common.subtitle}>{connectionText}</Text>
          {projects.length > 0 && (
            <View style={styles.search}>
              <Icon name="search" size={17} color={palette.muted} />
              <TextInput
                accessibilityLabel="搜索项目或会话"
                placeholder="搜索项目或会话"
                placeholderTextColor="#969696"
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
              />
            </View>
          )}
          {!!error && <Text style={[common.error, { marginTop: 22 }]}>{error}</Text>}
          {state.status === 'error' && (
            <Pressable accessibilityRole="button" onPress={onSettings}>
              <Text style={[common.error, { marginTop: 16 }]}>{state.error}</Text>
            </Pressable>
          )}
          {!projects.length && !refreshing && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {onlineCount ? '从一个项目开始' : '工作在电脑上，灵感在任何地方。'}
              </Text>
              <Text style={styles.emptyHint}>
                {onlineCount
                  ? '添加电脑上的项目目录，或刷新以查看已有 Codex 会话。'
                  : '连接你的电脑，即可查看和继续已有的 Codex 会话。'}
              </Text>
              <Button
                label={onlineCount ? '新建项目' : '连接电脑'}
                onPress={onlineCount ? onCreateProject : onSettings}
                style={{ alignSelf: 'flex-start', marginTop: 25 }}
              />
            </View>
          )}
          {refreshing && !projects.length && (
            <ActivityIndicator color={palette.ink} style={{ marginTop: 70 }} />
          )}
          {filtered.map((project) => {
            const key = keyOf(project);
            const expanded = query || !collapsed.has(key);
            const machine = devices.get(project.deviceId);
            const matchingProject = project.name
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase().trim());
            const sessions =
              query && !matchingProject
                ? project.sessions.filter((s) =>
                    s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
                  )
                : project.sessions;
            return (
              <View key={key} style={styles.project}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`项目 ${project.name}，${machine?.name ?? '电脑'}`}
                  accessibilityState={{ expanded: !!expanded }}
                  aria-expanded={!!expanded}
                  onPress={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  style={styles.projectRow}
                >
                  <View
                    style={{
                      transform: [{ rotate: expanded ? '0deg' : '-90deg' }],
                      marginRight: 12,
                    }}
                  >
                    <Icon name="chevron" size={17} color={palette.secondary} />
                  </View>
                  <Text style={styles.projectName} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <Text
                    style={[styles.machine, !machine?.online && { color: '#aaa' }]}
                    numberOfLines={1}
                  >
                    {machine?.name ?? '离线电脑'}
                  </Text>
                </Pressable>
                {!!expanded && (
                  <View>
                    {sessions.map((session) => (
                      <Pressable
                        key={session.id}
                        accessibilityRole="button"
                        accessibilityLabel={`打开会话 ${session.name}`}
                        onPress={() => onOpen(project, session)}
                        style={({ pressed }) => [styles.sessionRow, pressed && { opacity: 0.5 }]}
                      >
                        <Text style={styles.sessionName} numberOfLines={1}>
                          {session.name}
                        </Text>
                        <Text style={styles.time}>{activityTime(session.updatedAt)}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`在 ${project.name} 新建会话`}
                      disabled={!machine?.online || !project.available || creatingId === key}
                      onPress={() => onCreateSession(project)}
                      style={styles.newSession}
                    >
                      <Icon name="plus" size={14} color={palette.muted} />
                      <Text
                        style={[
                          styles.newSessionText,
                          (!machine?.online || !project.available) && { opacity: 0.45 },
                        ]}
                      >
                        {creatingId === key ? '创建中…' : '新建会话'}
                      </Text>
                    </Pressable>
                    {!project.available && (
                      <Text style={styles.pathMissing}>电脑上的目录暂不可用</Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          {query && !filtered.length && (
            <Text style={[styles.emptyHint, { marginTop: 40 }]}>没有找到匹配的项目或会话</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { padding: 8, borderRadius: 24 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 31,
    paddingBottom: 13,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  searchInput: { flex: 1, color: palette.ink, fontSize: 14, padding: 0, minHeight: 24 },
  project: {
    paddingTop: 26,
    paddingBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  projectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  projectName: {
    flex: 1,
    color: palette.ink,
    fontWeight: '600',
    fontSize: 18,
    letterSpacing: -0.35,
    marginRight: 13,
  },
  machine: { flexShrink: 1, maxWidth: '35%', fontSize: 12, color: palette.muted },
  sessionRow: {
    minHeight: 47,
    paddingLeft: 29,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  sessionName: { flex: 1, fontSize: 15, color: '#353535', lineHeight: 22 },
  time: { color: '#9a9a9a', fontSize: 12, minWidth: 43, textAlign: 'right' },
  newSession: {
    paddingLeft: 29,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newSessionText: { fontSize: 12, color: palette.muted },
  pathMissing: { color: palette.muted, fontSize: 12, paddingLeft: 29, marginTop: 6 },
  empty: { marginTop: 86 },
  emptyTitle: { color: palette.ink, fontSize: 22, lineHeight: 32, letterSpacing: -0.4 },
  emptyHint: { fontSize: 14, lineHeight: 24, color: palette.muted, marginTop: 14, maxWidth: 360 },
});
