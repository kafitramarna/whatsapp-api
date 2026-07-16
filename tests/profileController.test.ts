jest.mock('../src/services/whatsappService', () => ({
  getSession: jest.fn(),
}));

jest.mock('../src/models/Session', () => ({
  Session: { findOne: jest.fn() },
}));

jest.mock('../src/lib/mediaUtils', () => ({
  prepareMediaBuffer: jest.fn(),
}));

import { formatProfileJid } from '../src/controllers/profileController';

describe('ProfileController — pure function tests', () => {
  describe('formatProfileJid', () => {
    it('should format a phone number to JID', () => {
      expect(formatProfileJid('6281234567890')).toBe('6281234567890@s.whatsapp.net');
    });

    it('should keep existing JID unchanged', () => {
      expect(formatProfileJid('6281234567890@s.whatsapp.net')).toBe('6281234567890@s.whatsapp.net');
    });

    it('should strip non-numeric characters from phone number', () => {
      expect(formatProfileJid('+62 812-3456-7890')).toBe('6281234567890@s.whatsapp.net');
    });

    it('should keep group JID unchanged', () => {
      expect(formatProfileJid('120363@g.us')).toBe('120363@g.us');
    });
  });

  describe('Status message structure', () => {
    it('should construct status with text, backgroundColor, and font', () => {
      const status = {
        text: 'Hello world!',
        backgroundColor: '#0b1015',
        font: 0,
      };
      expect(status.text).toBe('Hello world!');
      expect(status.backgroundColor).toBe('#0b1015');
      expect(status.font).toBe(0);
    });

    it('should include statusJidList when recipients provided', () => {
      const status = {
        text: 'Hello!',
        statusJidList: ['6281234567890@s.whatsapp.net', '6289876543210@s.whatsapp.net'],
      };
      expect(status.statusJidList).toHaveLength(2);
    });
  });

  describe('Block/unblock structure', () => {
    it('should format jid for block action', () => {
      const blockBody = { jid: '6281234567890' };
      const formatted = formatProfileJid(blockBody.jid);
      expect(formatted).toBe('6281234567890@s.whatsapp.net');
    });

    it('should format jid for unblock action', () => {
      const unblockBody = { jid: '6289876543210' };
      const formatted = formatProfileJid(unblockBody.jid);
      expect(formatted).toBe('6289876543210@s.whatsapp.net');
    });
  });
});
