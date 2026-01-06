# Wave Rotation System - Panduan Lengkap

## Konsep Wave Rotation

Sistem wave rotation memungkinkan OLD accounts untuk berrotasi mengantikan pair NEW accounts secara otomatis setelah menyelesaikan siklus percakapan 24 pesan (masing-masing OLD dan NEW 24 kali).

### Cara Kerja

**Contoh dengan 5 OLD dan 10 NEW (2 NEW per OLD):**

#### Wave 1 (Hari 1-3):
```
OLD-1 → NEW-2, NEW-3   (24 msg each = 48 total)
OLD-2 → NEW-4, NEW-5   (24 msg each = 48 total)
OLD-3 → NEW-6, NEW-7   (24 msg each = 48 total)
OLD-4 → NEW-8, NEW-9   (24 msg each = 48 total)
OLD-5 → NEW-10, NEW-11 (24 msg each = 48 total)
```

#### Wave 2 (Hari 4-6):
```
OLD-1 → NEW-4, NEW-5   (rotasi dari OLD-2)
OLD-2 → NEW-6, NEW-7   (rotasi dari OLD-3)
OLD-3 → NEW-8, NEW-9   (rotasi dari OLD-4)
OLD-4 → NEW-10, NEW-11 (rotasi dari OLD-5)
OLD-5 → NEW-2, NEW-3   (rotasi dari OLD-1)
```

#### Wave 3 (Hari 7-9):
```
OLD-1 → NEW-6, NEW-7   (rotasi dari OLD-3)
OLD-2 → NEW-8, NEW-9   (rotasi dari OLD-4)
OLD-3 → NEW-10, NEW-11 (rotasi dari OLD-5)
OLD-4 → NEW-2, NEW-3   (rotasi dari OLD-1)
OLD-5 → NEW-4, NEW-5   (rotasi dari OLD-2)
```

Dan seterusnya hingga 5 waves (sesuai jumlah OLD accounts).

## Formula Rotasi

```typescript
// OLD at index i gets targets from OLD at index (i + waveIndex) % totalOldSessions
const sourceOldIdx = (currentOldIdx + waveIndex) % oldSessions.length;
```

## Struktur Campaign

### Durasi Total
- **Jumlah Waves:** Sama dengan jumlah OLD sessions (contoh: 5 OLD = 5 waves)
- **Durasi per Wave:** 3 hari
- **Total Durasi:** Waves × 3 hari (contoh: 5 waves × 3 hari = 15 hari)

### Pesan per Wave
- **24 pesan per cluster per pair** (masing-masing OLD dan NEW)
- **Dibagi dalam 3 hari:** 8 pesan/hari/cluster
- **Total per pair per wave:** 48 pesan (24 OLD + 24 NEW)

### Jadwal Harian
- **Window waktu:** 08:00 - 22:00 (14 jam)
- **8 rounds per hari**
- **Setiap round:** OLD kirim, lalu NEW balas
- **Delay dinamis:** Disesuaikan dengan jumlah pairs dan window

## Implementasi Teknis

### 1. Task Generation
Sistem generate tasks untuk semua waves sekaligus saat campaign dimulai:

```typescript
for (let waveIndex = 0; waveIndex < TOTAL_WAVES; waveIndex++) {
  // Calculate rotation for this wave
  for (let oldIdx = 0; oldIdx < oldSessions.length; oldIdx++) {
    const sourceOldIdx = (oldIdx + waveIndex) % oldSessions.length;
    // Assign targets from rotated OLD to current OLD
  }
  
  // Generate 3 days × 8 rounds × 2 messages per pair
  for (let day = 0; day < 3; day++) {
    for (let round = 0; round < 8; round++) {
      // Create OLD→NEW and NEW→OLD tasks
    }
  }
}
```

### 2. Pairing Updates
Di awal setiap wave (kecuali wave 1), sistem schedule task khusus `wa12-wave-reset`:

