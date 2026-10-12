import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecentSession } from '@codex-remote/protocol';
import { Button, useThemedStyles, useUI, type Palette } from './ui';

export function SessionActions({ entry, pinned, pinReady, archived, archiveDisabled, onPin, onArchive, onRestore, onClose }: {
  entry: RecentSession;
  pinned: boolean;
  pinReady: boolean;
  archived: boolean;
  archiveDisabled: boolean;
  onPin: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const { common } = useUI();
  const styles = useThemedStyles(createStyles);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.panel} accessibilityViewIsModal testID="session-actions">
          <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>{entry.session.name}</Text>
          <Button
            label={pinned ? '取消置顶' : '置顶'}
            accessibilityLabel={`${pinned ? '取消置顶' : '置顶'}会话 ${entry.session.name}`}
            disabled={!pinReady}
            onPress={onPin}
            subtle
            style={styles.action}
          />
          {!pinReady && <Text style={common.subtitle}>正在读取置顶设置…</Text>}
          <Button
            label={archived ? '恢复会话' : '归档'}
            accessibilityLabel={`${archived ? '恢复' : '归档'}会话 ${entry.session.name}`}
            disabled={archiveDisabled}
            onPress={archived ? onRestore : onArchive}
            subtle
            style={styles.action}
          />
          <Button label="取消" accessibilityLabel="关闭会话管理" subtle onPress={onClose} style={styles.cancel} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0005', justifyContent: 'center', alignItems: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 420, padding: 20, borderRadius: 14, backgroundColor: palette.background },
  title: { color: palette.ink, fontSize: 19, lineHeight: 28, fontWeight: '600', marginBottom: 14 },
  action: { alignItems: 'flex-start', paddingHorizontal: 12 },
  cancel: { marginTop: 10 },
});
