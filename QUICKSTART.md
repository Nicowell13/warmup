# Quick Start - Wave Rotation

## 🚀 Mulai dalam 5 Menit!

### Prerequisites
✅ Docker & Docker Compose installed  
✅ 2+ OLD WhatsApp accounts ready  
✅ 4+ NEW WhatsApp accounts ready  

### Step 1: Start Services (2 menit)

```bash
# Clone atau sudah punya repo
cd warmup

# Start semua services
docker-compose up -d

# Wait 30 seconds untuk services ready
# Check status
docker-compose ps
```

Services akan running di:
- **WAHA:** http://localhost:3001
- **API:** http://localhost:4001
- **Web UI:** http://localhost:4000

### Step 2: Connect Sessions (1 menit)

1. **Buka Web UI:** http://localhost:4000
2. **Login:** username `admin`, password `admin`
3. **Go to Sessions page**
4. **Add OLD sessions:**
   - Name: `old-1`, Cluster: `old`
   - Name: `old-2`, Cluster: `old`
   - Connect via QR/Pairing code
5. **Add NEW sessions:**
   - Name: `new-1`, Cluster: `new`
   - Name: `new-2`, Cluster: `new`
   - Name: `new-3`, Cluster: `new`
   - Name: `new-4`, Cluster: `new`
   - Connect via QR/Pairing code

### Step 3: Add Scripts (30 detik)

For each session:
1. Click "Edit"
2. Enable "Auto Reply"
3. Mode: "Script"
4. Add script text (sample below)
5. Set parity:
   - OLD: "Odd lines"
   - NEW: "Even lines"

**Sample Script:**
```
Halo!
Hai juga!
Apa kabar?
Baik! Kamu gimana?
Alhamdulillah baik
Senang denger itu
Lagi ngapain?
Lagi santai aja
```

### Step 4: Start Campaign (30 detik)

#### Option A: Via UI (Coming Soon)
Go to Campaigns → Create New → Fill form

#### Option B: Via API

```bash
# Get JWT token first
TOKEN=$(curl -X POST http://localhost:4001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | jq -r .token)

# Start wave campaign
curl -X POST http://localhost:4001/automations/wa12 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "My First Wave Campaign",
    "newChatIds": [
      "6281111111111@c.us",
      "6282222222222@c.us",
      "6283333333333@c.us",
      "6284444444444@c.us"
    ],
    "oldSessionNames": ["old-1", "old-2"],
    "timezone": "Asia/Jakarta",
    "windowStart": "08:00",
    "windowEnd": "22:00"
  }'
```

**Note:** Ganti nomor dengan chatId NEW yang sebenarnya!

### Step 5: Monitor (Ongoing)

#### Check Logs
```bash
# API logs (scheduler activity)
docker logs -f warmup-api-1

# Look for:
# 🚀 Starting campaign
# 🌊 === WAVE 1/2 ===
# ⚙️ Scheduler: X tasks due
# 📤 OLD old-1 → 628xxx...
```

#### Check Progress via API
```bash
# Get campaign progress
curl http://localhost:4001/automations \
  -H "Authorization: Bearer $TOKEN"
```

#### Check via UI
Go to: http://localhost:4000/automations

---

## 📊 Expected Results

### Timeline (2 OLD × 4 NEW):
```
Day 1-3:   Wave 1 (OLD-1→NEW-1,2 | OLD-2→NEW-3,4)
           96 tasks (48 per OLD)
           
Day 4-6:   Wave 2 (OLD-1→NEW-3,4 | OLD-2→NEW-1,2) ← Rotasi!
           96 tasks (48 per OLD)
           
Total: 6 days, 192 tasks
```

### Conversation Pattern:
- NEW-1 will chat with OLD-1 (Wave 1) and OLD-2 (Wave 2)
- NEW-2 will chat with OLD-1 (Wave 1) and OLD-2 (Wave 2)
- NEW-3 will chat with OLD-2 (Wave 1) and OLD-1 (Wave 2)
- NEW-4 will chat with OLD-2 (Wave 1) and OLD-1 (Wave 2)

