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

Jika popup QR/Pairing menampilkan error `WAHA request failed: 401 Unauthorized`, berarti WAHA Anda mengaktifkan API key.
Set `WAHA_API_KEY` **sekali saja** di file `.env` (root project, untuk Docker Compose), lalu service `waha` dan `api` akan otomatis memakai nilai yang sama.

Contoh `.env`:
```env
WAHA_API_KEY=isi_dengan_api_key_waha
```

Service:
- Web: http://localhost:4000
- API: http://localhost:4001
- WAHA: http://localhost:3001

Catatan:
- Web melakukan request ke API lewat path yang sama-origin: `/api/...` (dipoxy oleh Next.js ke service API).

## Catatan WAHA API
Implementasi `sendText` ada di [apps/api/src/waha.ts](apps/api/src/waha.ts) dan memakai endpoint:
- `POST {WAHA_BASE_URL}/api/sendText` dengan body `{ session, chatId, text }`

Jika WAHA Plus / versi Anda memakai path lain, ubah di file tersebut.
