import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RemoteClient, websocketUrl, type ClientState, type Connection } from './client';
import { Button, common, palette } from './ui';
export function Settings({
  connection,
  state,
  client,
  onSave,
  onDisconnect,
}: {
  connection: Connection | null;
  state: ClientState;
  client: RemoteClient | null;
  onSave: (connection: Connection) => Promise<void>;
  onDisconnect: () => void;
}) {
  const [server, setServer] = useState(
    connection?.server ?? (Platform.OS === 'web' ? window.location.origin : ''),
  );
  const [token, setToken] = useState(connection?.token ?? '');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setError('');
    setBusy(true);
    try {
      const url = websocketUrl(server);
      if (token.trim().length < 16) throw new Error('请输入电脑服务生成的完整配对密钥');
      await onSave({ server: url, token: token.trim() });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const status = {
    connected: '已连接',
    connecting: '连接中…',
    reconnecting: '重新连接中…',
    disconnected: '未连接',
    error: '连接失败',
  }[state.status];
  return (
    <View style={common.page} testID="settings-screen">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[common.content, { paddingTop: 38 }]}>
          <Text accessibilityRole="header" style={common.title}>
            Settings
          </Text>
          <Text style={common.subtitle}>让电脑上的 Codex，随身可用。</Text>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>连接</Text>
            <Text style={styles.help}>
              手机与电脑连接同一局域网。在电脑启动服务后，填写服务地址与配对密钥。
            </Text>
            <View style={{ marginTop: 28 }}>
              <Text style={common.label}>服务地址</Text>
              <TextInput
                accessibilityLabel="服务地址"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={server}
                onChangeText={setServer}
                placeholder="ws://192.168.0.5:8787"
                placeholderTextColor="#aaa"
                style={common.field}
              />
            </View>
            <View style={{ marginTop: 26 }}>
              <View style={styles.keyHeading}>
                <Text style={[common.label, { marginBottom: 0 }]}>配对密钥</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showKey ? '隐藏密钥' : '显示密钥'}
                  onPress={() => setShowKey(!showKey)}
                  hitSlop={10}
                >
                  <Text style={styles.showKey}>{showKey ? '隐藏' : '显示'}</Text>
                </Pressable>
              </View>
              <TextInput
                accessibilityLabel="配对密钥"
                autoCapitalize="none"
                autoCorrect={false}
                value={token}
                onChangeText={setToken}
                secureTextEntry={!showKey}
                placeholder="电脑服务生成的密钥"
                placeholderTextColor="#aaa"
                style={common.field}
              />
            </View>
            {!!error && <Text style={[common.error, { marginTop: 16 }]}>{error}</Text>}
            <Button
              label={busy ? '保存中…' : '保存并连接'}
              onPress={save}
              disabled={busy}
              style={{ marginTop: 27 }}
            />
            <View style={styles.status}>
              <View
                style={[
                  styles.dot,
                  state.status === 'connected' && { backgroundColor: palette.ink },
                ]}
              />
              <Text style={styles.statusText}>{status}</Text>
              {connection && state.status !== 'connected' && (
                <Pressable accessibilityRole="button" onPress={() => client?.connect()}>
                  <Text style={styles.retry}>重试</Text>
                </Pressable>
              )}
            </View>
            {state.status === 'error' && <Text style={common.error}>{state.error}</Text>}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>电脑</Text>
            {!state.devices.length && (
              <Text style={[styles.help, { marginTop: 15 }]}>连接后，这里会显示已添加的电脑。</Text>
            )}
            {state.devices.map((device) => (
              <View key={device.id} style={styles.device}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.platform}>
                    {device.platform === 'linux'
                      ? 'Linux'
                      : device.platform === 'darwin'
                        ? 'macOS'
                        : device.platform === 'win32'
                          ? 'Windows'
                          : device.platform}
                  </Text>
                </View>
                <Text style={[styles.deviceState, device.online && { color: palette.ink }]}>
                  {device.online ? '在线' : '离线'}
                </Text>
              </View>
            ))}
            {connection && (
              <Button
                label="断开连接"
                onPress={onDisconnect}
                subtle
                style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: 18 }}
              />
            )}
          </View>
          <Text style={styles.footer}>Codex Remote · 0.1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  section: {
    paddingTop: 38,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: palette.ink },
  help: { fontSize: 13, lineHeight: 22, color: palette.muted, marginTop: 12 },
  keyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  showKey: { color: palette.muted, fontSize: 12 },
  status: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 7 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#bbb' },
  statusText: { color: palette.muted, fontSize: 12 },
  retry: { fontSize: 12, color: palette.ink, marginLeft: 10 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomColor: palette.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deviceName: { fontSize: 15, fontWeight: '500', color: palette.ink },
  platform: { fontSize: 12, color: palette.muted, marginTop: 5 },
  deviceState: { fontSize: 12, color: palette.muted },
  footer: { color: '#aaa', fontSize: 11, marginTop: 28 },
});