**Result:** Each NEW interacts with 2 different OLD accounts naturally!

---

## ✅ Verification Checklist

After campaign starts:

- [ ] Check logs: "🚀 Starting campaign"
- [ ] Check logs: "🌊 === WAVE 1/2 ==="
- [ ] Check logs: "✅ Wave 1 complete: X tasks"
- [ ] Verify tasks in database/UI
- [ ] Check first messages arriving (within 15-30 seconds)
- [ ] Monitor scheduler logs every hour
- [ ] After 3 days: Check "🌊 Wave 2 pairing reset"
- [ ] After 6 days: All tasks should be 'sent'

---

## 🐛 Troubleshooting

### Issue: Campaign not starting
**Check:**
```bash
# 1. Check API logs
docker logs warmup-api-1 | grep "Starting campaign"

# 2. Check if sessions connected
curl http://localhost:4001/waha/sessions/status \
  -H "Authorization: Bearer $TOKEN"

# 3. Verify sessions have scripts
curl http://localhost:4001/sessions \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.sessions[] | {name:.wahaSession, cluster:.cluster, script:.autoReplyScriptText}'
```

**Fix:** Ensure all OLD and NEW sessions are connected and have scripts.

### Issue: No tasks executing
**Check:**
```bash
# Check scheduler logs
docker logs -f warmup-api-1 | grep "Scheduler"

# Should see every 15 seconds:
# ⚙️ Scheduler: X tasks due, executing...
```

**Fix:** 
- Restart API: `docker-compose restart api`
- Check timezone setting
- Verify task dueAt times

### Issue: Wave 2 not starting
**Check:**
```bash
# Check for wave reset task
curl http://localhost:4001/automations/:automationId/tasks \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.tasks[] | select(.kind == "wa12-wave-reset")'
```

**Fix:** Verify wave reset task was created and has correct dueAt.

### Issue: High error rate
**Common causes:**
- Session disconnected
- Script empty
- WAHA API issues

**Check:**
```bash
# Get error details
curl http://localhost:4001/automations/:automationId/progress \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.recentErrors'
```

---

## 📚 Next Steps

1. **Monitor for 1-2 days** - Verify wave 1 executing correctly
2. **Check wave transition** - Verify wave 2 starts with rotation
3. **Review metrics** - Check success rate, timing, patterns
4. **Scale up** - Try with more OLD/NEW (3 OLD × 6 NEW, etc.)
5. **Optimize** - Adjust scripts, timing based on results

## 🎯 Production Recommendations

### Small Scale (Testing)
- 2 OLD × 4 NEW
- Duration: 6 days
- Good for: Initial testing, proof of concept

### Medium Scale (Production)
- 5 OLD × 10 NEW
- Duration: 15 days
- Good for: Production warmup, stable community

### Large Scale (Enterprise)
- 10 OLD × 30 NEW
- Duration: 30 days
- Good for: Large communities, multiple groups

## 📖 Documentation Links

- **[Complete Guide](WAVE_ROTATION_GUIDE.md)** - Detailed documentation
- **[Examples](WAVE_ROTATION_EXAMPLES.md)** - Configuration examples
- **[Flow Diagrams](WAVE_ROTATION_FLOW.md)** - Visual explanations
- **[Summary](WAVE_ROTATION_SUMMARY.md)** - Quick reference
- **[Changelog](CHANGELOG.md)** - Version history

## 🆘 Support

If you encounter issues:
1. Check logs first
2. Review troubleshooting section
3. Verify configuration
4. Check documentation
5. Review example configurations

---

**Ready to start? Follow Step 1 above! 🚀**

**Estimated time from zero to running campaign: 5 minutes** ⏱️
