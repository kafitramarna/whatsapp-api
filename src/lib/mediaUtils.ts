/**
 * Media Utilities
 *
 * Shared functions for preparing media buffers and building Baileys message content.
 * Used by sessionController, groupController, and schedulerService.
 */

import { safeFetch } from './ssrfGuard';
import { env } from '../config/env';

const MIME_MAP: Record<string, string> = {
  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
  'mp4': 'video/mp4', '3gp': 'video/3gpp', 'mov': 'video/quicktime',
  'pdf': 'application/pdf', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav',
};

export interface MediaItem {
  type: 'image' | 'video' | 'document' | 'audio' | 'sticker';
  data: string;
  caption?: string;
  filename?: string;
  mimetype?: string;
  isAnimated?: boolean;
  viewOnce?: boolean;
  ptt?: boolean;
  quality?: 'standard' | 'hd';
}

export interface PreparedMedia {
  buffer: Buffer;
  mimetype?: string;
}

/**
 * Prepare media buffer from URL, local file path, or base64 string.
 * Uses SSRF protection for URL fetching. Blocks local file paths in production.
 */
export async function prepareMediaBuffer(mediaData: string): Promise<PreparedMedia> {
  // HTTP/HTTPS URL — with SSRF protection
  if (mediaData.startsWith('http://') || mediaData.startsWith('https://')) {
    const response = await safeFetch(mediaData);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type');
    return { buffer: Buffer.from(arrayBuffer), mimetype: contentType || undefined };
  }

  // Local file path (file:// protocol or absolute path) — blocked in production
  if (mediaData.startsWith('file://') || mediaData.match(/^[a-zA-Z]:[/\\]/) || mediaData.startsWith('/')) {
    if (env.isProd) {
      throw new Error('Local file paths are not allowed in production. Use base64 or URL instead.');
    }
    const { readFile } = await import('fs/promises');
    const { fileURLToPath } = await import('url');

    let filePath = mediaData;
    if (mediaData.startsWith('file://')) {
      filePath = fileURLToPath(mediaData);
    }

    const buffer = await readFile(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase();
    return { buffer, mimetype: ext ? MIME_MAP[ext] : undefined };
  }

  // Assume base64
  const base64Data = mediaData.includes(',') ? mediaData.split(',')[1] : mediaData;
  return { buffer: Buffer.from(base64Data, 'base64') };
}

/**
 * Build Baileys message content from media type and buffer.
 */
export function buildMediaContent(
  type: string,
  buffer: Buffer,
  mimetype?: string,
  caption?: string,
  filename?: string,
  isAnimated?: boolean,
  viewOnce?: boolean,
  ptt?: boolean,
  quality?: 'standard' | 'hd'
): Record<string, unknown> {
  switch (type) {
    case 'image':
      return {
        image: buffer,
        caption,
        mimetype: mimetype || 'image/jpeg',
        viewOnce: viewOnce || false,
        ...(quality === 'hd' ? { jpegQuality: 100 } : {}),
      };
    case 'video':
      return { video: buffer, caption, mimetype: mimetype || 'video/mp4', viewOnce: viewOnce || false };
    case 'document':
      return { document: buffer, fileName: filename || 'document', caption, mimetype: mimetype || 'application/octet-stream' };
    case 'audio':
      return { audio: buffer, mimetype: mimetype || 'audio/mpeg', ptt: ptt ?? false };
    case 'sticker':
      return { sticker: buffer, mimetype: mimetype || 'image/webp', isAnimated: isAnimated || false };
    default:
      throw new Error(`Invalid media type: ${type}`);
  }
}
