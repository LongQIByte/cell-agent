import React, { useEffect, useState } from 'react';
import { Image, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ResumableZoom } from 'react-native-zoom-toolkit';
import { Button } from './ui';

export function ImagePreview({ uri, name, closeLabel = '关闭图片预览', onClose }: {
  uri: string; name: string; closeLabel?: string; onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    Image.getSize(uri, (width, height) => { if (alive) setResolution({ width, height }); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [uri]);
  const scale = resolution ? Math.min((width - 32) / resolution.width, (height - 160) / resolution.height) : 1;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <GestureHandlerRootView style={styles.overlay}>
      <View style={styles.viewer}>
        {resolution && !failed && <ResumableZoom key={uri} extendGestures maxScale={Math.max(6, 1 / scale)} panMode="clamp" pinchMode="clamp" scaleMode="clamp">
          <Image accessibilityLabel={`大图 ${name}`} source={{ uri }} resizeMode="contain" resizeMethod="scale"
            style={{ width: resolution.width * scale, height: resolution.height * scale }} onError={() => setFailed(true)} />
        </ResumableZoom>}
        {failed && <Text style={styles.name}>无法显示图片，请关闭后重试</Text>}
      </View>
      <Text style={styles.name}>{name}</Text>
      <Button label={closeLabel} onPress={onClose} />
    </GestureHandlerRootView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 16, paddingTop: 48, paddingBottom: 32, backgroundColor: '#000e', alignItems: 'center', gap: 16 },
  viewer: { flex: 1, width: '100%', overflow: 'hidden' },
  name: { color: '#fff', fontSize: 13 },
});
