import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { RemoteClient } from './client';
import { Button, useUI, useThemedStyles, type Palette } from './ui';

export const MessageImageContext = createContext<{
  client: RemoteClient | null; deviceId: string; threadId: string; online: boolean;
} | null>(null);

export function ChatImage({ source, name = '图片' }: { source: string; name?: string }) {
  const connection = useContext(MessageImageContext);
  const { palette } = useUI();
  const styles = useThemedStyles(createStyles);
  const { width: screenWidth } = useWindowDimensions();
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const maxWidth = Math.max(1, Math.min(260, screenWidth * 0.88 - 64));
  const scale = dimensions ? Math.min(maxWidth / dimensions.width, 220 / dimensions.height) : 1;
  const size = dimensions ? { width: dimensions.width * scale, height: dimensions.height * scale }
    : { width: maxWidth, height: 120 };
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const client = connection?.client;
  const threadId = connection?.threadId;
  const deviceId = connection?.deviceId;
  const online = connection?.online;
  useEffect(() => {
    let alive = true;
    setUri(null); setFailed(false); setLoading(true);
    if (/^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(source)) setUri(source);
    else if (client && online && threadId && deviceId) {
      void client.request<{ mimeType: string; data: string }>('images/read', { threadId, source }, deviceId)
        .then((image) => { if (alive) setUri(`data:${image.mimeType};base64,${image.data}`); })
        .catch(() => { if (alive) { setFailed(true); setLoading(false); } });
    } else { setFailed(true); setLoading(false); }
    return () => { alive = false; };
  }, [source, client, online, threadId, deviceId, attempt]);
  useEffect(() => {
    let alive = true;
    setDimensions(null);
    if (uri) Image.getSize(uri, (width, height) => {
      if (alive && width > 0 && height > 0) setDimensions({ width, height });
    }, () => {});
    return () => { alive = false; };
  }, [uri]);
  return <View style={[styles.container, size]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${failed ? '重试图片' : '预览图片'} ${name}`}
      onPress={() => failed ? setAttempt((value) => value + 1) : uri && setPreview(true)} style={[styles.thumbnail, size]}>
      {uri && !failed && <Image key={attempt} accessibilityLabel={`聊天图片 ${name}`} source={{ uri }} resizeMode="contain" style={styles.image}
        onLoad={() => setLoading(false)} onError={() => { setFailed(true); setLoading(false); }} />}
      {loading && <ActivityIndicator style={StyleSheet.absoluteFill} color={palette.muted} />}
      {failed && <Text style={styles.hint}>图片加载失败，点击重试</Text>}
    </Pressable>
    <Modal visible={preview} transparent animationType="fade" onRequestClose={() => setPreview(false)}>
      <View style={styles.overlay}>
        {uri && <Image accessibilityLabel={`大图 ${name}`} source={{ uri }} resizeMode="contain" style={styles.preview} />}
        <Text style={styles.name}>{name}</Text>
        <Button label="关闭图片预览" onPress={() => setPreview(false)} />
      </View>
    </Modal>
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  container: { alignSelf: 'flex-start', marginVertical: 6 },
  thumbnail: { borderRadius: 12, overflow: 'hidden', backgroundColor: palette.soft, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%' },
  hint: { fontSize: 12, color: palette.muted },
  overlay: { flex: 1, padding: 20, backgroundColor: '#000e', justifyContent: 'center', alignItems: 'center', gap: 16 },
  preview: { width: '100%', height: '75%' },
  name: { fontSize: 13, color: '#fff' },
});
