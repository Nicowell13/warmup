# WAHA Multi-Session + Auto Reply + Wave Rotation (Next.js + Express)

## Fitur Utama
- 🔐 **Login (JWT sederhana)** untuk akses dashboard
- 📱 **Multi session** - Manage banyak WhatsApp sessions (WAHA)
- 🤖 **Auto-reply per session** via webhook WAHA
- 🌊 **Wave Rotation System** - OLD accounts berrotasi otomatis antar NEW pairs
- 📅 **3-Day Campaign Schedule** dengan window 08:00-22:00
- 🔄 **Automated Task Scheduling** untuk orchestrated conversations
- 🐳 **Docker Compose** untuk deployment mudah (`waha`, `api`, dan `web`)

## Fitur Baru: Wave Rotation 🌊

Sistem wave rotation memungkinkan OLD accounts untuk berrotasi mengantikan pair NEW accounts secara otomatis setelah menyelesaikan 24 pesan (masing-masing OLD dan NEW).

### Contoh Scenario (5 OLD, 10 NEW):
- **Wave 1 (Hari 1-3):** OLD-1 → NEW-2,3 | OLD-2 → NEW-4,5 | ... (24 msg each)
- **Wave 2 (Hari 4-6):** OLD-1 → NEW-4,5 | OLD-2 → NEW-6,7 | ... (rotasi!)
- **Wave 3 (Hari 7-9):** OLD-1 → NEW-6,7 | OLD-2 → NEW-8,9 | ... (rotasi lagi!)
- Dan seterusnya sampai 5 waves

📖 **[Baca dokumentasi lengkap Wave Rotation →](WAVE_ROTATION_GUIDE.md)**

### Keuntungan:
✅ Natural conversation patterns (tidak monoton)  
✅ Setiap OLD bertemu dengan berbagai NEW accounts  
✅ Load balancing otomatis  
✅ Redundancy - jika 1 OLD offline, yang lain tetap jalan  
✅ Scalable untuk berbagai ukuran campaign  

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

- **Docker:** Di `docker-compose.yml`, service `waha` punya `WAHA_WEBHOOK_URL` dan service `api` punya `WAHA_WEBHOOK_URL` agar saat session di-start, webhook ikut didaftarkan per-session (WAHA Plus).
- **Tanpa Docker:** Set env `WAHA_WEBHOOK_URL=http://<host-reachable-by-waha>:4000/waha/webhook` saat jalankan API (atau pakai default `http://localhost:4000/waha/webhook` jika WAHA dan API di mesin yang sama).

### Troubleshooting: "Tidak ada webhook masuk" / NEW tidak auto-reply
1. **Cek log API** – Saat ada pesan masuk ke session mana pun, harus muncul log: `📡 [Webhook] Hit!` di log **API**, bukan hanya log WAHA. Kalau tidak ada, webhook tidak sampai ke API.
2. **Session harus di-start dengan webhook** – Setiap session (termasuk NEW) perlu di-start dengan config yang berisi webhook. Session yang dibuat sebelum penambahan fitur ini perlu **di-stop lalu di-start lagi** dari dashboard (atau sync sessions) agar webhook terdaftar.
3. **Reachable dari WAHA** – URL webhook harus bisa diakses dari proses/container WAHA. Di Docker pakai `http://app-api:4000/waha/webhook` (bukan localhost).
4. **Env di API** – Pastikan `WAHA_WEBHOOK_URL` diset di environment service API (lihat `docker-compose.yml`) agar saat start session, API mengirim URL ini ke WAHA.

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
