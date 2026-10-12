import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Device, Project, RecentSession, Session } from '@codex-remote/protocol';
import type { ClientState } from './client';
import { Icon } from './icons';
import { projectKey, projectSections, type ProjectSection } from './project-list';
import { SessionActions } from './SessionActions';
import { sessionPinKey } from './session-pins';
import { useSessionPins } from './use-session-pins';
import { Button, useUI, useThemedStyles, type Palette } from './ui';

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

interface ProjectsProps {
  projects: Project[];
  recentSessions: RecentSession[];
  state: ClientState;
  refreshing: boolean;
  loading: boolean;
  archived: boolean;
  archivingId: string | null;
  collapsed: Set<string>;
  collapsePrefix: string;
  compact?: boolean;
  onToggle: (project: Project) => void;
  error: string;
  creatingId: string | null;
  onRefresh: () => void;
  onArchivedChange: (archived: boolean) => void;
  onArchive: (project: Project) => void;
  onArchiveSession: (deviceId: string, session: Session) => void;
  onRestoreSession: (deviceId: string, session: Session) => void;
  onSettings: () => void;
  onCreateProject: () => void;
  onCreateSession: (project: Project) => void;
  onOpen: (project: Project, session: Session) => void;
  onOpenRecent: (entry: RecentSession) => void;
}

const SessionRow = memo(function SessionRow({
  session,
  project,
  deviceId,
  machine,
  pending,
  pinned,
  onOpen,
  onOpenRecent,
  onManage,
}: {
  session: Session;
  project: Project | null;
  deviceId: string;
  machine: Device | undefined;
  pending: boolean;
  pinned: boolean;
  onOpen: ProjectsProps['onOpen'];
  onOpenRecent: ProjectsProps['onOpenRecent'];
  onManage: (entry: RecentSession) => void;
}) {
  const { palette } = useUI();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.sessionRow, !project && styles.recentRow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`打开会话 ${session.name}`}
        accessibilityHint={pinned ? '已置顶，长按管理会话' : '长按管理会话'}
        onPress={() => project ? onOpen(project, session) : onOpenRecent({ deviceId, session })}
        onLongPress={() => onManage({ deviceId, session })}
        style={({ pressed }) => [styles.sessionOpen, pressed && { opacity: 0.5 }]}
      >
        <View style={styles.sessionText}>
          <Text style={styles.sessionName} numberOfLines={1}>{session.name}</Text>
          {pinned && <Text style={styles.pinnedLabel}>已置顶</Text>}
          {!project && (
            <Text style={styles.recentMachine} numberOfLines={1}>
              {machine?.name ?? '电脑'}{machine?.online ? '' : ' · 未知'}
            </Text>
          )}
        </View>
        <Text style={styles.time}>{activityTime(session.updatedAt)}</Text>
      </Pressable>
      <Pressable
          accessibilityRole="button"
          accessibilityLabel={`管理会话 ${session.name}`}
          onPress={() => onManage({ deviceId, session })}
          style={styles.action}
        >
          {pending ? <ActivityIndicator size="small" color={palette.ink} /> : <Text style={styles.menuIcon}>⋯</Text>}
      </Pressable>
    </View>
  );
});

