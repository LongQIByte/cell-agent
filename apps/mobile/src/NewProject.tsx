import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Device, Project } from '@codex-remote/protocol';
import type { RemoteClient } from './client';
import { ComputerPicker } from './ComputerPicker';
import { Icon } from './icons';
import { Button, useUI, useThemedStyles, type Palette } from './ui';
interface DirectoryPage {
  path: string;
  directories: { name: string; path: string }[];
}
export function NewProject({
  devices,
  client,
  onClose,
  onCreated,
}: {
  devices: Device[];
  client: RemoteClient;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const { palette, common, scheme } = useUI();
  const styles = useThemedStyles(createStyles);
  const [deviceId, setDeviceId] = useState(devices.find((d) => d.online)?.id ?? '');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [directory, setDirectory] = useState<DirectoryPage | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [choosingComputer, setChoosingComputer] = useState(false);
  const browseRequest = useRef(0);
  const selectedDevice = devices.find((device) => device.id === deviceId);
  useEffect(() => () => { browseRequest.current++; }, []);
  function selectComputer(device: Device) {
    setChoosingComputer(false);
    if (device.id === deviceId) return;
    browseRequest.current++;
    setDeviceId(device.id);
    setPath('');
    setDirectory(null);
    setBrowsing(false);
    setBusy(false);
    setError('');
  }
  function closeBrowsing() {
    browseRequest.current++;
    setBrowsing(false);
    setBusy(false);
    setError('');
  }
  async function browse(nextPath?: string) {
    if (!selectedDevice?.online) return;
    const request = ++browseRequest.current;
    setBusy(true);
    setError('');
    setBrowsing(true);
    try {
      const result = await client.request<DirectoryPage>(
        'directories/list',
        nextPath ? { path: nextPath } : {},
        deviceId,
      );
      if (browseRequest.current === request) setDirectory(result);
    } catch (e) {
      if (browseRequest.current === request) setError((e as Error).message);
    } finally {
      if (browseRequest.current === request) setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError('');
    try {
      const { project } = await client.request<{ project: Project }>(
        'projects/create',
        { name, path },
        deviceId,
      );
      onCreated(project);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const parent = directory?.path.replace(/[\\/][^\\/]+[\\/]?$/, '') || '/';
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.heading}>
            <Text style={styles.title}>{browsing ? '选择电脑上的目录' : '新建项目'}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭新建项目"
              onPress={onClose}
              hitSlop={10}
            >
              <Icon name="close" size={22} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {!browsing ? (
              <>
                <Text style={common.label}>所属电脑</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`所属电脑，${selectedDevice?.name ?? '选择电脑'}`}
                  accessibilityState={{ expanded: choosingComputer, disabled: busy }}
                  aria-expanded={choosingComputer}
                  disabled={busy}
                  onPress={() => setChoosingComputer(true)}
                  style={styles.deviceSelect}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.deviceName} numberOfLines={1}>{selectedDevice?.name ?? '选择电脑'}</Text>
                    {selectedDevice && <Text style={styles.deviceDetail}>{selectedDevice.platform} · {selectedDevice.online ? '在线' : '未知'}</Text>}
                  </View>
                  <Icon name="chevron" size={17} color={palette.muted} />
                </Pressable>
                <Text style={common.label}>项目名称</Text>
                <TextInput
                  accessibilityLabel="项目名称"
                  placeholder="例如：My Project"
                  placeholderTextColor={palette.muted}
                keyboardAppearance={scheme}
                  value={name}
                  onChangeText={setName}
                  style={common.field}
                />
                <Text style={[common.label, { marginTop: 27 }]}>电脑上的目录</Text>
                <TextInput
                  accessibilityLabel="项目目录"
                  placeholder="输入绝对路径或浏览目录"
                  placeholderTextColor={palette.muted}
                keyboardAppearance={scheme}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={path}
                  onChangeText={setPath}
                  style={common.field}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="浏览电脑目录"
                  disabled={busy || !selectedDevice?.online}
                  onPress={() => browse(path || undefined)}
                  style={{ paddingVertical: 17, opacity: selectedDevice?.online ? 1 : 0.45 }}
                >
                  <Text style={styles.browse}>浏览电脑目录</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeBrowsing}
                  style={styles.backRow}
                >
                  <Icon name="back" size={18} />
                  <Text style={styles.browse}>返回</Text>
                </Pressable>
                {directory && (
                  <>
                    <Text selectable style={styles.directoryPath}>
                      {directory.path}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="上一级目录"
                      onPress={() => browse(parent)}
                      style={styles.directoryRow}
                    >
                      <Text style={styles.directoryName}>.. / 上一级</Text>
                    </Pressable>
                    {directory.directories.map((entry) => (
                      <Pressable
                        key={entry.path}
                        accessibilityRole="button"
                        accessibilityLabel={`目录 ${entry.name}`}
                        onPress={() => browse(entry.path)}
                        style={styles.directoryRow}
                      >
                        <Text style={styles.directoryName} numberOfLines={1}>
                          {entry.name}
                        </Text>
                        <View style={{ transform: [{ rotate: '-90deg' }] }}>
                          <Icon name="chevron" size={15} color={palette.muted} />
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}
              </>
            )}
            {!!error && <Text style={[common.error, { marginVertical: 15 }]}>{error}</Text>}
            {busy && <ActivityIndicator color={palette.ink} style={{ marginVertical: 12 }} />}
          </ScrollView>
          {browsing ? (
            <Button
              label="使用此目录"
              disabled={busy || !directory}
              onPress={() => {
                if (!directory) return;
                setPath(directory.path);
                if (!name)
                  setName(directory.path.split(/[\\/]/).filter(Boolean).pop() ?? 'Project');
                setBrowsing(false);
              }}
            />
          ) : (
            <Button
              label="创建项目"
              onPress={create}
              disabled={busy || !name.trim() || !path.trim() || !selectedDevice?.online}
            />
          )}
        </View>
      </KeyboardAvoidingView>
      {choosingComputer && <ComputerPicker devices={devices} selectedId={deviceId} onSelect={selectComputer} onClose={() => setChoosingComputer(false)} />}
    </Modal>
  );
}
const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', padding: 20 },
  sheet: {
    backgroundColor: palette.background,
    padding: 25,
    width: '100%',
    maxWidth: 500,
    maxHeight: '88%',
    alignSelf: 'center',
    borderRadius: 12,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  title: { fontSize: 21, fontWeight: '600', color: palette.ink },
  deviceSelect: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    marginBottom: 27,
  },
  deviceName: { color: palette.ink, fontSize: 15 },
  deviceDetail: { color: palette.muted, fontSize: 12, marginTop: 4 },
  browse: { color: palette.secondary, fontSize: 13 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 20 },
  directoryPath: { fontSize: 12, color: palette.muted, marginBottom: 20, lineHeight: 20 },
  directoryRow: {
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  directoryName: { flex: 1, fontSize: 15, color: palette.ink, marginRight: 10 },
});
