# Setup Multi-Domain di 1 VPS

## Arsitektur

```
VPS (1 server)
├── Nginx :80 (reverse proxy)
│   ├── domain1.com → localhost:3000 (App 1)
│   ├── domain2.com → localhost:3001 (App 2)
│   └── domain3.com → localhost:3002 (App 3)
├── /opt/warmup-app1 (App 1)
│   └── Docker containers: web:3000, api:4000
├── /opt/warmup-app2 (App 2)
│   └── Docker containers: web:3001, api:4001
└── /opt/warmup-app3 (App 3)
    └── Docker containers: web:3002, api:4002
```

## Step-by-Step Setup

### 1. Persiapan VPS

```bash
# Install dependencies
apt update
apt install -y nginx docker.io docker-compose git certbot python3-certbot-nginx

# Enable Docker
systemctl enable docker
systemctl start docker
```

### 2. Deploy App 1 (domain1.com)

```bash
# Clone project
cd /opt
git clone https://github.com/yourusername/warmup.git warmup-app1
cd warmup-app1

# Build dan run dengan docker-compose default
docker-compose up -d

# Check logs
docker-compose logs -f
```

**Ports App 1:**
- Web: 3000
- API: 4000

### 3. Deploy App 2 (domain2.com)

```bash
# Clone project ke folder berbeda
cd /opt
git clone https://github.com/yourusername/warmup.git warmup-app2
cd warmup-app2

# Build dan run dengan docker-compose.app2.yml
docker-compose -f docker-compose.app2.yml up -d

# Check logs
docker-compose -f docker-compose.app2.yml logs -f
```

**Ports App 2:**
- Web: 3001
- API: 4001

### 4. Deploy App 3 (domain3.com)

```bash
cd /opt
git clone https://github.com/yourusername/warmup.git warmup-app3
cd warmup-app3

docker-compose -f docker-compose.app3.yml up -d
docker-compose -f docker-compose.app3.yml logs -f
```

**Ports App 3:**
- Web: 3002
- API: 4002

### 5. Setup Nginx Reverse Proxy

```bash
# Copy nginx config
nano /etc/nginx/sites-available/warmup-multi

# Paste isi dari nginx-multi-domain.conf
# Edit domain1.com, domain2.com, domain3.com sesuai domain Anda

# Enable site
ln -s /etc/nginx/sites-available/warmup-multi /etc/nginx/sites-enabled/

# Remove default site (optional)
rm /etc/nginx/sites-enabled/default

# Test config
nginx -t

# Reload nginx
systemctl reload nginx
```

### 6. Setup DNS

Di registrar domain Anda (Cloudflare/Namecheap/etc):

```
domain1.com    A    <VPS_IP>
domain2.com    A    <VPS_IP>
domain3.com    A    <VPS_IP>
```

Wait 5-10 menit untuk DNS propagation.

### 7. Setup SSL (HTTPS)

```bash
# Install certificates untuk semua domain
certbot --nginx -d domain1.com -d www.domain1.com
certbot --nginx -d domain2.com -d www.domain2.com
certbot --nginx -d domain3.com -d www.domain3.com

# Auto renewal
systemctl enable certbot.timer
```

## Verifikasi

### Test App 1
```bash
curl http://domain1.com
curl http://domain1.com/api/health
```

### Test App 2
```bash
curl http://domain2.com
curl http://domain2.com/api/health
```

### Test App 3
```bash
curl http://domain3.com
curl http://domain3.com/api/health
```

## Management Commands

### Stop/Start Apps

```bash
# App 1
cd /opt/warmup-app1
docker-compose stop
docker-compose start

# App 2
cd /opt/warmup-app2
docker-compose -f docker-compose.app2.yml stop
docker-compose -f docker-compose.app2.yml start

# App 3
cd /opt/warmup-app3
docker-compose -f docker-compose.app3.yml stop
docker-compose -f docker-compose.app3.yml start
```