export function Projects({
  projects,
  recentSessions,
  state,
  refreshing,
  loading,
  archived,
  archivingId,
  collapsed,
  collapsePrefix,
  compact = false,
  onToggle,
  error,
  creatingId,
  onRefresh,
  onArchivedChange,
  onArchive,
  onArchiveSession,
  onRestoreSession,
  onSettings,
  onCreateProject,
  onCreateSession,
  onOpen,
  onOpenRecent,
}: ProjectsProps) {
  const { palette, common, fontScale, scheme } = useUI();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');
  const [confirmation, setConfirmation] = useState<Project | null>(null);
  const [actionEntry, setActionEntry] = useState<RecentSession | null>(null);
  const showActions = useCallback((entry: RecentSession) => setActionEntry(entry), []);
  const pinState = useSessionPins(collapsePrefix);
  const [shownMore, setShownMore] = useState<Set<string>>(() => new Set());
  const devices = useMemo(() => new Map(state.devices.map((device) => [device.id, device])), [state.devices]);
  const onlineCount = state.devices.filter((device) => device.online).length;
  const sections = useMemo(
    () => projectSections(projects, recentSessions, query, collapsed, shownMore, collapsePrefix, pinState.pins),
    [projects, recentSessions, query, collapsed, shownMore, collapsePrefix, pinState.pins],
  );
  const hasEntries = projects.length > 0 || recentSessions.length > 0;
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
      <SectionList<RecentSession, ProjectSection>
        testID="project-list"
        sections={sections}
        keyExtractor={({ deviceId, session }) => `${deviceId}:${session.id}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        initialNumToRender={16}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.ink} />}
        contentContainerStyle={[common.content, styles.content, compact && styles.compactContent]}
        ListHeaderComponent={
          <View>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={[common.title, compact && styles.compactTitle]}>Projects</Text>
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
            <View style={styles.filters}>
              {[false, true].map((value) => (
                <Pressable
                  key={String(value)}
                  accessibilityRole="tab"
                  accessibilityLabel={value ? '已归档' : '当前项目'}
                  accessibilityState={{ selected: archived === value }}
                  onPress={() => onArchivedChange(value)}
                  style={[styles.filter, archived === value && { backgroundColor: palette.soft }]}
                >
                  <Text style={{ fontSize: 14 * fontScale, color: archived === value ? palette.ink : palette.muted }}>{value ? '已归档' : '当前项目'}</Text>
                </Pressable>
              ))}
            </View>
            {hasEntries && (
              <View style={styles.search}>
                <Icon name="search" size={17} color={palette.muted} />
                <TextInput
                  accessibilityLabel="搜索项目或会话"
                  placeholder="搜索项目或会话"
                  placeholderTextColor={palette.muted}
                keyboardAppearance={scheme}
                  value={query}
                  onChangeText={setQuery}
                  style={styles.searchInput}
                />
              </View>
            )}
            {!!error && <Text style={[common.error, { marginTop: 22 }]}>{error}</Text>}
            {!!pinState.error && (
              <View style={{ marginTop: 16 }}>
                <Text style={common.error}>{pinState.error}</Text>
                <Button label="重试置顶设置" subtle onPress={pinState.retry} />
              </View>
            )}
            {state.status === 'error' && (
              <Pressable accessibilityRole="button" onPress={onSettings}>
                <Text style={[common.error, { marginTop: 16 }]}>连接状态未知，请查看连接信息</Text>
              </Pressable>
            )}
            {!hasEntries && !loading && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {archived ? '没有已归档的会话' : onlineCount ? '从一个项目开始' : '工作在电脑上，灵感在任何地方。'}
                </Text>
                <Text style={styles.emptyHint}>
                  {archived ? '归档的会话会保留在 Codex 中，可在这里恢复。' : onlineCount
                    ? '添加电脑上的项目目录，或刷新以查看已有 Codex 会话。'
                    : '连接你的电脑，即可查看和继续已有的 Codex 会话。'}
                </Text>
                {!archived && <Button label={onlineCount ? '新建项目' : '连接电脑'} onPress={onlineCount ? onCreateProject : onSettings} style={{ alignSelf: 'flex-start', marginTop: 25 }} />}
              </View>
            )}
            {loading && !hasEntries && <ActivityIndicator color={palette.ink} style={{ marginTop: 70 }} />}
          </View>
        }
        renderSectionHeader={({ section }) => {
          const project = section.project;
          if (!project) return <Text accessibilityRole="header" style={styles.recentHeading}>最近对话</Text>;
          const machine = devices.get(project.deviceId);
          const key = projectKey(project);
          return (
            <View style={styles.projectHeading}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`项目 ${project.name}，${machine?.name ?? '电脑'}`}
                accessibilityState={{ expanded: section.expanded }}
                aria-expanded={section.expanded}
                onPress={() => onToggle(project)}
                style={styles.projectRow}
              >
                <View style={{ transform: [{ rotate: section.expanded ? '0deg' : '-90deg' }], marginRight: compact ? 8 : 12 }}>
                  <Icon name="chevron" size={17} color={palette.secondary} />
                </View>
                <Text style={[styles.projectName, compact && styles.compactProjectName]} numberOfLines={1}>{project.name}</Text>
                <Text style={[styles.machine, !machine?.online && { color: palette.muted }]} numberOfLines={1}>{machine?.name ?? '电脑'}</Text>
              </Pressable>
              {!archived && project.sessions.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`归档项目 ${project.name}`}
                  disabled={!machine?.online || !!archivingId}
                  onPress={() => setConfirmation(project)}
                  style={[styles.action, (!machine?.online || !!archivingId) && { opacity: 0.4 }]}
                >
                  {archivingId === key ? <ActivityIndicator size="small" /> : <Icon name="archive" size={18} color={palette.secondary} />}
                </Pressable>
              )}
            </View>
          );
        }}
        renderItem={({ item, section }) => (
          <SessionRow
            session={item.session}
            project={section.project}
            deviceId={item.deviceId}
            machine={devices.get(item.deviceId)}
            pending={archivingId === `${item.deviceId}:${item.session.id}`}
            pinned={pinState.pins.has(sessionPinKey(item.deviceId, item.session.id))}
            onOpen={onOpen}
            onOpenRecent={onOpenRecent}
            onManage={showActions}
          />
        )}
        renderSectionFooter={({ section }) => {
          const project = section.project;
          if (!project) return <View style={styles.sectionFooter} />;
          const machine = devices.get(project.deviceId);
          const key = projectKey(project);
          const createDisabled = !machine?.online || !project.available || creatingId === key;
          return (
            <View style={styles.sectionFooter}>
              {section.expanded && (
                <>
                  {section.total > section.data.length && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`显示更多 ${project.name} 的会话`}
                      onPress={() => setShownMore((previous) => new Set(previous).add(section.key))}
                      style={styles.more}
                    >
                      <Text style={styles.moreText}>显示更多（{section.total - section.data.length}）</Text>
                    </Pressable>
                  )}
                  {!archived && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`在 ${project.name} 新建会话`}
                      disabled={createDisabled}
                      onPress={() => onCreateSession(project)}
                      style={({ pressed }) => [
                        styles.newSession,
                        createDisabled && { opacity: 0.45 },
                        pressed && !createDisabled && { backgroundColor: palette.line },
                      ]}
                    >
                      <Icon name="plus" size={16} color={palette.secondary} />
                      <Text style={styles.newSessionText}>{creatingId === key ? '创建中…' : '新建会话'}</Text>
                    </Pressable>
                  )}
                  {!project.available && <Text style={styles.pathMissing}>电脑上的目录暂不可用</Text>}
                </>
              )}
            </View>
          );
        }}
        ListFooterComponent={query.trim() && !sections.length ? <Text style={[styles.emptyHint, { marginTop: 40 }]}>没有找到匹配的项目或会话</Text> : null}
      />
      {actionEntry && (
        <SessionActions
          entry={actionEntry}
          pinned={pinState.pins.has(sessionPinKey(actionEntry.deviceId, actionEntry.session.id))}
          pinReady={pinState.ready}
          archived={archived}
          archiveDisabled={state.status !== 'connected' || !devices.get(actionEntry.deviceId)?.online || !!archivingId}
          onPin={() => {
            pinState.togglePin(actionEntry.deviceId, actionEntry.session.id);
            setActionEntry(null);
          }}
          onArchive={() => { onArchiveSession(actionEntry.deviceId, actionEntry.session); setActionEntry(null); }}
          onRestore={() => { onRestoreSession(actionEntry.deviceId, actionEntry.session); setActionEntry(null); }}
          onClose={() => setActionEntry(null)}
        />
      )}
      {confirmation && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setConfirmation(null)}>
          <View style={styles.overlay}>
            <View style={styles.confirmation}>
              <Text style={styles.emptyTitle}>归档 {confirmation.name}？</Text>
              <Text style={styles.emptyHint}>
                将归档该项目列表中的全部 {confirmation.sessions.length} 个会话，并同步到电脑上的 Codex。项目目录和代码会保留。
              </Text>
              <View style={styles.confirmActions}>
                <Button label="取消" subtle onPress={() => setConfirmation(null)} />
                <Button label="归档全部会话" onPress={() => { onArchive(confirmation); setConfirmation(null); }} />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  content: { flexGrow: 1, paddingTop: 38, paddingBottom: 36 },
  compactContent: { paddingHorizontal: 14, paddingTop: 16 },
  compactTitle: { fontSize: 27, lineHeight: 36 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { padding: 8, borderRadius: 24 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 24 },
  filter: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  projectHeading: { flexDirection: 'row', alignItems: 'center', paddingTop: 26 },
  recentHeading: { fontSize: 18, fontWeight: '600', color: palette.ink, paddingTop: 26, paddingBottom: 12 },
  action: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sessionOpen: { flex: 1, minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionText: { flex: 1, minWidth: 0 },
  recentMachine: { fontSize: 11, color: palette.muted, marginTop: 3 },
  overlay: { flex: 1, backgroundColor: '#0005', justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmation: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 14, backgroundColor: palette.background },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 24 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 31, paddingBottom: 13, borderBottomColor: palette.line, borderBottomWidth: 1 },
  searchInput: { flex: 1, color: palette.ink, fontSize: 14, padding: 0, minHeight: 24 },
  sectionFooter: { paddingBottom: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  projectRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  projectName: { flex: 1, minWidth: 0, color: palette.ink, fontWeight: '600', fontSize: 18, letterSpacing: -0.35, marginRight: 13 },
  compactProjectName: { fontSize: 16, marginRight: 8 },
  machine: { flexShrink: 1, maxWidth: '35%', fontSize: 12, color: palette.muted },
  sessionRow: { minHeight: 47, paddingLeft: 29, flexDirection: 'row', alignItems: 'center', gap: 4 },
  recentRow: { paddingLeft: 0, minHeight: 57 },
  sessionName: { fontSize: 15, color: palette.secondary, lineHeight: 22 },
  pinnedLabel: { fontSize: 10, color: palette.muted, marginTop: 2 },
  menuIcon: { fontSize: 22, lineHeight: 28, color: palette.muted },
  time: { color: palette.muted, fontSize: 12, minWidth: 43, textAlign: 'right' },
  more: { paddingLeft: 29, minHeight: 44, justifyContent: 'center' },
  moreText: { fontSize: 13, color: palette.secondary },
  newSession: {
    alignSelf: 'flex-start', marginLeft: 29, marginTop: 8, minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    borderColor: palette.line, backgroundColor: palette.soft,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  newSessionText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.secondary },
  pathMissing: { color: palette.muted, fontSize: 12, paddingLeft: 29, marginTop: 6 },
  empty: { marginTop: 86 },
  emptyTitle: { color: palette.ink, fontSize: 22, lineHeight: 32, letterSpacing: -0.4 },
  emptyHint: { fontSize: 14, lineHeight: 24, color: palette.muted, marginTop: 14, maxWidth: 360 },
});
