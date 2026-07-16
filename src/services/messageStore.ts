/**
 * Message Store
 *
 * In-memory store for last N messages per session.
 * Used for message lookup when forwarding, editing, or downloading media.
 */

export const MAX_STORED_MESSAGES = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StoredMessage {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
    participant?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
  messageTimestamp: number | string | null;
  pushName?: string;
}

const store = new Map<string, StoredMessage[]>();

/**
 * Store a message for a session (FIFO, max MAX_STORED_MESSAGES).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function storeMessage(sessionId: string, msg: any): void {
  if (!store.has(sessionId)) {
    store.set(sessionId, []);
  }

  const messages = store.get(sessionId)!;

  const stored: StoredMessage = {
    key: {
      id: msg.key?.id ?? '',
      remoteJid: msg.key?.remoteJid ?? '',
      fromMe: msg.key?.fromMe ?? false,
      participant: msg.key?.participant,
    },
    message: msg.message,
    messageTimestamp: msg.messageTimestamp ?? null,
    pushName: msg.pushName,
  };

  messages.push(stored);

  // Trim to max size (FIFO — remove oldest)
  if (messages.length > MAX_STORED_MESSAGES) {
    messages.splice(0, messages.length - MAX_STORED_MESSAGES);
  }
}

/**
 * Get a specific message by ID from a session's store.
 */
export function getMessage(sessionId: string, messageId: string): StoredMessage | undefined {
  const messages = store.get(sessionId);
  if (!messages) return undefined;
  return messages.find((m) => m.key.id === messageId);
}

/**
 * Get recent messages for a session (newest first).
 */
export function getMessages(sessionId: string, limit?: number): StoredMessage[] {
  const messages = store.get(sessionId);
  if (!messages) return [];
  const sorted = [...messages].reverse();
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Clear all stored messages for a session.
 */
export function clearMessages(sessionId: string): void {
  store.delete(sessionId);
}

/**
 * Get the total count of stored messages for a session.
 */
export function getMessageCount(sessionId: string): number {
  return store.get(sessionId)?.length ?? 0;
}
