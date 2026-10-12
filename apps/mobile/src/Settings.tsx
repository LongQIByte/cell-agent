import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RemoteClient, ClientState, Connection } from './client';
import { Button, useUI, useThemedStyles, type Palette } from './ui';
import { GeneralSettings } from './GeneralSettings';
import { ConnectionForm } from './ConnectionForm';
import { DeviceConnectionDetail } from './DeviceConnectionDetail';
import { computerStatus } from './connection-state';
import { Icon } from './icons';
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
  const { palette, common } = useUI();
  const styles = useThemedStyles(createStyles);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const selectedDevice = state.devices.find((device) => device.id === selectedDeviceId);
  return (
    <View style={common.page} testID="settings-screen">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[common.content, { paddingTop: 38 }]}>
          <Text accessibilityRole="header" style={common.title}>
            Settings
          </Text>
          <Text style={common.subtitle}>让电脑上的 Codex，随身可用。</Text>
          <GeneralSettings />
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>连接</Text>
            <Text style={styles.help}>
              手机与电脑连接同一局域网。在电脑启动服务后，填写服务地址与配对密钥。
            </Text>
            <ConnectionForm connection={connection} onSave={onSave} />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>我的电脑</Text>
            {!state.devices.length && (
              <Text style={[styles.help, { marginTop: 15 }]}>连接后，这里会显示已添加的电脑。</Text>
            )}
            {state.devices.map((device) => (
              <Pressable
                key={device.id}
                accessibilityRole="button"
                accessibilityLabel={`查看电脑 ${device.name} 的连接，${computerStatus(state, device)}`}
                onPress={() => setSelectedDeviceId(device.id)}
                style={({ pressed }) => [styles.device, pressed && { opacity: 0.6 }]}
              >
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
                <Text
                  style={[
                    styles.deviceState,
                    computerStatus(state, device) === '在线' && { color: palette.ink },
                  ]}
                >
                  {computerStatus(state, device)}
                </Text>
                <View style={{ transform: [{ rotate: '-90deg' }], marginLeft: 10 }}>
                  <Icon name="chevron" size={13} color={palette.muted} />
                </View>
              </Pressable>
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
          <Text style={styles.footer}>Codex Remote</Text>
        </View>
      </ScrollView>
      {selectedDevice && (
        <DeviceConnectionDetail
          key={selectedDevice.id}
          device={selectedDevice}
          connection={connection}
          state={state}
          client={client}
          onSave={onSave}
          onClose={() => setSelectedDeviceId(null)}
        />
      )}
    </View>
  );
}
const createStyles = (palette: Palette) =>
  StyleSheet.create({
    section: {
      paddingTop: 38,
      paddingBottom: 28,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: palette.ink },
    help: { fontSize: 13, lineHeight: 22, color: palette.muted, marginTop: 12 },
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
    footer: { color: palette.muted, fontSize: 11, marginTop: 28 },
  });
