import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { readCache, saveCache } from './storage';
import { recentImages, recentImageTime, type RecentImage } from './recent-image-state';
const HANDLED_KEY = 'recent-images:handled';
let handledWrite = Promise.resolve();
export async function findRecentImages(): Promise<RecentImage[]> {
  // Discovery never opens a permission dialog on returning to a conversation.
  const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (!permission.granted) return [];
  const page = await MediaLibrary.getAssetsAsync({ first: 20, mediaType: MediaLibrary.MediaType.photo,
    sortBy: [MediaLibrary.SortBy.modificationTime] });
  await handledWrite;
  return recentImages(page.assets.map((image) => ({ ...image, creationTime: recentImageTime(image) })), await readCache<string[]>(HANDLED_KEY) ?? []);
}
export async function allowRecentImages() {
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  return permission.granted;
}
export async function resolveRecentImage(image: RecentImage) {
  const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (!permission.granted) throw new Error('请在系统设置中允许 Codex Remote 读取照片，或使用添加附件选择图片');
  // Android discovery already supplies a readable file URI. AssetInfo also reads
  // GPS EXIF, which requires a separate location permission we do not need.
  const info = Platform.OS === 'android' ? image : await MediaLibrary.getAssetInfoAsync(image.id);
  const uri = 'localUri' in info ? info.localUri : info.uri;
  if (!uri) throw new Error('这张照片尚未下载到手机，请使用添加附件选择');
  return { uri, name: info.filename, mimeType: /\.png$/i.test(info.filename) ? 'image/png' : /\.webp$/i.test(info.filename) ? 'image/webp' : /\.heic$/i.test(info.filename) ? 'image/heic' : 'image/jpeg' };
}
export function handleRecentImages(images: RecentImage[]) {
  const saved = handledWrite.catch(() => {}).then(async () => {
    const previous = await readCache<string[]>(HANDLED_KEY) ?? [];
    await saveCache(HANDLED_KEY, [...new Set([...previous, ...images.map((image) => image.id)])].slice(-500));
  });
  handledWrite = saved;
  return saved;
}
