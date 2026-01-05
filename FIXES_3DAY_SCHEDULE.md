# Perbaikan Campaign: 3 Hari + Window Schedule

## Masalah yang Diperbaiki

### 1. ❌ Campaign Cuma 1 Hari
**Sebelum:**
- 24 rounds × 4 targets × 2 msg × 2 min = ~384 menit (~6 jam)
- Semua task selesai dalam 1 hari

**Sesudah:** ✅
- **3 HARI** campaign dengan 8 pesan per hari per pair
- Total: 24 pesan per pair (8×3), spread merata

### 2. ❌ Tidak Ada Window Schedule  
**Sebelum:**
- Tasks berjalan 24/7 tanpa batasan waktu
- Tidak natural, suspicious

**Sesudah:** ✅
- **Window 08:00 - 22:00** setiap hari
- Tasks otomatis spread dalam window
- Delay dinamis disesuaikan dengan window size

### 3. ❌ Distribusi Tidak Merata
**Sebelum:**
- NEW tidak dapat session mapping → task skip
- Pairing map tidak validated → silent failure
- Tidak ada logging untuk debug

**Sesudah:** ✅
- **Validation lengkap:**
  - Check semua targets punya OLD assignment
  - Check semua NEW punya session mapping
  - Check semua OLD punya chatId
  - Return error 500 jika ada yang gagal
- **Detailed logging:**
  - Per-pair logging: `new-1 → old-1 (628xxx@c.us)`
  - Per-day task count
  - Total tasks summary
  - Error logging untuk skip/fail

## Perubahan Code

### Configuration
```typescript
const TOTAL_DAYS = 3; // 3 hari campaign
const MESSAGES_PER_DAY = 8; // 8 pesan per hari per pair
const WINDOW_START_HOUR = 8; // Jam 08:00
const WINDOW_END_HOUR = 22; // Jam 22:00
const BASE_DELAY_MINUTES = 2;
```

### Validation (Baru!)
```typescript
// 1. Check target assignment
const unassignedTargets = orderedTargets.filter(t => !assignedOldByNewChatId[t]);
if (unassignedTargets.length > 0) {
  return res.status(500).json({ error: 'Target assignment failed' });
}

// 2. Check NEW session mapping
const unmappedNewSessions: string[] = [];
for (const [newChatId, oldSessionName] of Object.entries(assignedOldByNewChatId)) {
  const newSessionName = newChatIdToNewSession[newChatId] || ...;
  if (!newSessionName) {
    unmappedNewSessions.push(newChatId);
  }
}
if (unmappedNewSessions.length > 0) {
  return res.status(500).json({ error: 'NEW session mapping failed' });
}

// 3. Detailed pair logging
fullPairingMap[newSessionName] = oldChatId;
console.log(`  ✅ Pair: ${newSessionName} → ${oldSessionName} (${oldChatId})`);
```

### 3-Day Scheduling (Baru!)
```typescript
for (let day = 0; day < TOTAL_DAYS; day++) {
  // Day 1: Start immediately, Day 2-3: Start at 8:00 AM
  if (day > 0) {
    currentDay = currentDay.plus({ days: 1 }).set({ hour: 8, minute: 0 });
  }
  
  // Calculate window
  const windowStartTime = currentDay.set({ hour: 8, minute: 0 });
  const windowEndTime = currentDay.set({ hour: 22, minute: 0 });
  const windowMinutes = 840; // 14 jam
  
  // Spread tasks evenly
  const tasksThisDay = 8 * totalPairs * 2; // 8 msg × pairs × 2 (OLD+NEW)
  const delayBetweenTasks = Math.floor(windowMinutes / tasksThisDay * 0.9);
  
  // Generate MESSAGES_PER_DAY rounds
  for (let roundIndex = 0; roundIndex < 8; roundIndex++) {
    // ... generate tasks dengan round-robin OLD rotation
  }
}
```

