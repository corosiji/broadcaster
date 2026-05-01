let csrfToken = '';

async function getJSON(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function initListener() {
  const player = document.getElementById('player');
  if (!player) return;

  const cfg = await getJSON('/api/config');
  const st = await getJSON('/api/state');
  const health = await getJSON('/api/health');

  player.src = cfg.data.streamUrl;
  document.getElementById('status').textContent = st.data.isLive ? '🟢 Live' : '🔴 Off Air';
  document.getElementById('programName').textContent = st.data.programName || '-';
  document.getElementById('nowPlaying').textContent = st.data.nowPlaying || '-';

  const healthText = health.data?.icecast?.online ? `Icecast online (${health.data.icecast.listeners} listeners)` : 'Icecast offline';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = healthText;
  document.querySelector('.card').appendChild(hint);

  await fetch('/api/listener/ping', { method: 'POST' }).catch(() => {});
}

async function initAdmin() {
  const loginBtn = document.getElementById('btnLogin');
  if (!loginBtn) return;

  const adminSection = document.getElementById('adminSection');
  const loginSection = document.getElementById('loginSection');

  loginBtn.onclick = async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await getJSON('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!res.ok) return alert(res.data.message || 'Login gagal');

    csrfToken = res.data.csrfToken || '';
    loginSection.style.display = 'none';
    adminSection.style.display = 'block';

    const boot = await getJSON('/api/admin/bootstrap');
    if (!boot.ok) return alert('Session gagal dimuat.');

    csrfToken = boot.data.csrfToken;
    document.getElementById('programInput').value = boot.data.state.programName;
    document.getElementById('nowPlayingInput').value = boot.data.state.nowPlaying;
    document.getElementById('isLiveInput').value = String(boot.data.state.isLive);

    const health = await getJSON('/api/health');
    document.getElementById('icecastStatus').textContent = health.data?.icecast?.online ? 'Online' : 'Offline';
  };

  document.getElementById('btnSave').onclick = async () => {
    const payload = {
      programName: document.getElementById('programInput').value,
      nowPlaying: document.getElementById('nowPlayingInput').value,
      isLive: document.getElementById('isLiveInput').value === 'true',
    };
    const res = await getJSON('/api/admin/state', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(payload),
    });
    document.getElementById('adminMessage').textContent = res.ok ? 'Tersimpan ✅' : (res.data.message || 'Gagal menyimpan ❌');
  };

  document.getElementById('btnLogout').onclick = async () => {
    await getJSON('/api/logout', { method: 'POST' });
    window.location.reload();
  };
}

initListener();
initAdmin();
