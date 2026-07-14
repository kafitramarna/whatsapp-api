// Use State Memory for Hot Reload update The Webhook URL Sessions
export const sessionStore = new Map<string, {
      webhookUrl: string
}>();