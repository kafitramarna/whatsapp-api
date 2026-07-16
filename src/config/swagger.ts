/**
 * OpenAPI 3.0 Configuration
 */
import { SwaggerOptions } from '@fastify/swagger';

// OpenAPI 3.0 configuration for Fastify Swagger
export const swaggerConfig: SwaggerOptions = {
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'VenusConnect - WhatsApp API Gateway',
      description: `# WhatsApp Multi-Device API Gateway

REST API untuk mengirim dan menerima pesan WhatsApp menggunakan protokol Multi-Device (Baileys).

## 🚀 Quick Start

1. **Register** atau **Login** via \`/api/auth/register\` atau \`/api/auth/login\` untuk mendapatkan API key
2. **Buat session** via \`POST /api/session/create\` lalu scan QR code
3. **Kirim pesan** via \`POST /api/session/:sessionId/send\`

## ⚡ Real-Time Events (SSE)

Gunakan Server-Sent Events untuk mendapatkan QR code dan status connection secara real-time tanpa polling:

\`\`\`javascript
const es = new EventSource('/api/session/:sessionId/events?api_key=YOUR_KEY');
es.addEventListener('qr', (e) => {
  const data = JSON.parse(e.data);
  console.log('QR ready:', data.qr); // data URL
});
es.addEventListener('connected', (e) => {
  console.log('WhatsApp connected!');
  es.close();
});
\`\`\`

Events: \`ready\` (initial state), \`qr\` (QR code data URL), \`qr_cleared\`, \`connected\`, \`disconnected\`. Heartbeat setiap 15s.

## 🔐 Authentication

Semua endpoint (kecuali Auth) memerlukan API key via header:

\`\`\`
x-api-key: your-api-key-here
\`\`\`

| Endpoint | Auth | Catatan |
|----------|------|--------|
| \`/api/auth/*\` | Public | Tidak butuh API key |
| \`/api/session/*\` | API Key | User hanya akses session miliknya |
| \`/api/users/me\` | API Key | Profil sendiri |
| \`/api/users/*\` | Admin | Butuh role admin |
| \`/api/logs/*\` | Admin | Butuh role admin |

**Public Registration:** Jika \`PUBLIC_REGISTRATION=true\` di env, endpoint register bersifat public. Jika tidak, hanya admin yang bisa membuat user baru.

## ⏱️ Rate Limiting

- **100 requests/minute** per user (atau per IP jika tidak terautentikasi)
- Jika limit terlampaui, response \`429 Too Many Requests\`:
\`\`\`json
{ "success": false, "error": "Too many requests. Please slow down.", "code": "RATE_LIMIT_EXCEEDED" }
\`\`\`

## 📎 Media Support

Media dapat dikirim dalam 3 format:
- **URL**: \`https://example.com/image.jpg\` (dengan SSRF protection)
- **Local Path**: \`/path/to/file.pdf\` (hanya di development, diblokir di production)
- **Base64**: \`data:image/jpeg;base64,/9j/4AAQ...\`

### Media Types

| Type | Field Tambahan | Catatan |
|------|---------------|---------|
| \`image\` | \`caption\`, \`viewOnce\`, \`quality\` | \`quality: "hd"\` untuk gambar HD |
| \`video\` | \`caption\`, \`viewOnce\` | |
| \`document\` | \`caption\`, \`filename\`, \`mimetype\` | |
| \`audio\` | \`ptt\` | \`ptt: true\` untuk voice note |
| \`sticker\` | \`isAnimated\` | \`isAnimated: true\` untuk sticker animasi |

### Contoh Media

\`\`\`json
{
  "to": "6281234567890",
  "message": "Lihat gambar ini",
  "media": [
    {
      "type": "image",
      "data": "https://example.com/photo.jpg",
      "caption": "Foto liburan",
      "viewOnce": true,
      "quality": "hd"
    },
    {
      "type": "document",
      "data": "data:application/pdf;base64,JVBERi0xLjQ...",
      "filename": "report.pdf",
      "mimetype": "application/pdf"
    }
  ]
}
\`\`\`

## 🔔 Webhook Events

Jika webhook URL dikonfigurasi, events berikut akan dikirim ke endpoint Anda:

| Event | Deskripsi |
|-------|-----------|
| \`message.received\` | Pesan masuk (text/media) |
| \`message.status\` | Status pesan (sent/delivered/read) |
| \`presence.update\` | Update kehadiran (online/offline/typing) |
| \`message.reaction\` | Reaction pada pesan |
| \`message.deleted\` | Pesan dihapus |
| \`group.update\` | Update info grup (nama/deskripsi/settings) |
| \`group.participants\` | Perubahan peserta grup (join/leave/promote/demote) |
| \`call\` | Panggilan masuk (voice/video) |

### Webhook HMAC Signing

Jika \`webhook_secret\` diatur, setiap webhook dikirim dengan header:
\`\`\`
X-Webhook-Signature: sha256=<HMAC_HEX>
\`\`\`

### Webhook Management

Sistem mendukung **multi-endpoint webhook** per session:
- **CRUD endpoints** — tambah/edit/hapus URL webhook
- **Event filtering** — pilih event tertentu per endpoint
- **Delivery logs** — lihat status pengiriman (success/failed/retrying)
- **Manual retry** — kirim ulang webhook yang gagal
- **Test endpoint** — kirim test payload ke URL untuk verifikasi

## 📅 Scheduled Messages

Jadwalkan pesan untuk dikirim otomatis:
- \`POST /api/session/:sessionId/schedule\` — Buat pesan terjadwal
- \`GET /api/session/:sessionId/schedule\` — List pesan pending
- \`GET /api/session/:sessionId/schedule/history\` — Riwayat (sent/failed/cancelled)
- \`GET /api/session/:sessionId/schedule/:messageId\` — Detail pesan
- \`DELETE /api/session/:sessionId/schedule/:messageId\` — Batalkan pesan

Scheduler berjalan setiap menit untuk mengirim pesan yang sudah jatuh tempo.

## 💬 Special Message Types

| Endpoint | Fungsi |
|----------|--------|
| \`POST /session/:sessionId/react\` | React pesan dengan emoji |
| \`POST /session/:sessionId/send-poll\` | Kirim poll dengan opsi |
| \`POST /session/:sessionId/send-location\` | Kirim lokasi (lat/lng) |
| \`POST /session/:sessionId/send-contact\` | Kirim contact card (vCard) |
| \`POST /session/:sessionId/forward\` | Forward pesan ke chat lain |
| \`PUT /session/:sessionId/message\` | Edit pesan yang sudah dikirim |
| \`DELETE /session/:sessionId/message\` | Hapus pesan (me/everyone) |
| \`POST /session/:sessionId/check-number\` | Cek nomor terdaftar di WhatsApp |
| \`POST /session/:sessionId/media/download\` | Download media dari pesan masuk |

## 📋 Chat Operations

| Endpoint | Fungsi |
|----------|--------|
| \`PUT /session/:sessionId/chat/:jid/modify\` | archive, unarchive, mute, unmute, pin, unpin, clear, delete, markRead |
| \`PUT /session/:sessionId/chat/:jid/disappearing\` | Set disappearing messages (0=off, 86400=24h, 604800=7d) |
| \`POST /session/:sessionId/message/pin\` | Pin/unpin chat |
| \`POST /session/:sessionId/message/star\` | Star/unstar pesan |

## 👥 Group Management

| Endpoint | Fungsi |
|----------|--------|
| \`GET /session/:sessionId/groups\` | List semua grup |
| \`POST /session/:sessionId/groups\` | Buat grup baru |
| \`GET /session/:sessionId/groups/:groupId\` | Info grup + peserta |
| \`POST .../groups/:groupId/add\` | Tambah peserta |
| \`POST .../groups/:groupId/remove\` | Hapus peserta |
| \`POST .../groups/:groupId/promote\` | Promote ke admin |
| \`POST .../groups/:groupId/demote\` | Demote dari admin |
| \`POST .../groups/:groupId/mention\` | Mention user di grup |
| \`PUT .../groups/:groupId/settings\` | announcement/locked/unlocked |
| \`PUT .../groups/:groupId/subject\` | Ubah nama grup |
| \`PUT .../groups/:groupId/description\` | Ubah deskripsi grup |
| \`GET .../groups/:groupId/invite\` | Get invite link |
| \`POST .../groups/:groupId/invite/revoke\` | Revoke invite link |
| \`PUT .../groups/:groupId/picture\` | Update foto grup |
| \`DELETE .../groups/:groupId/picture\` | Hapus foto grup |
| \`PUT .../groups/:groupId/ephemeral\` | Set disappearing messages grup |
| \`PUT .../groups/:groupId/add-mode\` | admin_add / all_member_add |
| \`PUT .../groups/:groupId/join-approval\` | on/off approval mode |
| \`GET .../groups/:groupId/requests\` | List join requests |
| \`POST .../groups/:groupId/requests\` | Approve/reject join requests |
| \`DELETE .../groups/:groupId\` | Leave grup |
| \`POST /session/:sessionId/accept-invite\` | Join grup via invite code |
| \`POST /session/:sessionId/invite-info\` | Info grup dari invite code |

## 👤 Profile Management

| Endpoint | Fungsi |
|----------|--------|
| \`PUT /session/:sessionId/profile/name\` | Update nama profil |
| \`PUT /session/:sessionId/profile/status\` | Update status/about |
| \`PUT /session/:sessionId/profile/picture\` | Update foto profil |
| \`DELETE /session/:sessionId/profile/picture\` | Hapus foto profil |
| \`GET /session/:sessionId/profile-picture/:jid\` | Get URL foto profil |
| \`POST /session/:sessionId/block\` | Block kontak |
| \`POST /session/:sessionId/unblock\` | Unblock kontak |
| \`POST /session/:sessionId/status\` | Post text status/story |
| \`POST /session/:sessionId/status/media\` | Post media status/story |

## 🛡️ Admin Features

### User Management
- \`GET /api/users/me\` — Profil sendiri (any user)
- \`POST /api/users\` — Buat user (admin)
- \`GET /api/users\` — List semua user (admin)
- \`GET /api/users/:userId\` — Detail user (admin)
- \`PUT /api/users/:userId\` — Update user (admin)
- \`DELETE /api/users/:userId\` — Hapus user (admin)
- \`POST /api/users/:userId/regenerate-key\` — Regenerate API key (admin)

### API Logs
- \`GET /api/logs\` — List request logs dengan pagination & filter (admin)
- \`GET /api/logs/:logId\` — Detail log by UUID (admin)

## 🔒 Security

- **SSRF Protection**: URL media diverifikasi untuk mencegah akses ke internal network
- **Helmet Headers**: Security headers (CSP disabled untuk Scalar UI)
- **CORS**: Dikonfigurasi via \`CORS_ORIGINS\` env, blocked di production by default
- **Password Hashing**: bcrypt dengan salt rounds
- **API Key Masking**: API key tidak pernah ditampilkan full setelah creation
- **Webhook HMAC**: Optional signing untuk verifikasi webhook authenticity
- **Body Limit**: 10MB max request body

## ❌ Error Response Format

Semua error mengikuti format:
\`\`\`json
{
  "success": false,
  "error": "Error message description"
}
\`\`\`

Common status codes: \`400\` (bad request), \`401\` (unauthorized), \`403\` (forbidden/admin only), \`404\` (not found), \`429\` (rate limited), \`500\` (server error)

## 📊 Response Format

Semua response sukses mengikuti format:
\`\`\`json
{
  "success": true,
  "data": { ... }
}
\`\`\`

## 🏥 Health & Info

- \`GET /health\` — Health check (no auth)
- \`GET /\` — API info & documentation links
- \`GET /openapi.json\` — OpenAPI 3.0 specification (JSON)
`,
      version: '1.0.0',
      contact: {
        name: 'VenusConnect Support',
        email: 'contact@venusverse.dev',
        url: 'https://whatsapp.venusverse.me',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    externalDocs: {
      url: 'https://whatsapp.venusverse.me/docs',
      description: 'Full Documentation',
    },
    servers: [
      { url: 'http://127.0.0.1:3000', description: 'Development' },
      { url: 'https://whatsapp.venusverse.me', description: 'Production' },
    ],
    tags: [
      { name: 'Auth', description: 'Public authentication — register, login, regenerate API key (no API key required)' },
      { name: 'Session', description: 'WhatsApp session management — create, QR code, status, delete, webhook config' },
      { name: 'Messaging', description: 'Send messages — text, media, group, broadcast, mark read, presence' },
      { name: 'Scheduled', description: 'Scheduled message management — create, list, history, cancel' },
      { name: 'Groups', description: 'WhatsApp group management — CRUD, participants, settings, invite, picture, ephemeral' },
      { name: 'Messages', description: 'Special message types — reaction, poll, location, contact, forward, edit, delete, download, pin, star, chat ops' },
      { name: 'Profile', description: 'Profile management — name, status, picture, block/unblock, status/stories' },
      { name: 'Webhooks', description: 'Webhook endpoint CRUD, delivery logs, retry, event filtering' },
      { name: 'Users', description: 'User management (admin) — CRUD, API key regeneration, profile' },
      { name: 'Logs', description: 'API request logs (admin) — list, filter, detail' },
      { name: 'Health', description: 'Health check, API info, OpenAPI specification' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          name: 'x-api-key',
          in: 'header',
          description: 'API key for authentication. Get your API key by registering at /api/auth/register',
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
};

export default { swaggerConfig };
