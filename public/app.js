const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const employeeTab = $('#employeeTab');
const visitorTab = $('#visitorTab');
const employeePanel = $('#employeePanel');
const visitorPanel = $('#visitorPanel');
const statusView = $('#statusView');
const toast = $('#toast');
let activeProfile = 'employee';
let toastTimer;

const portalContext = (() => {
  const query = new URLSearchParams(location.search);
  const pick = (...names) => names.map((name) => query.get(name)).find(Boolean) || '';
  return {
    clientMac: pick('clientMac', 'client_mac', 'id', 'mac'),
    apMac: pick('apMac', 'ap_mac', 'ap'),
    ssid: pick('ssid'),
    continueUrl: pick('continueUrl', 'continue_url', 'url')
  };
})();

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
}

function setProfile(profile) {
  activeProfile = profile;
  const employee = profile === 'employee';
  employeeTab.classList.toggle('active', employee);
  visitorTab.classList.toggle('active', !employee);
  employeeTab.setAttribute('aria-selected', String(employee));
  visitorTab.setAttribute('aria-selected', String(!employee));
  employeePanel.hidden = !employee;
  visitorPanel.hidden = employee;
  statusView.hidden = true;
}

employeeTab.addEventListener('click', () => setProfile('employee'));
visitorTab.addEventListener('click', () => setProfile('visitor'));

function setEmployeeStep(step) {
  const steps = $$('.flow-step');
  const connectors = $$('.flow-progress > i');
  steps.forEach((item, index) => {
    item.classList.toggle('active', index + 1 === step);
    item.classList.toggle('done', index + 1 < step);
  });
  connectors.forEach((item, index) => item.classList.toggle('done', index + 1 < step));
}

function contextQuery() {
  const params = new URLSearchParams();
  Object.entries(portalContext).forEach(([key, value]) => value && params.set(key, value));
  return params.toString();
}

$('#microsoftButton').addEventListener('click', () => {
  if (!portalContext.clientMac) {
    showToast('Dispositivo não identificado. Abra o portal a partir da rede Wi‑Fi Alliance.', true);
    return;
  }
  setEmployeeStep(2);
  location.assign(`/api/auth/login?${contextQuery()}`);
});

async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({ error: 'Resposta inválida do serviço.' }));
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a solicitação.');
  return result;
}

const voucherTab = $('#voucherTab');
const tokenTab = $('#tokenTab');
const voucherForm = $('#voucherForm');
const tokenForm = $('#tokenForm');

function setVisitorMethod(method) {
  const voucher = method === 'voucher';
  voucherTab.classList.toggle('active', voucher);
  tokenTab.classList.toggle('active', !voucher);
  voucherTab.setAttribute('aria-selected', String(voucher));
  tokenTab.setAttribute('aria-selected', String(!voucher));
  voucherForm.hidden = !voucher;
  tokenForm.hidden = voucher;
}

voucherTab.addEventListener('click', () => setVisitorMethod('voucher'));
tokenTab.addEventListener('click', () => setVisitorMethod('token'));

$('#voucherButton').addEventListener('click', async () => {
  const code = $('#voucherCode').value.trim().toUpperCase();
  if (!portalContext.clientMac) return showToast('Dispositivo não identificado pela rede UniFi.', true);
  if (!code) return showToast('Informe o código do voucher.', true);
  const button = $('#voucherButton');
  button.disabled = true;
  button.querySelector('span').textContent = 'Validando e autorizando…';
  try {
    const result = await api('/api/visitor/voucher', { code, ...portalContext });
    completeAccess('Visitante · voucher', `${result.minutes} minutos`, false);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Validar e conectar';
  }
});

$('#sendTokenButton').addEventListener('click', async () => {
  const email = $('#visitorEmail').value.trim().toLowerCase();
  const sponsor = $('#visitorSponsor').value.trim();
  if (!portalContext.clientMac) return showToast('Dispositivo não identificado pela rede UniFi.', true);
  if (!/^\S+@\S+\.\S+$/.test(email)) return showToast('Informe um e-mail válido.', true);
  if (!sponsor) return showToast('Informe o responsável na Alliance.', true);
  const button = $('#sendTokenButton');
  button.disabled = true;
  button.querySelector('span').textContent = 'Enviando token…';
  try {
    await api('/api/visitor/token/request', { email, sponsor, ...portalContext });
    $('#tokenCheck').hidden = false;
    $('#visitorToken').focus();
    showToast('Token enviado. Verifique seu e-mail.');
    button.querySelector('span').textContent = 'Reenviar token';
  } catch (error) {
    showToast(error.message, true);
    button.querySelector('span').textContent = 'Enviar token temporário';
  } finally {
    button.disabled = false;
  }
});

$('#validateTokenButton').addEventListener('click', async () => {
  const email = $('#visitorEmail').value.trim().toLowerCase();
  const token = $('#visitorToken').value.trim();
  if (!/^\d{6}$/.test(token)) return showToast('Informe o token de 6 dígitos.', true);
  const button = $('#validateTokenButton');
  button.disabled = true;
  button.textContent = 'Validando…';
  try {
    const result = await api('/api/visitor/token/verify', { email, token, ...portalContext });
    completeAccess('Visitante · token', `${result.minutes} minutos`, false);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Validar';
  }
});

function completeAccess(profile, validity, hasCallback) {
  employeePanel.hidden = true;
  visitorPanel.hidden = true;
  statusView.hidden = false;
  $('#sessionProfile').textContent = profile;
  $('#sessionValidity').textContent = validity;
  $('#callbackBox').hidden = !hasCallback;
  $('#statusTitle').textContent = 'Você está conectado.';
  $('#statusDescription').textContent = 'O UniFi autorizou este dispositivo na rede Alliance.';
  showToast('Dispositivo autorizado com sucesso.');
}

$('#restartButton').addEventListener('click', () => {
  $('#voucherCode').value = '';
  $('#visitorEmail').value = '';
  $('#visitorSponsor').value = '';
  $('#visitorToken').value = '';
  $('#tokenCheck').hidden = true;
  setEmployeeStep(1);
  setProfile(activeProfile);
});

$$('.arch-node').forEach((node) => {
  node.addEventListener('click', () => {
    $$('.arch-node').forEach((item) => item.classList.remove('active'));
    node.classList.add('active');
    $('#archDetail').textContent = node.dataset.detail;
  });
});

$('#helpButton').addEventListener('click', () => {
  showToast('Conecte-se ao SSID configurado no UniFi para que o dispositivo seja identificado.');
});

async function restoreAuthorizedSession() {
  const params = new URLSearchParams(location.search);
  if (params.get('connected') !== '1') return;
  setEmployeeStep(3);
  try {
    const response = await fetch('/api/session/status', { credentials: 'same-origin' });
    const session = await response.json();
    if (!response.ok || !session.authorized) throw new Error(session.error || 'Sessão não encontrada.');
    setEmployeeStep(4);
    completeAccess(session.profile, `${session.minutes} minutos`, session.method === 'entra');
    history.replaceState({}, '', '/');
  } catch (error) {
    showToast(error.message, true);
  }
}

restoreAuthorizedSession();