```typescript
{
  kind: 'wa12-wave-reset',
  waveIndex: waveIndex,
  payload: {
    pairings: {
      'new-2': '628xxx@c.us', // NEW-2 sekarang pair dengan OLD yang baru
      'new-3': '628xxx@c.us',
      // ... dst
    }
  }
}
```

### 3. Scheduler Execution
Scheduler mendeteksi dan execute wave reset:

```typescript
if (task.kind === 'wa12-wave-reset') {
  const pairs = task.payload.pairings;
  db.replaceNewPairings(pairs);
  console.log(`🌊 Wave ${waveIndex} pairing reset`);
  // Continue with message tasks
}
```

## Keuntungan Wave Rotation

### 1. **Natural Conversation Pattern**
- Setiap OLD bertemu dengan berbagai NEW accounts
- Simulasi percakapan natural seperti komunitas nyata
- Mengurangi pattern suspicious (pair tetap)

### 2. **Load Balancing**
- Setiap OLD mendapat giliran dengan semua grup NEW
- Distribusi beban merata
- Tidak ada OLD yang idle terlalu lama

### 3. **Redundancy & Flexibility**
- Jika 1 OLD offline, wave bisa continue dengan OLD lain
- Script setiap OLD bisa berbeda untuk variasi
- Easy to scale: tambah OLD = tambah waves

### 4. **Analytics & Tracking**
- Track performance per wave
- Identify best performing OLD sessions
- Optimize script berdasarkan wave metrics

## Monitoring & Logs

### Campaign Start
```
🚀 Starting campaign xxx: 10 targets, 5 waves
📅 Campaign schedule: 5 waves × 24 msg/wave, 3 days, 8 msg/day, window 8:00-22:00

🌊 === WAVE 1/5 ===
   old-1 → 2 targets (from old-1)
   old-2 → 2 targets (from old-2)
   ...
   📆 Wave 1 Day 1 starts at: 2026-01-06 09:00
   ✅ Wave 1 complete: 288 tasks

🌊 === WAVE 2/5 ===
   old-1 → 2 targets (from old-2)  ← Rotasi!
   old-2 → 2 targets (from old-3)
   ...
```

### Runtime
```
⚙️ Scheduler: 10 tasks due, executing...
🌊 Wave 2 pairing reset: 10 NEW sessions updated
📤 OLD old-1 → 628xxx...
📤 NEW new-4 → 628yyy...
```

## Configuration

### Basic Setup (5 OLD, 10 NEW)
```json
{
  "name": "Campaign Wave Rotation",
  "newChatIds": [
    "628111@c.us", "628222@c.us", "628333@c.us", 
    "628444@c.us", "628555@c.us", "628666@c.us",
    "628777@c.us", "628888@c.us", "628999@c.us",
    "628000@c.us"
  ],
  "oldSessionNames": ["old-1", "old-2", "old-3", "old-4", "old-5"],
  "timezone": "Asia/Jakarta",
  "windowStart": "08:00",
  "windowEnd": "22:00"
}
```

**Hasilnya:**
- 5 waves (5 OLD sessions)
- Total durasi: 15 hari (5 waves × 3 hari)
- Total tasks: ~1,440 tasks (5 waves × 288 tasks/wave)
- Setiap NEW akan chat dengan 5 OLD berbeda (1 per wave)

## Troubleshooting

### Wave Not Starting
**Gejala:** Wave 2+ tidak execute, застряло di wave 1

**Diagnosis:**
```sql
SELECT * FROM scheduledTasks 
WHERE kind = 'wa12-wave-reset' 
AND status = 'pending';
```

**Fix:**
- Check scheduler logs: harus ada "🌊 Wave X pairing reset"
- Verify wave-reset task created dengan payload correct
- Check automation masih active

### Rotation Tidak Benar
**Gejala:** OLD tidak rotasi sesuai formula

**Diagnosis:**
- Check logs: "old-1 → 2 targets (from old-X)"
- Verify sourceOldIdx calculation
- Check targetsByOld distribution

