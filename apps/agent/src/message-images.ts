import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function markdownImageSources(text: string): string[] {
  // Ignore fenced code examples; only actual image references authorize reads.
  const body = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
  return [...body.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g)]
    .map((match) => match[1] ?? match[2]);
}

export function itemImages(item: any): { source: string; name: string }[] {
  const images: { source: string; name: string }[] = [];
  const add = (source: unknown, name?: string) => {
    if (typeof source === 'string' && source) images.push({ source,
      name: name || (source.startsWith('data:') ? '工具图片' : basename(source.replace(/\\/g, '/'))) || '图片' });
  };
  const content = (values: any[]) => {
    for (const value of values) {
      if (value.type === 'localImage') add(value.path);
      else if (value.type === 'image') {
        if (value.data && value.mimeType) add(`data:${value.mimeType};base64,${value.data}`);
        else add(value.url ?? value.imageUrl ?? value.path);
      }
    }
  };
  if (item.type === 'userMessage') content(item.content ?? []);
  if (item.type === 'imageView') add(item.path);
  if (item.type === 'imageGeneration') {
    if (item.savedPath) add(item.savedPath, '生成的图片');
    else if (item.result) add(`data:image/png;base64,${item.result}`, '生成的图片');
  }
  if (item.type === 'mcpToolCall') content(item.result?.content ?? []);
  if (item.type === 'dynamicToolCall') content(item.contentItems ?? []);
  return images;
}

export function imagePath(source: string, cwd: string): string {
  let path = source;
  if (path.startsWith('file:')) return fileURLToPath(path);
  if (path.startsWith('sandbox:')) path = path.slice('sandbox:'.length);
  try { path = decodeURIComponent(path); } catch { /* Native paths may contain literal %. */ }
  if (process.platform === 'win32' && path.startsWith('/')) {
    const distro = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)/i.exec(cwd)?.[1];
    if (distro) return `\\\\wsl.localhost\\${distro}${path.replace(/\//g, '\\')}`;
  }
  return resolve(cwd, path);
}

export function imageMime(data: Buffer): string | null {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
