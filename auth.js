// ============== LOGIN GATE ==============
const AUTH_HASH = 'f4141f5709d398856860da5b1f53ee2a597dc80e19d99d60575263fa376c431e';

async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkLogin() {
  const pw = document.getElementById('loginPassword').value;
  const hash = await hashPassword(pw);
  if (hash === AUTH_HASH) {
    sessionStorage.setItem('dashboard_auth', 'ok');
    unlockDashboard();
  } else {
    document.getElementById('loginError').style.display = 'block';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginPassword').focus();
  }
}

function unlockDashboard() {
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';
  // Route based on current hash (e.g. direct link to #/krka)
  const hash = window.location.hash || '';
  const match = hash.match(/^#\/(\w+)$/);
  if (match && CLIENTS[match[1]]) {
    openClient(match[1]);
  }
}

// Auto-unlock ako je već ulogovan u ovom tabu
if (sessionStorage.getItem('dashboard_auth') === 'ok') {
  unlockDashboard();
} else {
  document.getElementById('loginPassword').focus();
}
