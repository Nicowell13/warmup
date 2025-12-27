# WAHA Multi-Session + Auto Reply (Next.js + Express)

## Fitur
- Login (JWT sederhana) untuk akses dashboard
- Multi session (nama session WAHA) tersimpan di storage lokal API
- Auto-reply per session via webhook WAHA
- Docker Compose untuk `waha`, `api`, dan `web`

## Jalankan mode development (tanpa Docker)
1) Install deps (root workspace)
- `npm install`

2) Jalankan API
- `npm run dev:api`

3) Jalankan Web
- `npm run dev:web`

Akses:
- Web: http://localhost:3000
- API: http://localhost:4000/health
- WAHA (kalau via Docker): http://localhost:3001

## Login
Default (lihat `apps/api/.env.local`):
- username: `admin`
- password: `admin`

## Konfigurasi webhook WAHA
Set WAHA agar memanggil webhook API:
- `http://<api-host>:4000/waha/webhook`

Aplikasi akan auto-reply **berdasarkan nama session** yang datang di payload webhook.

## Jalankan via Docker
- `docker compose up --build`

Service:
- Web: http://localhost:3000
- API: http://localhost:4000
- WAHA: http://localhost:3001

## Catatan WAHA API
Implementasi `sendText` ada di [apps/api/src/waha.ts](apps/api/src/waha.ts) dan memakai endpoint:
- `POST {WAHA_BASE_URL}/api/sendText` dengan body `{ session, chatId, text }`

Jika WAHA Plus / versi Anda memakai path lain, ubah di file tersebut.
