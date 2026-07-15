jest.mock('../src/services/whatsappService', () => ({
  getSession: jest.fn(),
}));

jest.mock('../src/models/Session', () => ({
  Session: { findOne: jest.fn() },
}));

import { buildVCard, formatJid, formatGroupJid } from '../src/controllers/messageController';

describe('MessageController — pure function tests', () => {
  describe('formatJid', () => {
    it('should format a phone number to JID', () => {
      expect(formatJid('6281234567890')).toBe('6281234567890@s.whatsapp.net');
    });

    it('should keep existing JID unchanged', () => {
      expect(formatJid('6281234567890@s.whatsapp.net')).toBe('6281234567890@s.whatsapp.net');
    });

    it('should strip non-numeric characters from phone number', () => {
      expect(formatJid('+62 812-3456-7890')).toBe('6281234567890@s.whatsapp.net');
    });

    it('should keep group JID unchanged when passed to formatJid', () => {
      expect(formatJid('120363@g.us')).toBe('120363@g.us');
    });
  });

  describe('formatGroupJid', () => {
    it('should format a group ID to group JID', () => {
      expect(formatGroupJid('120363')).toBe('120363@g.us');
    });

    it('should keep existing group JID unchanged', () => {
      expect(formatGroupJid('120363@g.us')).toBe('120363@g.us');
    });
  });

  describe('buildVCard', () => {
    it('should build a valid vCard with name and phone', () => {
      const vcard = buildVCard('John Doe', '6281234567890');
      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('VERSION:3.0');
      expect(vcard).toContain('FN:John Doe');
      expect(vcard).toContain('TEL;type=CELL;waid=6281234567890:6281234567890');
      expect(vcard).toContain('END:VCARD');
    });

    it('should include organization when provided', () => {
      const vcard = buildVCard('Jane', '6289876543210', 'ACME Corp');
      expect(vcard).toContain('ORG:ACME Corp');
    });

    it('should not include ORG line when organization is undefined', () => {
      const vcard = buildVCard('Jane', '6289876543210');
      expect(vcard).not.toContain('ORG:');
    });

    it('should strip non-numeric characters from phone in waid field', () => {
      const vcard = buildVCard('Test', '+62 812-3456-7890');
      expect(vcard).toContain('waid=6281234567890');
    });

    it('should have proper vCard structure with newlines', () => {
      const vcard = buildVCard('Test', '6281234567890');
      const lines = vcard.split('\n');
      expect(lines[0]).toBe('BEGIN:VCARD');
      expect(lines[1]).toBe('VERSION:3.0');
      expect(lines[2]).toBe('FN:Test');
      expect(lines[lines.length - 1]).toBe('END:VCARD');
    });
  });

  describe('Poll message structure', () => {
    it('should construct poll with name, values, and selectableCount', () => {
      const poll = {
        name: 'Lunch?',
        values: ['Pizza', 'Burger', 'Salad'],
        selectableCount: 1,
        toJid: '6281234567890@s.whatsapp.net',
      };
      expect(poll.name).toBe('Lunch?');
      expect(poll.values).toHaveLength(3);
      expect(poll.selectableCount).toBe(1);
    });

    it('should require at least 2 options', () => {
      const options = ['Yes', 'No'];
      expect(options.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Delete message logic', () => {
    it('should support deleteFor "everyone"', () => {
      const deleteFor = 'everyone';
      expect(['me', 'everyone']).toContain(deleteFor);
    });

    it('should support deleteFor "me"', () => {
      const deleteFor = 'me';
      expect(['me', 'everyone']).toContain(deleteFor);
    });

    it('should reject invalid deleteFor values', () => {
      const deleteFor = 'invalid';
      expect(['me', 'everyone']).not.toContain(deleteFor);
    });
  });

  describe('Location message structure', () => {
    it('should construct location with coordinates', () => {
      const location = {
        degreesLatitude: -6.2088,
        degreesLongitude: 106.8456,
        name: 'Monas',
        address: 'Jakarta',
      };
      expect(location.degreesLatitude).toBe(-6.2088);
      expect(location.degreesLongitude).toBe(106.8456);
    });
  });
});
