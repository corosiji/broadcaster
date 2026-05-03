# Radio Online Node.js (Windows Ready)

Project ini menyediakan dashboard web untuk operator radio internal:
- Tombol **START SIARAN** untuk menjalankan FFmpeg.
- Tombol **STOP SIARAN** untuk menghentikan FFmpeg.
- Status **ON AIR / OFF AIR** realtime.
- Audio player untuk monitor stream Icecast.

## 1) Install Node.js
Install Node.js LTS dari https://nodejs.org

## 2) Install FFmpeg
Install FFmpeg for Windows dan pastikan `ffmpeg` bisa dipanggil dari Command Prompt.

## 3) Install Icecast
Install Icecast dan pastikan server jalan di `localhost:8000` (atau sesuaikan `.env`).

## 4) Cek nama microphone Windows
Jalankan perintah:

```bash
ffmpeg -list_devices true -f dshow -i dummy
```

Ambil nama mic dari output lalu isi ke `AUDIO_DEVICE` di `.env`.

## 5) Isi file .env
Copy contoh env:

```bash
copy .env.example .env
```

Isi value sesuai mesin target:

```env
ICECAST_HOST=localhost
ICECAST_PORT=8000
ICECAST_MOUNT=/radio
ICECAST_USER=source
ICECAST_PASSWORD=hackme
AUDIO_DEVICE=Microphone (Realtek(R) Audio)
PORT=3000
```

## 6) Jalankan aplikasi

```bash
npm install
npm start
```

## 7) Akses dashboard
Buka browser:

```text
http://localhost:3000
```

## Endpoint API
- `GET /api/status`
- `POST /api/start-broadcast`
- `POST /api/stop-broadcast`

## Catatan perilaku
- Jika siaran sudah berjalan, tombol START tidak membuat proses FFmpeg baru.
- Jika siaran belum berjalan, tombol STOP tetap aman dan tidak error.
- Jika FFmpeg berhenti sendiri/error, status otomatis kembali OFF AIR.
