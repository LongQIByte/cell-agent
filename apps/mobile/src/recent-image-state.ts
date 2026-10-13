export const RECENT_IMAGE_WINDOW_MS = 5 * 60 * 1000;
export interface RecentImage { id: string; creationTime: number; uri: string; filename: string }
export function recentImages<T extends RecentImage>(images: T[], handled: readonly string[], now = Date.now()): T[] {
  const ignored = new Set(handled);
  return images.filter((image) => image.creationTime <= now && image.creationTime >= now - RECENT_IMAGE_WINDOW_MS && !ignored.has(image.id)).slice(0, 6);
}
