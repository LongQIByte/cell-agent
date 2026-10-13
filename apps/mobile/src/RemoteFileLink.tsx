import React, { useContext, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { RemoteClient } from './client';
import { MessageImageContext } from './ChatImage';
import { ImagePreview } from './ImagePreview';
import { openRemoteFile, closeRemoteFile, type RemoteFile } from './remote-file';
import { Button, useUI } from './ui';

function RemoteVideo({ file }: { file: RemoteFile }) {
  const [error, setError] = useState('');
  const player = useVideoPlayer(file.uri, (player) => { player.play(); });
  useEffect(() => {
    const listener = player.addListener('statusChange', (event) => {
      if (event.status === 'error') setError('此设备无法播放该视频格式，可下载后用其他应用打开');
    });
    return () => listener.remove();
  }, [player]);
  return <><VideoView player={player} style={{ width: '100%', flex: 1 }} nativeControls allowsFullscreen />
    {!!error && <Text style={{ color: '#fff' }}>{error}</Text>}</>;
}

function FileViewer({ client, deviceId, threadId, source, onClose }: {
  client: RemoteClient; deviceId: string; threadId: string; source: string; onClose: () => void;
}) {
  const [file, setFile] = useState<RemoteFile | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const download = useRef<FileSystem.DownloadResumable | XMLHttpRequest | null>(null);
  const alive = useRef(true);
  const acquired = useRef<RemoteFile | null>(null);
  useEffect(() => {
    alive.current = true;
    void openRemoteFile(client, deviceId, threadId, source).then((file) => {
      if (!alive.current) { closeRemoteFile(client, file); return; }
      acquired.current = file; setFile(file);
    }).catch((error: Error) => { if (alive.current) setError(error.message); });
    return () => {
      alive.current = false;
      if (Platform.OS === 'web' && download.current) (download.current as XMLHttpRequest).abort();
      else void (download.current as FileSystem.DownloadResumable | null)?.cancelAsync().catch(() => {});
      if (acquired.current) closeRemoteFile(client, acquired.current);
    };
  }, [client, deviceId, threadId, source]);
  async function save() {
    if (!file) return;
    setError(''); setProgress(0);
    try {
      if (Platform.OS === 'web') {
        const xhr = new XMLHttpRequest(); download.current = xhr;
        const blob = await new Promise<Blob>((resolve, reject) => {
          xhr.open('GET', `${file.uri}?download=1`); xhr.responseType = 'blob';
          xhr.onprogress = (event) => { if (alive.current) setProgress(event.loaded / Math.max(1, file.size)); };
          xhr.onload = () => xhr.status === 200 ? resolve(xhr.response) : reject(new Error('下载失败，请重新打开文件'));
          xhr.onerror = () => reject(new Error('传输失败，请检查电脑连接')); xhr.onabort = () => reject(new Error('已取消下载')); xhr.send();
        });
        if (!alive.current) return;
        const uri = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = uri; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(uri), 60000);
      } else {
        const directory = `${FileSystem.cacheDirectory}remote-files/`; await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        const path = `${directory}${file.ticket}-${file.name.replace(/[^\w.\u4e00-\u9fff-]/g, '_')}`;
        const task = FileSystem.createDownloadResumable(`${file.uri}?download=1`, path, {}, (event) => {
          if (alive.current) setProgress(event.totalBytesWritten / Math.max(1, file.size));
        }); download.current = task;
        try {
          const result = await task.downloadAsync();
          if (!alive.current) return;
          if (!result || result.status !== 200) throw new Error('下载失败，请重新打开文件');
          if (!await Sharing.isAvailableAsync()) throw new Error('此设备没有可用的文件打开方式');
          await Sharing.shareAsync(path, { mimeType: file.mimeType, dialogTitle: `打开 ${file.name}` });
        } finally { await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {}); }
      }
    } catch (error: any) { if (alive.current) setError(error.message); }
    finally { download.current = null; if (alive.current) setProgress(null); }
  }
  if (file?.mimeType.startsWith('image/')) return <ImagePreview uri={file.uri} name={file.name} onClose={onClose} />;
  return <Modal visible transparent onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: '#000e', padding: 24, paddingTop: 48, paddingBottom: 32, gap: 16, alignItems: 'center' }}>
      <Text style={{ color: '#fff' }}>{file?.name || '正在读取远程文件…'}</Text>
      {file?.mimeType.startsWith('video/') && <RemoteVideo file={file} />}
      {file && !file.mimeType.startsWith('video/') && <Text style={{ color: '#fff', flex: 1 }}>{(file.size / 1024 / 1024).toFixed(1)} MB · 下载后使用其他应用打开</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: '#ffb0b0' }}>{error}</Text>}
      {progress !== null && <Text style={{ color: '#fff' }}>下载中 {Math.round(progress * 100)}%</Text>}
      {file && <Button label="下载并打开文件" disabled={progress !== null} onPress={() => void save()} />}
      <Button label={progress === null ? '关闭文件预览' : '取消下载并关闭'} onPress={onClose} />
    </View>
  </Modal>;
}

export function RemoteFileLink({ source, children, style }: { source: string; children: React.ReactNode; style?: any }) {
  const connection = useContext(MessageImageContext);
  const { common } = useUI();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  return <>
    <Text accessibilityRole="link" style={style} onPress={() => {
      if (!connection?.client || !connection.online) { setError('电脑已离线，请连接后再打开文件'); return; }
      setError(''); setVisible(true);
    }}>{children}</Text>
    {!!error && <Text style={common.error}>{error}</Text>}
    {visible && connection?.client && <FileViewer {...connection} client={connection.client} source={source} onClose={() => setVisible(false)} />}
  </>;
}
