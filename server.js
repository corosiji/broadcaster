const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3000);
const ICECAST_HOST = process.env.ICECAST_HOST || 'localhost';
const ICECAST_PORT = Number(process.env.ICECAST_PORT || 8000);
const ICECAST_MOUNT = process.env.ICECAST_MOUNT || '/radio';
const ICECAST_USER = process.env.ICECAST_USER || 'source';
const ICECAST_PASSWORD = process.env.ICECAST_PASSWORD || '';
const AUDIO_DEVICE = process.env.AUDIO_DEVICE || 'Microphone (Realtek(R) Audio)';

let ffmpegProcess = null;
let broadcastStatus = 'OFF AIR';
let lastError = '';

function streamUrl() {
  return `http://${ICECAST_HOST}:${ICECAST_PORT}${ICECAST_MOUNT}`;
}

function getStatus() {
  return {
    status: broadcastStatus,
    isOnAir: broadcastStatus === 'ON AIR',
    streamUrl: streamUrl(),
    audioDevice: AUDIO_DEVICE,
    pid: ffmpegProcess ? ffmpegProcess.pid : null,
    lastError,
  };
}

function buildFfmpegArgs() {
  const icecastTarget = `icecast://${ICECAST_USER}:${encodeURIComponent(ICECAST_PASSWORD)}@${ICECAST_HOST}:${ICECAST_PORT}${ICECAST_MOUNT}`;
  return [
    '-f', 'dshow',
    '-i', `audio=${AUDIO_DEVICE}`,
    '-acodec', 'libmp3lame',
    '-b:a', '128k',
    '-content_type', 'audio/mpeg',
    '-f', 'mp3',
    icecastTarget,
  ];
}

function startBroadcast() {
  if (ffmpegProcess) {
    return { ok: true, message: 'Siaran sudah berjalan.', ...getStatus() };
  }

  lastError = '';
  const args = buildFfmpegArgs();
  const child = spawn('ffmpeg', args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  ffmpegProcess = child;
  broadcastStatus = 'ON AIR';

  child.stderr.on('data', (buf) => {
    const msg = String(buf || '').trim();
    if (msg) lastError = msg;
  });

  child.on('exit', () => {
    ffmpegProcess = null;
    broadcastStatus = 'OFF AIR';
  });

  child.on('error', (err) => {
    lastError = err.message;
    ffmpegProcess = null;
    broadcastStatus = 'OFF AIR';
  });

  return { ok: true, message: 'Siaran dimulai.', ...getStatus() };
}

function stopBroadcast() {
  if (!ffmpegProcess) {
    broadcastStatus = 'OFF AIR';
    return { ok: true, message: 'Siaran sudah berhenti.', ...getStatus() };
  }

  ffmpegProcess.kill('SIGINT');
  return { ok: true, message: 'Perintah stop dikirim.', ...getStatus() };
}

app.get('/api/status', (req, res) => res.json(getStatus()));
app.post('/api/start-broadcast', (req, res) => res.json(startBroadcast()));
app.post('/api/stop-broadcast', (req, res) => res.json(stopBroadcast()));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard berjalan di http://localhost:${PORT}`);
  console.log(`Stream URL: ${streamUrl()}`);
});
