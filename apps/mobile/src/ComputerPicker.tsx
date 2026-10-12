import React, { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Device } from '@codex-remote/protocol';
import { Icon } from './icons';
import { useUI, useThemedStyles, type Palette } from './ui';

export function ComputerPicker({ devices, selectedId, onSelect, onClose }: {
  devices: Device[];
  selectedId: string;
  onSelect: (device: Device) => void;
  onClose: () => void;
}) {
  const { palette, scheme } = useUI();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return devices.filter((device) => `${device.name} ${device.platform}`.toLocaleLowerCase().includes(needle));
  }, [devices, query]);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View accessibilityViewIsModal style={styles.sheet} testID="computer-picker">
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>选择电脑</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭电脑选择" onPress={onClose} hitSlop={10}>
              <Icon name="close" size={22} />
            </Pressable>
          </View>
          <View style={styles.search}>
            <Icon name="search" size={17} color={palette.muted} />
            <TextInput
              accessibilityLabel="搜索电脑"
              placeholder="搜索电脑名称或系统"
              placeholderTextColor={palette.muted}
                keyboardAppearance={scheme}
              autoCapitalize="none"
              autoCorrect={false}
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
            />
          </View>
          <FlatList
            testID="computer-options"
            data={filtered}
            keyExtractor={(device) => device.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item: device }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={`选择电脑 ${device.name}，${device.platform}，${device.online ? '在线' : '未知'}`}
                accessibilityState={{ checked: selectedId === device.id, selected: selectedId === device.id, disabled: !device.online }}
                aria-checked={selectedId === device.id}
                aria-selected={selectedId === device.id}
                disabled={!device.online}
                onPress={() => onSelect(device)}
                style={({ pressed }) => [styles.deviceRow, selectedId === device.id && styles.selected, !device.online && styles.offline, pressed && { backgroundColor: palette.soft }]}
              >
                <View style={styles.deviceText}>
                  <Text style={styles.deviceName} numberOfLines={1}>{device.name}</Text>
                  <Text style={styles.detail} numberOfLines={1}>{device.platform} · {device.online ? '在线' : '未知'}</Text>
                </View>
                {selectedId === device.id && <Icon name="check" size={18} />}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>{devices.length ? '没有找到匹配的电脑' : '暂无已连接的电脑'}</Text>}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0005', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 450, maxHeight: '80%', alignSelf: 'center', backgroundColor: palette.background, padding: 20, borderRadius: 12 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 20, fontWeight: '600', color: palette.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 12 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 28, padding: 0, color: palette.ink, fontSize: 14 },
  list: { flexGrow: 0, maxHeight: 320, marginTop: 10 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', minHeight: 62, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8 },
  deviceText: { flex: 1, minWidth: 0, marginRight: 10 },
  deviceName: { color: palette.ink, fontSize: 15 },
  detail: { fontSize: 12, color: palette.muted, marginTop: 4 },
  selected: { backgroundColor: palette.soft },
  offline: { opacity: 0.5 },
  empty: { color: palette.muted, fontSize: 14, paddingVertical: 24, paddingHorizontal: 10 },
});
