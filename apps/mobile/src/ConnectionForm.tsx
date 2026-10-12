import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Connection } from './client';
import { connectionError, savedConnection } from './connection-state';
import { Button, useUI, useThemedStyles, type Palette } from './ui';

export function ConnectionForm({
  connection,
  onSave,
}: {
  connection: Connection | null;
  onSave: (connection: Connection) => Promise<void>;
}) {
  const { palette, common, scheme } = useUI();
  const styles = useThemedStyles(createStyles);
  const [server, setServer] = useState(
    connection?.server ?? (Platform.OS === 'web' ? window.location.origin : ''),
  );
  const [token, setToken] = useState(connection?.token ?? '');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = !!connection && server === connection.server && token === connection.token && !busy;
  useEffect(() => {
    setServer(connection?.server ?? (Platform.OS === 'web' ? window.location.origin : ''));
    setToken(connection?.token ?? '');
    setShowKey(false);
    setError('');
  }, [connection?.server, connection?.token]);
  async function save() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const value = savedConnection(server, token);
      await onSave(value);
      setServer(value.server);
      setToken(value.token);
      setShowKey(false);
    } catch (error) {
      setError(connectionError(error, [token, connection?.token]));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <View style={{ marginTop: 28 }}>
        <Text style={common.label}>服务地址</Text>
        <TextInput
          accessibilityLabel="服务地址"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
          value={server}
          onChangeText={setServer}
          placeholder="ws://192.168.0.5:8787"
          placeholderTextColor={palette.muted}
          keyboardAppearance={scheme}
          style={common.field}
        />
      </View>
      <View style={{ marginTop: 26 }}>
        <View style={styles.keyHeading}>
          <Text style={[common.label, { marginBottom: 0 }]}>配对密钥</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showKey ? '隐藏密钥' : '显示密钥'}
            onPress={() => setShowKey((previous) => !previous)}
            hitSlop={10}
          >
            <Text style={styles.showKey}>{showKey ? '隐藏' : '显示'}</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="配对密钥"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
          value={token}
          onChangeText={setToken}
          secureTextEntry={!showKey}
          placeholder="电脑服务生成的密钥"
          placeholderTextColor={palette.muted}
          keyboardAppearance={scheme}
          style={common.field}
        />
      </View>
      {!!error && <Text style={[common.error, { marginTop: 16 }]}>{error}</Text>}
      <Button
        label={busy ? '保存中…' : '保存连接'}
        accessibilityLabel="保存连接"
        onPress={save}
        disabled={busy}
        style={{ marginTop: 27 }}
      />
      {saved && (
        <Text accessibilityLiveRegion="polite" style={styles.saved} testID="connection-saved">
          已保存连接
        </Text>
      )}
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    keyHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 9,
    },
    showKey: { color: palette.muted, fontSize: 12 },
    saved: { color: palette.secondary, fontSize: 12, marginTop: 15 },
  });
