import type { RecentImage } from './recent-image-state';
export async function findRecentImages(): Promise<RecentImage[]> { return []; }
export async function allowRecentImages() { return false; }
export async function resolveRecentImage(image: RecentImage) { return { uri: image.uri, name: image.filename, mimeType: 'image/jpeg' }; }
export async function handleRecentImages(_images: RecentImage[]) {}
