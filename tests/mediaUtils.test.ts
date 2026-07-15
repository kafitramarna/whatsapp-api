jest.mock('../src/lib/ssrfGuard', () => ({
  safeFetch: jest.fn(),
  validateUrl: jest.fn(),
}));

jest.mock('../src/config/env', () => ({
  env: {
    isDev: true,
    isProd: false,
  },
}));

import { prepareMediaBuffer, buildMediaContent } from '../src/lib/mediaUtils';
import { safeFetch } from '../src/lib/ssrfGuard';

describe('Media Utils', () => {
  describe('prepareMediaBuffer', () => {
    it('should parse base64 data', async () => {
      const result = await prepareMediaBuffer('aGVsbG8=');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.toString()).toBe('hello');
    });

    it('should parse base64 with data URI prefix', async () => {
      const result = await prepareMediaBuffer('data:image/png;base64,aGVsbG8=');
      expect(result.buffer.toString()).toBe('hello');
    });

    it('should fetch from URL via safeFetch', async () => {
      (safeFetch as jest.Mock).mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(5)),
        headers: { get: () => 'image/png' },
      });

      const result = await prepareMediaBuffer('https://example.com/image.png');
      expect(safeFetch).toHaveBeenCalledWith('https://example.com/image.png');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.mimetype).toBe('image/png');
    });
  });

  describe('buildMediaContent', () => {
    const buffer = Buffer.from('test');

    it('should build image content', () => {
      const content = buildMediaContent('image', buffer, 'image/jpeg', 'caption');
      expect(content.image).toBe(buffer);
      expect(content.caption).toBe('caption');
      expect(content.mimetype).toBe('image/jpeg');
    });

    it('should build video content', () => {
      const content = buildMediaContent('video', buffer);
      expect(content.video).toBe(buffer);
      expect(content.mimetype).toBe('video/mp4');
    });

    it('should build document content with filename', () => {
      const content = buildMediaContent('document', buffer, 'application/pdf', undefined, 'doc.pdf');
      expect(content.document).toBe(buffer);
      expect(content.fileName).toBe('doc.pdf');
      expect(content.mimetype).toBe('application/pdf');
    });

    it('should build audio content', () => {
      const content = buildMediaContent('audio', buffer);
      expect(content.audio).toBe(buffer);
      expect(content.mimetype).toBe('audio/mpeg');
      expect(content.ptt).toBe(false);
    });

    it('should build sticker content with isAnimated flag', () => {
      const content = buildMediaContent('sticker', buffer, 'image/webp', undefined, undefined, true);
      expect(content.sticker).toBe(buffer);
      expect(content.mimetype).toBe('image/webp');
      expect(content.isAnimated).toBe(true);
    });

    it('should default isAnimated to false for stickers', () => {
      const content = buildMediaContent('sticker', buffer);
      expect(content.isAnimated).toBe(false);
    });

    it('should throw for invalid media type', () => {
      expect(() => buildMediaContent('invalid', buffer)).toThrow('Invalid media type');
    });
  });
});
