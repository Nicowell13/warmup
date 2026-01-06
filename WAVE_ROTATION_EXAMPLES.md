# Wave Rotation - Contoh Konfigurasi

## Contoh 1: Small Testing (2 OLD, 4 NEW)

### API Request
```bash
curl -X POST http://localhost:4000/automations/wa12 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Wave Test - 2 OLD x 4 NEW",
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

### Expected Result
- **2 Waves** (2 OLD sessions)
- **Total duration:** 6 hari (2 waves × 3 hari)
- **Tasks per wave:** ~96 tasks (4 NEW × 24 msg × 2 clusters)
- **Total tasks:** ~192 tasks

### Wave Schedule
```
Wave 1 (Day 1-3):
  old-1 → new-1 (628111@c.us), new-2 (628222@c.us)
  old-2 → new-3 (628333@c.us), new-4 (628444@c.us)
  
Wave 2 (Day 4-6):
  old-1 → new-3 (628333@c.us), new-4 (628444@c.us)  ← Rotasi!
  old-2 → new-1 (628111@c.us), new-2 (628222@c.us)  ← Rotasi!
```

---

## Contoh 2: Medium Production (5 OLD, 10 NEW)

### API Request
```bash
curl -X POST http://localhost:4000/automations/wa12 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Wave Prod - 5 OLD x 10 NEW",
    "newChatIds": [
      "628111111111@c.us",
      "628222222222@c.us",
      "628333333333@c.us",
      "628444444444@c.us",
      "628555555555@c.us",
      "628666666666@c.us",
      "628777777777@c.us",
      "628888888888@c.us",
      "628999999999@c.us",
      "628000000000@c.us"
    ],
    "oldSessionNames": ["old-1", "old-2", "old-3", "old-4", "old-5"],
    "timezone": "Asia/Jakarta",
    "windowStart": "08:00",
    "windowEnd": "22:00"
  }'
```

### Expected Result
- **5 Waves** (5 OLD sessions)
- **Total duration:** 15 hari (5 waves × 3 hari)
- **Tasks per wave:** ~288 tasks (10 NEW × 24 msg × 2 clusters ÷ 5 OLD × pairs)
- **Total tasks:** ~1,440 tasks

### Wave Schedule
```
Wave 1 (Day 1-3):
  old-1 → new-1, new-2
  old-2 → new-3, new-4
  old-3 → new-5, new-6
  old-4 → new-7, new-8
  old-5 → new-9, new-10
  
Wave 2 (Day 4-6):
  old-1 → new-3, new-4   (dari old-2)
  old-2 → new-5, new-6   (dari old-3)
  old-3 → new-7, new-8   (dari old-4)
  old-4 → new-9, new-10  (dari old-5)
  old-5 → new-1, new-2   (dari old-1)
  
Wave 3 (Day 7-9):
  old-1 → new-5, new-6   (dari old-3)
  old-2 → new-7, new-8   (dari old-4)
  old-3 → new-9, new-10  (dari old-5)
  old-4 → new-1, new-2   (dari old-1)
  old-5 → new-3, new-4   (dari old-2)
  
Wave 4 (Day 10-12):
  old-1 → new-7, new-8   (dari old-4)
  old-2 → new-9, new-10  (dari old-5)
  old-3 → new-1, new-2   (dari old-1)
  old-4 → new-3, new-4   (dari old-2)
  old-5 → new-5, new-6   (dari old-3)
  
Wave 5 (Day 13-15):
  old-1 → new-9, new-10  (dari old-5)
  old-2 → new-1, new-2   (dari old-1)
  old-3 → new-3, new-4   (dari old-2)
  old-4 → new-5, new-6   (dari old-3)
  old-5 → new-7, new-8   (dari old-4)
```

---

## Contoh 3: Large Scale (10 OLD, 30 NEW)

### API Request
```bash
curl -X POST http://localhost:4000/automations/wa12 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Wave Large - 10 OLD x 30 NEW",
    "newChatIds": [
      "628111111111@c.us",
      "628222222222@c.us",
      ... (30 numbers total)
    ],
    "oldSessionNames": [
      "old-1", "old-2", "old-3", "old-4", "old-5",
      "old-6", "old-7", "old-8", "old-9", "old-10"
    ],
    "timezone": "Asia/Jakarta",
    "windowStart": "08:00",
    "windowEnd": "22:00"
  }'
```

### Expected Result
- **10 Waves** (10 OLD sessions)
- **Total duration:** 30 hari (10 waves × 3 hari)
- **Tasks per wave:** ~864 tasks
- **Total tasks:** ~8,640 tasks

---

## Monitoring Logs

### Campaign Start
```
🚀 Starting campaign xxx-xxx-xxx: 10 targets, 5 waves
📅 Campaign schedule: 5 waves × 24 msg/wave, 3 days, 8 msg/day, window 8:00-22:00

🌊 === WAVE 1/5 ===
   old-1 → 2 targets (from old-1)
   old-2 → 2 targets (from old-2)
   old-3 → 2 targets (from old-3)
   old-4 → 2 targets (from old-4)
   old-5 → 2 targets (from old-5)
   📆 Wave 1 Day 1 (Absolute Day 1) starts at: 2026-01-06 08:14
      Window: 840 min, 96 tasks, delay: 7 min/task
      ✅ Day 1: 96 message tasks
   📆 Wave 1 Day 2 (Absolute Day 2) starts at: 2026-01-07 08:00
   ...
   ✅ Wave 1 complete: 288 tasks, next wave starts at ...

