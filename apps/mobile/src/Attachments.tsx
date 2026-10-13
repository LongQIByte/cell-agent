import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { UploadedFile } from '@codex-remote/protocol';
import { Button, useThemedStyles, useUI, type Palette } from './ui';
import { Icon } from './icons';

export function Attachments({ files, uploading, onRemove }: {
  files: UploadedFile[]; uploading: boolean; onRemove: (id: string) => void;
}) {
  const { palette } = useUI();
  const styles = useThemedStyles(createStyles);
  const [preview, setPreview] = useState<UploadedFile | null>(null);
  if (!files.length && !uploading) return null;
  return <>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator contentContainerStyle={styles.files} testID="draft-attachments">
      {files.map((file) => <View key={file.id} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={`预览附件 ${file.name}`} disabled={!file.previewUri} onPress={() => setPreview(file)} style={styles.imageButton}>
          {file.previewUri ? <Image accessibilityLabel={`照片 ${file.name}`} source={{ uri: file.previewUri }} resizeMode="contain" style={styles.image} />
            : <Icon name="attach" size={24} color={palette.secondary} />}
        </Pressable>
        <Text numberOfLines={1} style={styles.name}>{file.name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`移除附件 ${file.name}`} onPress={() => { onRemove(file.id); if (preview?.id === file.id) setPreview(null); }} style={styles.remove}>
          <Icon name="close" size={14} color={palette.onInk} />
        </Pressable>
      </View>)}
      {uploading && <Text style={styles.name}>上传中…</Text>}
    </ScrollView>
    <Modal visible={preview !== null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
      <View style={styles.overlay}>
        {preview?.previewUri && <Image source={{ uri: preview.previewUri }} resizeMode="contain" style={styles.preview} />}
        <Text style={styles.previewName}>{preview?.name}</Text>
        <Button label="关闭照片预览" onPress={() => setPreview(null)} />
      </View>
    </Modal>
  </>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  files: { gap: 10, paddingVertical: 10, paddingRight: 6 },
  card: { width: 88, padding: 5, backgroundColor: palette.soft, borderRadius: 12 },
  imageButton: { width: 78, height: 70, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%', borderRadius: 8 },
  name: { fontSize: 10, color: palette.secondary, marginTop: 5 },
  remove: { position: 'absolute', right: 0, top: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, padding: 20, backgroundColor: '#000e', justifyContent: 'center', alignItems: 'center', gap: 16 },
  preview: { width: '100%', height: '75%' },
  previewName: { fontSize: 13, color: '#fff' },
});
