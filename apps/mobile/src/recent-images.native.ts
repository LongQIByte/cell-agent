import * as MediaLibrary from 'expo-media-library';
import { readCache, saveCache } from './storage';
import { recentImages, RECENT_IMAGE_WINDOW_MS, type RecentImage } from './recent-image-state';
const HANDLED_KEY = 'recent-images:handled';
export async function findRecentImages(): Promise<RecentImage[]> {
  // Discovery never opens a permission dialog on returning to a conversation.
  const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (!permission.granted) return [];
  const page = await MediaLibrary.getAssetsAsync({ first: 20, mediaType: MediaLibrary.MediaType.photo,
    sortBy: [MediaLibrary.SortBy.creationTime], createdAfter: Date.now() - RECENT_IMAGE_WINDOW_MS });
  return recentImages(page.assets, await readCache<string[]>(HANDLED_KEY) ?? []);
}
export async function allowRecentImages() {
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  return permission.granted;
}
export async function resolveRecentImage(image: RecentImage) {
  const info = await MediaLibrary.getAssetInfoAsync(image.id);
  if (!info.localUri) throw new Error('这张照片尚未下载到手机，请使用添加附件选择');
  return { uri: info.localUri, name: info.filename, mimeType: /\.png$/i.test(info.filename) ? 'image/png' : /\.webp$/i.test(info.filename) ? 'image/webp' : /\.heic$/i.test(info.filename) ? 'image/heic' : 'image/jpeg' };
}
export async function handleRecentImages(images: RecentImage[]) {
  const previous = await readCache<string[]>(HANDLED_KEY) ?? [];
  await saveCache(HANDLED_KEY, [...new Set([...previous, ...images.map((image) => image.id)])].slice(-500));
}
