import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Device } from '@codex-remote/protocol';
import type { ClientState, Connection, RemoteClient } from './client';
import { ConnectionForm } from './ConnectionForm';
import { computerStatus, connectionError } from './connection-state';
import { Icon } from './icons';
import { useUI, useThemedStyles, type Palette } from './ui';

export function DeviceConnectionDetail({
  device,
  connection,
  state,
  client,
  onSave,
  onClose,
}: {
  device: Device;
  connection: Connection | null;
  state: ClientState;
  client: RemoteClient | null;
  onSave: (connection: Connection) => Promise<void>;
  onClose: () => void;
}) {
  const { palette, common } = useUI();
  const styles = useThemedStyles(createStyles);
  const status = computerStatus(state, device);
  const connectionStatus = {
    connected: '服务已连接',
    connecting: '正在连接服务…',
    reconnecting: '正在重新连接服务…',
    disconnected: '服务尚未连接',
    error: '连接未通过验证',
  }[state.status];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={common.page}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={
            Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
          }
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <View style={common.content} testID="device-connection-details">
              <View style={styles.heading}>
                <Text accessibilityRole="header" style={styles.title}>
                  {device.name} 的连接
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="关闭连接详情"
                  onPress={onClose}
                  style={styles.close}
                >
                  <Icon name="close" size={21} color={palette.ink} />
                </Pressable>
              </View>
              <Text style={[styles.status, status === '在线' && { color: palette.ink }]}>
                {status}
              </Text>
              <Text style={styles.help}>
                此电脑使用下方的连接信息。修改密钥只会重连这个服务，其他电脑保持连接。
              </Text>
              <ConnectionForm connection={connection} onSave={onSave} />
              <View style={styles.connectionStatus}>
                <Text style={styles.help}>{connectionStatus}</Text>
                {connection && state.status !== 'connected' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="重新连接服务"
                    onPress={() => client?.connect()}
                    style={styles.retry}
                  >
                    <Text style={styles.retryText}>重试连接</Text>
                  </Pressable>
                )}
                {!!state.error && (
                  <Text selectable style={common.error}>
                    {connectionError(new Error(state.error), [connection?.token])}
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    scroll: { paddingTop: 22, paddingBottom: 40 },
    heading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    title: { fontSize: 24, lineHeight: 32, fontWeight: '600', color: palette.ink, flex: 1 },
    close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    status: { fontSize: 12, color: palette.muted, marginTop: 14 },
    help: { fontSize: 13, lineHeight: 22, color: palette.muted, marginTop: 14 },
    connectionStatus: {
      marginTop: 24,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: palette.line,
    },
    retry: { alignSelf: 'flex-start', paddingVertical: 13 },
    retryText: { fontSize: 13, color: palette.ink },
  });