### Window Overflow Protection
```typescript
// Check if task time exceeds window
if (taskTime.hour >= 22) {
  console.warn(`⚠️  Task exceeds window, moving to next day`);
  break;
}
```

## Timeline Example (4 Targets)

### Day 1 (Hari Pertama)
```
08:00 - Campaign start → OLD blast (4 targets)
08:03 - OLD blast selesai
08:03:14 - Task 1: old-1 → new-1 (round 1, pair 1)
08:XX - Task 2: new-1 → old-1
08:XX - Task 3: old-2 → new-3 (round 1, pair 2)
...
21:XX - Task 64: new-4 → old-2 (round 8, pair 4) ← Last task Day 1
```

**Day 1 Total:** 8 rounds × 4 pairs × 2 msg = **64 tasks**

### Day 2
```
08:00 - Task 65: old-1 → new-1 (round 1, pair 1)
...
21:XX - Task 128: new-4 → old-2 (round 8, pair 4)
```

**Day 2 Total:** 64 tasks

### Day 3
```
08:00 - Task 129: old-1 → new-1 (round 1, pair 1)
...
21:XX - Task 192: new-4 → old-2 (round 8, pair 4) ← Campaign selesai
```

**Day 3 Total:** 64 tasks

**GRAND TOTAL:** 192 tasks (3 days × 8 rounds × 4 pairs × 2 msg)

## Logging Output

### Campaign Start
```
📅 Campaign schedule: 3 days, 8 msg/day, window 8:00-22:00
✅ Pair: new-1 → old-1 (62895405452646@c.us)
✅ Pair: new-2 → old-1 (62895405452647@c.us)
✅ Pair: new-3 → old-2 (6282246683881@c.us)
✅ Pair: new-4 → old-2 (6282246683882@c.us)
🔗 Pairing set: 4 NEW sessions paired
```

### Per-Day Generation
```
📆 Day 1 starts at: 1/4/2026, 8:03:17 AM
   Window: 840 min, 64 tasks, delay: 11 min/task
   ✅ Day 1: 64 tasks generated

📆 Day 2 starts at: 1/5/2026, 8:00:00 AM
   Window: 840 min, 64 tasks, delay: 11 min/task
   ✅ Day 2: 64 tasks generated

📆 Day 3 starts at: 1/6/2026, 8:00:00 AM
   Window: 840 min, 64 tasks, delay: 11 min/task
   ✅ Day 3: 64 tasks generated

📊 Total scheduled tasks: 192 across 3 days
```

### Error Detection (Jika Ada Masalah)
```
❌ OLD session old-3 missing chatId, skipping targets
❌ NEW target 628xxx@c.us has no session mapping
❌ 2 NEW targets have no session mapping
→ Error 500: NEW session mapping failed
```

## Benefits

### 1. Natural Pattern ✅
- 3 hari = tidak suspicious
- Window 8-22 = human working hours
- Delay dinamis = tidak pattern rigid

### 2. Distribusi Merata ✅
- Validation mencegah skip
- Round-robin rotation OLD sessions
- Semua NEW dapat dari assigned OLD
- Semua NEW reply ke OLD yang benar

### 3. Easy Debug ✅
- Logging lengkap per-pair
- Error messages jelas
- Per-day task breakdown
- Total task summary

### 4. Configurable ✅
- `TOTAL_DAYS` - ubah jadi 1, 2, 5 hari, etc
- `MESSAGES_PER_DAY` - adjust intensity
- `WINDOW_START/END_HOUR` - custom working hours
- `BASE_DELAY_MINUTES` - safety margin

## Testing Checklist

### ✅ Pre-Campaign
1. Check semua OLD sessions connected (WAHA)
2. Check semua NEW sessions connected
3. Check script text tidak kosong
4. Check target chatIds format benar (628xxx@c.us)

### ✅ Post-Campaign Start
1. Check logging: "✅ Pair: new-X → old-Y"
2. Check tasks count: 192 tasks untuk 4 targets × 3 days
3. Check no error: "❌ NEW target has no session mapping"
4. Check Day 1 tasks mulai execute (scheduler logs)

