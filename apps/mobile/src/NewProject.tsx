import React, { useState } from 'react';
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
import { Icon } from './icons';
import { Button, common, palette } from './ui';
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
  const [deviceId, setDeviceId] = useState(devices.find((d) => d.online)?.id ?? '');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [directory, setDirectory] = useState<DirectoryPage | null>(null);
  const [browsing, setBrowsing] = useState(false);
  async function browse(nextPath?: string) {
    setBusy(true);
    setError('');
    setBrowsing(true);
    try {
      const result = await client.request<DirectoryPage>(
        'directories/list',
        nextPath ? { path: nextPath } : {},
        deviceId,
      );
      setDirectory(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
                <View style={{ marginBottom: 27 }}>
                  {devices
                    .filter((d) => d.online)
                    .map((device) => (
                      <Pressable
                        key={device.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: deviceId === device.id }}
                        accessibilityLabel={`选择电脑 ${device.name}`}
                        onPress={() => setDeviceId(device.id)}
                        style={styles.deviceRow}
                      >
                        <Text style={styles.deviceName}>{device.name}</Text>
                        {deviceId === device.id && <Icon name="check" size={18} />}
                      </Pressable>
                    ))}
                </View>
                <Text style={common.label}>项目名称</Text>
                <TextInput
                  accessibilityLabel="项目名称"
                  placeholder="例如：My Project"
                  placeholderTextColor="#aaa"
                  value={name}
                  onChangeText={setName}
                  style={common.field}
                />
                <Text style={[common.label, { marginTop: 27 }]}>电脑上的目录</Text>
                <TextInput
                  accessibilityLabel="项目目录"
                  placeholder="输入绝对路径或浏览目录"
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={path}
                  onChangeText={setPath}
                  style={common.field}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => browse(path || undefined)}
                  style={{ paddingVertical: 17 }}
                >
                  <Text style={styles.browse}>浏览电脑目录</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setBrowsing(false)}
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
              disabled={busy || !name.trim() || !path.trim() || !deviceId}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', padding: 20 },
  sheet: {
    backgroundColor: 'white',
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
  deviceRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  deviceName: { color: palette.ink, fontSize: 15 },
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
