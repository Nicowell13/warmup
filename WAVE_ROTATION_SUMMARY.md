# Wave Rotation Implementation - Summary

## 📋 Ringkasan Perubahan

Implementasi wave rotation telah selesai! Berikut adalah ringkasan lengkap dari fitur baru yang ditambahkan:

## ✅ Files yang Dimodifikasi

### 1. `apps/api/src/index.ts`
**Perubahan Utama:**
- Modified campaign generation logic untuk support multiple waves
- Setiap wave merotasi OLD sessions ke pair NEW yang berbeda
- Added wave scheduling dengan pairing reset tasks
- Improved logging untuk tracking wave progress

**Key Changes:**
```typescript
// Configuration baru
const MESSAGES_PER_WAVE = 24; // 24 pesan per wave
const TOTAL_WAVES = oldSessions.length; // Jumlah waves = jumlah OLD

// Rotation formula
const sourceOldIdx = (oldIdx + waveIndex) % oldSessions.length;

// Wave reset task
{
  kind: 'wa12-wave-reset',
  waveIndex: waveIndex,
  payload: { pairings: wavePairingMap }
}
```

### 2. `apps/api/src/scheduler.ts`
**Perubahan Utama:**
- Enhanced logging untuk wave reset tasks
- Display wave index saat pairing update

**Key Changes:**
```typescript
if (task.kind === 'wa12-wave-reset') {
  const waveIndex = task?.waveIndex ?? '?';
  console.log(`🌊 Wave ${waveIndex} pairing reset: ${Object.keys(pairs).length} NEW sessions updated`);
  db.replaceNewPairings(pairs);
}
```

### 3. `apps/api/src/db.ts`
**No changes needed** - Database types already support `waveIndex` field

## 📄 Files Baru yang Ditambahkan

### 1. `WAVE_ROTATION_GUIDE.md`
Dokumentasi lengkap tentang wave rotation system:
- Konsep dan cara kerja
- Formula rotasi
- Implementasi teknis
- Monitoring & logs
- Troubleshooting guide
- Best practices

### 2. `WAVE_ROTATION_EXAMPLES.md`
Contoh konfigurasi untuk berbagai scenario:
- Small testing (2 OLD × 4 NEW)
- Medium production (5 OLD × 10 NEW)
- Large scale (10 OLD × 30 NEW)
- Verification checklist
- Common issues & solutions

### 3. `README.md` (Updated)
Updated main README dengan:
- Feature highlight untuk wave rotation
- Link ke dokumentasi lengkap
- Quick overview keuntungan wave rotation

## 🌊 Cara Kerja Wave Rotation

### Formula Rotasi
```
Wave 1: OLD[i] → Targets dari OLD[i]
Wave 2: OLD[i] → Targets dari OLD[(i+1) % total]
Wave 3: OLD[i] → Targets dari OLD[(i+2) % total]
...
Wave N: OLD[i] → Targets dari OLD[(i+N-1) % total]
```

### Contoh dengan 3 OLD, 6 NEW:
```
Initial Assignment:
- OLD-1 → NEW-1, NEW-2
- OLD-2 → NEW-3, NEW-4
- OLD-3 → NEW-5, NEW-6

Wave 1 (Day 1-3):
- OLD-1 chats with NEW-1, NEW-2 (24 msg each)
- OLD-2 chats with NEW-3, NEW-4 (24 msg each)
- OLD-3 chats with NEW-5, NEW-6 (24 msg each)

Wave 2 (Day 4-6):
- OLD-1 chats with NEW-3, NEW-4 (rotasi dari OLD-2)
- OLD-2 chats with NEW-5, NEW-6 (rotasi dari OLD-3)
- OLD-3 chats with NEW-1, NEW-2 (rotasi dari OLD-1)

Wave 3 (Day 7-9):
- OLD-1 chats with NEW-5, NEW-6 (rotasi dari OLD-3)
- OLD-2 chats with NEW-1, NEW-2 (rotasi dari OLD-1)
- OLD-3 chats with NEW-3, NEW-4 (rotasi dari OLD-2)
```

Hasilnya: Setiap NEW account akan chat dengan **semua OLD accounts** (1 per wave).

## 🚀 Cara Menggunakan

### 1. Setup Sessions
Pastikan semua OLD dan NEW sessions sudah:
- ✅ Connected di WAHA
- ✅ Memiliki script text
- ✅ Cluster sudah di-set ('old' atau 'new')

### 2. Start Campaign
```bash
curl -X POST http://localhost:4000/automations/wa12 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Wave Campaign Test",
    "newChatIds": [
      "628111111111@c.us",
      "628222222222@c.us",
      "628333333333@c.us",
      "628444444444@c.us"
    ],
    "oldSessionNames": ["old-1", "old-2"],
    "timezone": "Asia/Jakarta",
    "windowStart": "08:00",
    "windowEnd": "22:00"
  }'
```