### ✅ During Campaign
1. Monitor progress UI: pending tasks turun
2. Check scheduler logs: "📤 OLD old-1 → 628xxx..."
3. Check alternating: OLD → NEW → OLD → NEW
4. Check window: tasks hanya execute 8-22

### ✅ After Campaign
1. Check sent count = total tasks
2. Check error count = 0 atau minimal
3. Check conversation history di WhatsApp
4. Verify pairing: setiap NEW cuma chat dengan 1 OLD

## Troubleshooting

### "NEW session mapping failed"
**Cause:** NEW chatId tidak match dengan session phoneNumber
**Fix:** 
1. Check WAHA sessions list: `curl http://localhost:3001/api/sessions`
2. Pastikan phoneNumber format sama (628xxx@c.us)
3. Update newChatIds di campaign request

### "OLD session missing chatId"
**Cause:** OLD session tidak connected atau WAHA belum ready
**Fix:**
1. Check WAHA status: `curl http://localhost:3001/api/sessions`
2. Reconnect OLD sessions
3. Wait 30s, retry campaign

### "Tasks not executing"
**Cause:** Scheduler tidak running atau task dueAt di masa depan
**Fix:**
1. Check API logs: "⚙️ Scheduler: X tasks due"
2. Check task dueAt: `SELECT dueAt FROM tasks LIMIT 5`
3. Verify timezone config

### "Distribusi masih tidak merata"
**Cause:** Assignment logic atau pairing issue
**Fix:**
1. Check logs: "✅ Pair: ..." harus ada untuk semua NEW
2. Check targetsByOld distribution: harus balance
3. Enable debug logging untuk task generation

## Migration dari Old System

### Old System (24 rounds, no window)
```typescript
const MESSAGES_PER_NEW_PER_WAVE = 24;
let taskTime = now.plus({ seconds: 14 });
for (let roundIndex = 0; roundIndex < 24; roundIndex++) {
  // ... generate tasks tanpa window awareness
}
```

### New System (3 days, 8×3, windowed)
```typescript
const TOTAL_DAYS = 3;
const MESSAGES_PER_DAY = 8;
const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 22;

for (let day = 0; day < 3; day++) {
  currentDay = day > 0 ? nextDayAt8AM : now;
  for (let roundIndex = 0; roundIndex < 8; roundIndex++) {
    // ... generate tasks dengan window check
  }
}
```

**Migration Steps:**
1. Pull latest code
2. Rebuild Docker: `docker-compose down && docker-compose up -d --build`
3. Test dengan 2 targets dulu
4. Monitor logs untuk validation errors
5. Scale ke 10-15 targets

## Future Improvements

1. **Configurable via UI:**
   - Total days slider (1-7 hari)
   - Window time picker
   - Messages per day slider

2. **Smart Scheduling:**
   - Avoid weekends (optional)
   - Peak hours (10-12, 14-16) = higher density
   - Off-peak hours = lower density

3. **Load Balancing:**
   - Dynamic OLD assignment based on active sessions
   - Auto-skip offline sessions
   - Failover ke backup OLD

4. **Analytics:**
   - Per-day success rate
   - Per-OLD performance
   - Response time distribution

5. **Pause/Resume:**
   - Pause campaign during certain hours
   - Resume next day
   - Edit schedule on-the-fly

## Tidak Perlu Python!

**Kenapa TypeScript cukup:**
- ✅ Luxon DateTime untuk timezone handling
- ✅ Array methods untuk data manipulation
- ✅ Express async/await untuk background processing
- ✅ TypeScript type safety mencegah bugs
- ✅ Docker deployment mudah

**Python cuma butuh kalau:**
- Machine learning untuk pattern detection
- Heavy data science (pandas, numpy)
- Complex algorithm optimization

**Untuk campaign scheduling:** TypeScript sudah **lebih dari cukup**! 🎉
