# Office Radio (Intranet)

Aplikasi Node.js sederhana untuk radio internal kantor dengan dua dashboard:
- `/` listener
- `/admin` broadcaster/admin

## 1) Jalankan lokal

```bash
cp .env.example .env
node src/server.js --gen-pass-hash "StrongPassword123!"
# salin output ke ADMIN_PASS_HASH di .env
set -a; source .env; set +a
node src/server.js
```

Buka:
- `http://localhost:3000/`
- `http://localhost:3000/admin`

## 2) Integrasi Icecast

Pastikan Icecast aktif di server yang sama/terjangkau jaringan:
- stream mount: `STREAM_URL` (contoh `http://127.0.0.1:8000/live`)
- status endpoint: `ICECAST_STATUS_URL` (contoh `http://127.0.0.1:8000/status-json.xsl`)

Cek health:

```bash
curl -s http://127.0.0.1:3000/api/health
```

## 3) Hardening security (sudah diterapkan)

- Password hash (scrypt) via `ADMIN_PASS_HASH`
- Session TTL
- CSRF token untuk endpoint admin write
- Rate limit login per IP
- Security headers dasar

## 4) Packaging sebagai service Linux (systemd)

```bash
./deploy/install-service.sh
```

Setelah itu:

```bash
sudo systemctl status broadcaster
journalctl -u broadcaster -f
```