🌊 === WAVE 2/5 ===
   old-1 → 2 targets (from old-2)  ← Rotasi!
   old-2 → 2 targets (from old-3)
   ...
```

### Runtime (Scheduler)
```
⚙️ Scheduler: 10 tasks due, executing...
🌊 Wave 2 pairing reset: 10 NEW sessions updated
   📤 OLD old-1 → 628xxx...
   📤 NEW new-3 → 628yyy...
   📤 OLD old-1 → 628zzz...
   📤 NEW new-4 → 628yyy...
```

---

## Verification Checklist

### Pre-Campaign
- [ ] Semua OLD sessions connected di WAHA
- [ ] Semua NEW sessions connected di WAHA
- [ ] Script text tidak kosong untuk semua sessions
- [ ] Target chatIds format benar (628xxx@c.us)
- [ ] OLD dan NEW sessions sudah di-setup dengan cluster yang benar

### Post-Campaign Start
- [ ] Log menunjukkan: "✅ Pair: new-X → old-Y"
- [ ] Total tasks sesuai perhitungan: `waves × 288` (untuk 2 NEW/OLD)
- [ ] Tidak ada error: "❌ NEW target has no session mapping"
- [ ] Check progress UI: pending tasks muncul

### During Wave Execution
- [ ] Monitor scheduler logs setiap hari
- [ ] Check wave reset logs: "🌊 Wave X pairing reset"
- [ ] Verify pairing rotasi sesuai formula
- [ ] Check window compliance: tasks execute 8-22 saja
- [ ] Monitor error rate (target < 5%)

### After Each Wave
- [ ] Check sent count untuk wave tersebut
- [ ] Verify conversation history di WhatsApp
- [ ] Check next wave starts on schedule
- [ ] Monitor NEW auto-reply (should be suppressed)

### After Campaign Complete
- [ ] All tasks marked as 'sent' or 'error'
- [ ] Error rate < 10%
- [ ] All NEW accounts punya conversation dengan semua OLD
- [ ] Review metrics untuk optimization

---

## Common Issues & Solutions

### Issue 1: Wave tidak start
**Log:** Tidak ada "🌊 Wave X pairing reset" di scheduler

**Causes:**
- Wave reset task tidak terbuat
- Task status stuck di 'pending'
- Scheduler tidak running

**Fix:**
```bash
# Check wave reset tasks
curl http://localhost:4000/automations/:id/tasks \
  -H "Authorization: Bearer YOUR_JWT"
  
# Look for tasks with kind: 'wa12-wave-reset'
# Verify dueAt in the future

# Restart API if needed
docker-compose restart api
```

### Issue 2: Rotasi tidak benar
**Log:** old-1 terus dapat targets yang sama di wave berbeda

**Causes:**
- Bug di rotation formula
- targetsByOld tidak terdistribusi benar

**Debug:**
```typescript
// Check rotation formula
console.log('Wave', waveIndex, 'OldIdx', oldIdx, 
  'SourceOld', (oldIdx + waveIndex) % oldSessions.length);
```

### Issue 3: Tasks skip/error rate tinggi
**Log:** Banyak tasks status 'error'

**Causes:**
- OLD/NEW session offline
- Script kosong atau invalid
- WAHA connection issues

**Fix:**
1. Check session status di WAHA UI
2. Verify scripts di sessions page
3. Check WAHA logs untuk connection errors
4. Retry failed tasks manual jika perlu

---

## Tips & Best Practices

### 1. Start Small
Test dengan 2 OLD × 4 NEW dulu sebelum scale ke production

### 2. Script Variety
Buat script berbeda untuk tiap OLD untuk variasi natural

### 3. Timing
Start campaign pagi hari (08:00-09:00) weekday untuk best results

### 4. Monitoring
Setup alerts untuk error rate > 10% atau scheduler down

### 5. Backup
Keep 1-2 OLD sessions sebagai backup jika ada yang offline

### 6. Gradual Scale
- Week 1: 2 OLD × 4 NEW (test)
- Week 2: 3 OLD × 6 NEW (verify)
- Week 3: 5 OLD × 10 NEW (production)
- Week 4+: Scale up as needed

---

## Next Steps

1. **Setup Sessions:**
   - Create OLD sessions (old-1, old-2, ...)
   - Create NEW sessions (new-1, new-2, ...)
   - Connect all via WAHA (QR/Pairing)
   - Add scripts to each session

2. **Test Small:**
   - Run example 1 (2 OLD × 4 NEW)
   - Monitor untuk 1-2 waves
   - Verify rotasi bekerja

3. **Scale Production:**
   - Run example 2 (5 OLD × 10 NEW)
   - Monitor full campaign (15 days)
   - Analyze metrics

4. **Optimize:**
   - Adjust scripts based on results
   - Fine-tune window timing
   - Scale OLD/NEW ratio as needed

Selamat mencoba wave rotation! 🚀🌊