### Update Apps

```bash
# App 1
cd /opt/warmup-app1
git pull
docker-compose down
docker-compose up -d --build

# App 2
cd /opt/warmup-app2
git pull
docker-compose -f docker-compose.app2.yml down
docker-compose -f docker-compose.app2.yml up -d --build

# App 3
cd /opt/warmup-app3
git pull
docker-compose -f docker-compose.app3.yml down
docker-compose -f docker-compose.app3.yml up -d --build
```

### View Logs

```bash
# App 1
cd /opt/warmup-app1
docker-compose logs -f api

# App 2
cd /opt/warmup-app2
docker-compose -f docker-compose.app2.yml logs -f api

# App 3
cd /opt/warmup-app3
docker-compose -f docker-compose.app3.yml logs -f api
```

## WAHA Setup Options

### Option A: Shared WAHA (Recommended)

Run 1 WAHA instance di port 3001, semua app akses WAHA yang sama:

```bash
docker run -d \
  --name waha \
  -p 3001:3000 \
  -v waha-data:/app/.sessions \
  --restart unless-stopped \
  devlikeapro/waha:latest
```

**Pro:** Hemat resource (1 WAHA untuk 3 apps)
**Con:** Shared sessions (harus manage session names dengan hati-hati)

### Option B: Dedicated WAHA per App

```bash
# WAHA untuk App 1
docker run -d --name waha-app1 -p 3001:3000 \
  -v waha-app1-data:/app/.sessions \
  devlikeapro/waha:latest

# WAHA untuk App 2
docker run -d --name waha-app2 -p 3002:3000 \
  -v waha-app2-data:/app/.sessions \
  devlikeapro/waha:latest

# WAHA untuk App 3
docker run -d --name waha-app3 -p 3003:3000 \
  -v waha-app3-data:/app/.sessions \
  devlikeapro/waha:latest
```

**Pro:** Isolasi penuh antar app
**Con:** 3x resource usage

Update docker-compose env:
```yaml
# App 2
WAHA_URL=http://host.docker.internal:3002

# App 3
WAHA_URL=http://host.docker.internal:3003
```

## Resource Requirements

### Minimal (3 Apps + Shared WAHA):
- **CPU:** 2 cores
- **RAM:** 4GB
- **Storage:** 20GB SSD

### Recommended (3 Apps + Dedicated WAHA):
- **CPU:** 4 cores
- **RAM:** 8GB
- **Storage:** 40GB SSD

## Troubleshooting

### Port Already in Use

```bash
# Check port usage
netstat -tulpn | grep :3000
netstat -tulpn | grep :4000

# Kill process if needed
kill -9 <PID>
```

### Nginx Not Routing

```bash
# Check nginx error log
tail -f /var/log/nginx/error.log

# Check nginx status
systemctl status nginx

# Restart nginx
systemctl restart nginx
```

### Container Not Starting

```bash
# Check Docker logs
docker logs <container_id>

# Check disk space
df -h

# Check memory
free -h
```

### Domain Not Resolving

```bash
# Check DNS propagation
nslookup domain1.com
dig domain1.com

# Test local connection
curl -H "Host: domain1.com" http://localhost:3000
```

## Security Notes

1. **Firewall:** Only open ports 80, 443, 22 (SSH)
   ```bash
   ufw allow 22
   ufw allow 80
   ufw allow 443
   ufw enable
   ```

2. **Change default passwords** di semua apps

3. **Enable fail2ban** untuk SSH protection
   ```bash
   apt install fail2ban
   systemctl enable fail2ban
   ```

4. **Regular updates**
   ```bash
   apt update && apt upgrade -y
   ```

## Monitoring

### Check All Containers

```bash
docker ps -a | grep warmup
```

### Check Resource Usage

```bash
docker stats
```

### Check Nginx Access

```bash
tail -f /var/log/nginx/access.log
```
