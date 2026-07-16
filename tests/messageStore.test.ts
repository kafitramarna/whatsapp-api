jest.mock('../src/services/whatsappService', () => ({
  getSession: jest.fn(),
}));

jest.mock('../src/models/Session', () => ({
  Session: { findOne: jest.fn() },
}));

import {
  storeMessage,
  getMessage,
  getMessages,
  clearMessages,
  getMessageCount,
  MAX_STORED_MESSAGES,
} from '../src/services/messageStore';

describe('MessageStore', () => {
  beforeEach(() => {
    clearMessages('test-session');
  });

  function makeMsg(id: string, remoteJid = '6281234567890@s.whatsapp.net') {
    return {
      key: { id, remoteJid, fromMe: false },
      message: { conversation: `Message ${id}` },
      messageTimestamp: Date.now(),
      pushName: 'TestUser',
    };
  }

  describe('storeMessage', () => {
    it('should store a message', () => {
      storeMessage('test-session', makeMsg('msg1'));
      expect(getMessageCount('test-session')).toBe(1);
    });

    it('should store multiple messages', () => {
      storeMessage('test-session', makeMsg('msg1'));
      storeMessage('test-session', makeMsg('msg2'));
      storeMessage('test-session', makeMsg('msg3'));
      expect(getMessageCount('test-session')).toBe(3);
    });

    it('should enforce FIFO limit (MAX_STORED_MESSAGES)', () => {
      for (let i = 0; i < MAX_STORED_MESSAGES + 50; i++) {
        storeMessage('test-session', makeMsg(`msg-${i}`));
      }
      expect(getMessageCount('test-session')).toBe(MAX_STORED_MESSAGES);
      // Oldest messages should be removed
      expect(getMessage('test-session', 'msg-0')).toBeUndefined();
      // Newest should still exist
      expect(getMessage('test-session', `msg-${MAX_STORED_MESSAGES + 49}`)).toBeDefined();
    });
  });

  describe('getMessage', () => {
    it('should retrieve a message by ID', () => {
      storeMessage('test-session', makeMsg('msg1'));
      const msg = getMessage('test-session', 'msg1');
      expect(msg).toBeDefined();
      expect(msg?.key.id).toBe('msg1');
    });

    it('should return undefined for non-existent message', () => {
      expect(getMessage('test-session', 'nonexistent')).toBeUndefined();
    });

    it('should return undefined for non-existent session', () => {
      expect(getMessage('nonexistent-session', 'msg1')).toBeUndefined();
    });
  });

  describe('getMessages', () => {
    it('should return messages in newest-first order', () => {
      storeMessage('test-session', makeMsg('msg1'));
      storeMessage('test-session', makeMsg('msg2'));
      storeMessage('test-session', makeMsg('msg3'));
      const messages = getMessages('test-session');
      expect(messages[0].key.id).toBe('msg3');
      expect(messages[2].key.id).toBe('msg1');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        storeMessage('test-session', makeMsg(`msg-${i}`));
      }
      const messages = getMessages('test-session', 3);
      expect(messages).toHaveLength(3);
      expect(messages[0].key.id).toBe('msg-9');
    });

    it('should return empty array for non-existent session', () => {
      expect(getMessages('nonexistent-session')).toEqual([]);
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages for a session', () => {
      storeMessage('test-session', makeMsg('msg1'));
      storeMessage('test-session', makeMsg('msg2'));
      clearMessages('test-session');
      expect(getMessageCount('test-session')).toBe(0);
    });
  });

  describe('getMessageCount', () => {
    it('should return 0 for non-existent session', () => {
      expect(getMessageCount('nonexistent')).toBe(0);
    });

    it('should return correct count', () => {
      storeMessage('test-session', makeMsg('msg1'));
      storeMessage('test-session', makeMsg('msg2'));
      expect(getMessageCount('test-session')).toBe(2);
    });
  });
});