### 3. Monitor Logs
```
🚀 Starting campaign xxx: 4 targets, 2 waves
📅 Campaign schedule: 2 waves × 24 msg/wave, 3 days, 8 msg/day

🌊 === WAVE 1/2 ===
   old-1 → 2 targets (from old-1)
   old-2 → 2 targets (from old-2)
   ✅ Wave 1 complete: 96 tasks

🌊 === WAVE 2/2 ===
   old-1 → 2 targets (from old-2)  ← Rotasi!
   old-2 → 2 targets (from old-1)  ← Rotasi!
   ✅ Wave 2 complete: 96 tasks
```

### 4. Verify Execution
Check scheduler logs:
```
⚙️ Scheduler: 10 tasks due, executing...
🌊 Wave 2 pairing reset: 4 NEW sessions updated
📤 OLD old-1 → 628333...
📤 NEW new-3 → 628yyy...
```

## 📊 Expected Results

### Campaign Metrics (5 OLD × 10 NEW):
- **Total waves:** 5
- **Duration:** 15 hari (5 waves × 3 hari)
- **Tasks per wave:** ~288 tasks
- **Total tasks:** ~1,440 tasks
- **Messages per pair per wave:** 48 (24 OLD + 24 NEW)
- **Total messages per NEW account:** 240 (48 × 5 waves)

### Conversation Pattern:
Setiap NEW account akan punya conversation history dengan **5 OLD accounts berbeda**, creating natural community interaction pattern.

## 🎯 Keuntungan

1. **Natural Pattern** - Tidak monoton, setiap OLD bertemu berbagai NEW
2. **Load Balancing** - Distribusi beban merata across all OLD sessions
3. **Redundancy** - Jika 1 OLD offline, yang lain tetap jalan
4. **Scalable** - Easy to scale: tambah OLD = tambah waves
5. **Sustainable** - Mengurangi risk suspension dengan pattern natural

## ⚠️ Important Notes

### Durasi Campaign
Total durasi = `Jumlah OLD × 3 hari`
- 2 OLD = 6 hari
- 5 OLD = 15 hari
- 10 OLD = 30 hari

### Task Generation
All tasks di-generate saat campaign start, bukan on-the-fly. Ini memastikan:
- Predictable scheduling
- Easy monitoring via UI
- Can be paused/resumed anytime

### Window Compliance
Tasks hanya execute dalam window 08:00-22:00. Jika task terlalu banyak untuk window, akan ada warning di logs.

### Pairing Updates
Pairing map di-update otomatis di awal setiap wave (kecuali wave 1). NEW webhook auto-reply tetap suppressed selama campaign aktif.

## 🔍 Monitoring & Debugging

### Check Campaign Progress
```bash
curl http://localhost:4000/automations/:id/progress \
  -H "Authorization: Bearer YOUR_JWT"
```

Response:
```json
{
  "total": 1440,
  "pending": 1200,
  "sent": 240,
  "error": 0,
  "nextDueAt": "2026-01-06T10:30:00.000Z"
}
```

### Check Wave Tasks
Filter tasks by waveIndex:
```typescript
db.listScheduledTasksForAutomation(automationId)
  .filter(t => t.waveIndex === 2); // Wave 2 tasks
```

### Debug Rotation
Check logs untuk verify rotation:
```
🌊 === WAVE 2/5 ===
   old-1 → 2 targets (from old-2)  ← Should rotate
   old-2 → 2 targets (from old-3)
   ...
```

## 🐛 Troubleshooting

### Issue: Wave tidak start
**Check:**
1. Scheduler running? `docker logs -f api`
2. Wave reset task created? Check `kind: 'wa12-wave-reset'`
3. Automation still active? Check `automation.active === true`

### Issue: Rotasi tidak benar
**Debug:**
```typescript
// Check rotation formula
console.log('Wave', waveIndex, 'OldIdx', oldIdx, 
  'SourceIdx', (oldIdx + waveIndex) % oldSessions.length);
```

### Issue: Error rate tinggi
**Common causes:**
- OLD/NEW session offline
- Script kosong atau invalid
- WAHA connection issues

**Fix:** Check session status di WAHA, verify scripts, restart WAHA jika perlu.

## 📚 Dokumentasi Lengkap

Lihat file-file berikut untuk detail lengkap:
- **[WAVE_ROTATION_GUIDE.md](WAVE_ROTATION_GUIDE.md)** - Panduan lengkap
- **[WAVE_ROTATION_EXAMPLES.md](WAVE_ROTATION_EXAMPLES.md)** - Contoh konfigurasi
- **[FIXES_3DAY_SCHEDULE.md](FIXES_3DAY_SCHEDULE.md)** - Background tentang 3-day schedule

## ✨ Next Steps

1. **Test dengan setup kecil** (2 OLD × 4 NEW)
2. **Monitor 1-2 waves** untuk verify
3. **Scale ke production** (5 OLD × 10 NEW)
4. **Optimize** berdasarkan metrics

Selamat menggunakan wave rotation system! 🚀🌊

---

**Created:** 2026-01-06  
**Version:** 1.0  
**Status:** ✅ Ready for production
