import { validateUrl, isPrivateIP } from '../src/lib/ssrfGuard';

describe('SSRF Guard', () => {
  describe('isPrivateIP', () => {
    it('should detect 10.x.x.x as private', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('10.255.255.255')).toBe(true);
    });

    it('should detect 172.16-31.x.x as private', () => {
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('172.31.255.255')).toBe(true);
    });

    it('should detect 192.168.x.x as private', () => {
      expect(isPrivateIP('192.168.0.1')).toBe(true);
      expect(isPrivateIP('192.168.1.100')).toBe(true);
    });

    it('should detect 127.x.x.x as private (loopback)', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('127.255.255.255')).toBe(true);
    });

    it('should detect 169.254.x.x as private (link-local/AWS metadata)', () => {
      expect(isPrivateIP('169.254.169.254')).toBe(true);
    });

    it('should detect 0.x.x.x as private', () => {
      expect(isPrivateIP('0.0.0.0')).toBe(true);
    });

    it('should NOT flag public IPs as private', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('1.1.1.1')).toBe(false);
      expect(isPrivateIP('203.130.208.10')).toBe(false);
    });

    it('should flag invalid IPs as private (fail safe)', () => {
      expect(isPrivateIP('invalid')).toBe(true);
      expect(isPrivateIP('999.999.999.999')).toBe(true);
    });
  });

  describe('validateUrl', () => {
    it('should reject non-HTTP protocols', async () => {
      await expect(validateUrl('ftp://example.com')).rejects.toThrow('Unsupported protocol');
      await expect(validateUrl('file:///etc/passwd')).rejects.toThrow('Unsupported protocol');
    });

    it('should reject invalid URLs', async () => {
      await expect(validateUrl('not-a-url')).rejects.toThrow('Invalid URL format');
    });

    it('should reject localhost', async () => {
      await expect(validateUrl('http://localhost:3000')).rejects.toThrow('Blocked hostname');
    });

    it('should reject direct private IP access', async () => {
      await expect(validateUrl('http://10.0.0.1')).rejects.toThrow('private IP');
      await expect(validateUrl('http://192.168.1.1')).rejects.toThrow('private IP');
      await expect(validateUrl('http://127.0.0.1')).rejects.toThrow('private IP');
      await expect(validateUrl('http://169.254.169.254')).rejects.toThrow('private IP');
    });

    it('should reject AWS metadata endpoint', async () => {
      await expect(validateUrl('http://metadata.google.internal')).rejects.toThrow('Blocked hostname');
    });

    it('should accept valid public URLs', async () => {
      await expect(validateUrl('https://example.com')).resolves.toBeUndefined();
      await expect(validateUrl('https://httpbin.org/get')).resolves.toBeUndefined();
    });
  });
});