**Fix:**
```typescript
// Verify rotation formula
const sourceOldIdx = (currentOldIdx + waveIndex) % oldSessions.length;
// Should cycle: 0+0=0, 0+1=1, 0+2=2, ..., 0+5=0 (untuk 5 OLD)
```

### Delay Terlalu Pendek/Panjang
**Gejala:** Tasks execute terlalu cepat atau melewati window

**Diagnosis:**
- Check "delay: X min/task" di logs
- Calculate: windowMinutes / totalTasks

**Fix:**
```typescript
// Adjust BASE_DELAY_MINUTES di index.ts
const BASE_DELAY_MINUTES = 2; // Increase untuk slow down

// Or adjust window coverage percentage
const delayBetweenTasks = Math.floor(windowMinutes / tasksThisDay * 0.85);
// Increase 0.85 → 0.95 untuk spread lebih lama
```

## Best Practices

### 1. Start Small
- Test dengan 2 OLD, 4 NEW dulu (2 waves)
- Monitor logs untuk 1-2 waves
- Scale ke production setelah verify

### 2. Script Quality
- Ensure semua OLD punya script berbeda
- Test script di sandbox dulu
- Monitor response patterns per wave

### 3. Timing
- Start campaign di pagi hari (08:00-09:00)
- Avoid start di weekend
- Plan untuk waves berlangsung 2-3 minggu

### 4. Monitoring
- Check scheduler logs tiap hari
- Monitor progress UI untuk pending tasks
- Track error rate per wave

### 5. Backup Plan
- Keep 1-2 OLD sebagai backup
- Ready untuk manual intervention jika perlu
- Have rollback strategy

## Scaling Guidelines

### Small Campaign (2-3 OLD)
- **NEW targets:** 4-6 (2 per OLD)
- **Duration:** 6-9 hari
- **Best for:** Testing, proof of concept

### Medium Campaign (5 OLD)
- **NEW targets:** 10-15 (2-3 per OLD)
- **Duration:** 15 hari
- **Best for:** Production, stable community

### Large Campaign (10 OLD)
- **NEW targets:** 20-30 (2-3 per OLD)
- **Duration:** 30 hari
- **Best for:** Large scale, multiple communities

## FAQ

**Q: Berapa lama total campaign dengan 5 OLD?**
A: 15 hari (5 waves × 3 hari/wave)

**Q: Apakah NEW bisa chat dengan OLD lebih dari 1 kali?**
A: Ya! Dalam 5 waves, setiap NEW akan chat dengan 5 OLD berbeda (1 per wave).

**Q: Bagaimana jika 1 OLD offline di tengah wave?**
A: Tasks untuk OLD tersebut akan error, tapi OLD lain tetap jalan. Wave berikutnya bisa skip OLD yang offline.

**Q: Bisa ubah jumlah pesan per wave?**
A: Ya, ubah `MESSAGES_PER_WAVE` di code (default 24).

**Q: Bisa pause di tengah wave?**
A: Ya, set `automation.active = false`. Tasks pending akan di-skip. Resume dengan set `active = true` lagi.

**Q: Apakah script harus sama untuk semua OLD?**
A: Tidak harus! Setiap OLD bisa punya script berbeda untuk variasi natural.

## Kesimpulan

Wave rotation system memberikan pola percakapan yang lebih natural dan sustainable untuk warmup WhatsApp accounts. Dengan rotasi otomatis, setiap OLD account mendapat exposure ke berbagai NEW accounts, menciptakan interaksi yang lebih organik dan mengurangi risiko suspension.

**Key takeaways:**
- ✅ Automatic rotation berdasarkan wave index
- ✅ Natural conversation patterns
- ✅ Scalable untuk berbagai ukuran campaign
- ✅ Easy monitoring dengan comprehensive logs
- ✅ Flexible configuration untuk berbagai use cases

Selamat mencoba wave rotation system! 🌊🚀
