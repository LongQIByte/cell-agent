import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ClientState, Connection } from './client';
import type { ConnectionHub } from './connection-hub';
import { Button, useUI, useThemedStyles, type Palette } from './ui';
import { GeneralSettings } from './GeneralSettings';
import { ConnectionForm } from './ConnectionForm';
import { DeviceConnectionDetail } from './DeviceConnectionDetail';
import { computerStatus } from './connection-state';
import { Icon } from './icons';
export function Settings({
  connection,
  connections,
  state,
  client,
  onSave,
  onSelect,
  onDisconnect,
}: {
  connection: Connection | null;
  connections: Connection[];
  state: ClientState;
  client: ConnectionHub;
  onSave: (connection: Connection) => Promise<void>;
  onSelect: (connection: Connection) => void;
  onDisconnect: (server: string) => Promise<void>;
}) {
  const { palette, common } = useUI();
  const styles = useThemedStyles(createStyles);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const selectedDevice = state.devices.find((device) => device.id === selectedDeviceId);
  const selectedRoute = selectedDevice ? client.route(selectedDevice.id) : null;
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
              填写电脑的服务地址与配对密钥。可以添加多个服务，同时连接多台电脑。
            </Text>
            <ConnectionForm connection={connection} onSave={onSave} />
            {connections.map((profile) => {
              const service = client.service(profile.server);
              return <View key={profile.server} style={styles.device}>
                <Pressable accessibilityRole="button" accessibilityLabel={`编辑服务 ${profile.server}`}
                  onPress={() => onSelect(profile)} style={{ flex: 1 }}>
                  <Text style={styles.platform}>{profile.server}</Text>
                  <Text style={styles.deviceState}>{service?.state.status === 'connected' ? '已连接' : profile.disabled ? '已断开' : '等待连接'}</Text>
                </Pressable>
                <Button subtle label={profile.disabled ? '重新连接' : '断开此连接'}
                  accessibilityLabel={`${profile.disabled ? '重新连接' : '断开'}服务 ${profile.server}`}
                  onPress={() => profile.disabled ? onSave({ server: profile.server, token: profile.token }) : onDisconnect(profile.server)} />
              </View>;
            })}
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
          </View>
          <Text style={styles.footer}>Codex Remote</Text>
        </View>
      </ScrollView>
      {selectedDevice && (
        <DeviceConnectionDetail
          key={selectedDevice.id}
          device={selectedDevice}
          connection={selectedRoute?.connection ?? connection}
          state={selectedRoute?.state ?? state}
          client={selectedRoute?.client ?? null}
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
