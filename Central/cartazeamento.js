const $ = id => document.getElementById(id);
let session = null;
let frameReady = false;
let handshakeTimer = null;
let handshakeAttempts = 0;

async function getSession() {
  const s = await supabaseClient.auth.getSession();
  return s.data.session;
}

async function enviarTokenParaFrame() {
  const frame = $('cartFrame');
  if (!frame || frame.hidden || !frame.src) return;

  const s = await getSession();
  if (!s?.access_token) return;

  try {
    // O iframe pode estar momentaneamente em about:blank (origem da Central)
    // enquanto navega para o Flask (5000). Nesse instante, usar o origin 5000
    // causa o erro de target origin. O iframe valida e origem/source do remetente,
    // então enviamos para a janela do iframe com '*' durante o handshake.
    frame.contentWindow?.postMessage(
      { type: 'RIVER_CARTAZEAMENTO_AUTH', accessToken: s.access_token, token: s.access_token },
      '*'
    );
  } catch (e) {
    console.error('Erro ao enviar autenticação ao Cartazeamento:', e);
  }
}

function iniciarHandshake() {
  clearInterval(handshakeTimer);
  handshakeAttempts = 0;
  handshakeTimer = setInterval(async () => {
    handshakeAttempts++;
    await enviarTokenParaFrame();
    if (handshakeAttempts >= 60) {
      clearInterval(handshakeTimer);
      handshakeTimer = null;
    }
  }, 250);
}

async function init() {
  const s = await getSession();
  session = s;

  if (!session) {
    location.href = 'login.html';
    return;
  }

  const { data: a, error } = await supabaseClient.rpc('verificar_acesso_cliente');
  const access = Array.isArray(a) ? a[0] : a;

  if (error || !access?.permitido) {
    await supabaseClient.auth.signOut();
    location.href = 'login.html?status=' + encodeURIComponent(access?.motivo || 'bloqueado');
    return;
  }

  $('name').textContent = access.nome || 'Cliente';
  $('moduleStatus').textContent = 'Acesso liberado';

  const { data: mods, error: modError } = await supabaseClient
    .from('modulos')
    .select('id,slug,ativo')
    .eq('slug', 'cartazeamento')
    .eq('ativo', true)
    .limit(1);

  if (modError) {
    console.error('Erro ao consultar Cartazeamento:', modError);
  }

  const mod = mods?.[0];

  const { data: perms, error: permError } = await supabaseClient
    .from('cliente_modulos')
    .select('modulo_id,ativo')
    .eq('cliente_id', access.cliente_id)
    .eq('ativo', true);

  if (permError) {
    console.error('Erro ao consultar permissões:', permError);
  }

  if (!mod || !perms?.some(p => p.modulo_id === mod.id)) {
    $('moduleStatus').textContent = 'Módulo bloqueado';
    $('cartFrame').hidden = true;
    $('setupBox').hidden = false;
    $('setupBox').innerHTML = '<h2>Cartazeamento não liberado</h2><p>Este módulo ainda não está disponível para sua conta.</p>';
    return;
  }

  const backend = String(window.RIVER_CONFIG.cartazeamentoBackendUrl || '')
    .trim()
    .replace(/\/$/, '');

  if (!backend) {
    $('cartFrame').hidden = true;
    $('setupBox').hidden = false;
    $('setupBox').innerHTML = '<h2>Cartazeamento ainda não publicado</h2><p>O módulo já está preparado na Central, mas o endereço do servidor do Cartazeamento ainda não foi configurado.</p><code>cartazeamentoBackendUrl</code>';
    return;
  }

  const frame = $('cartFrame');
  frame.hidden = false;
  frame.src = backend + '/';

  frame.addEventListener('load', () => {
    // Só iniciamos as tentativas depois que o iframe terminou a navegação.
    // Isso evita disparos contra o about:blank inicial da própria Central.
    enviarTokenParaFrame();
    iniciarHandshake();
    setTimeout(enviarTokenParaFrame, 100);
    setTimeout(enviarTokenParaFrame, 500);
    setTimeout(enviarTokenParaFrame, 1500);
  }, { once: false });
}

window.addEventListener('message', async e => {
  if (!e.data || e.data.type !== 'RIVER_CARTAZEAMENTO_READY') return;

  const frame = $('cartFrame');
  if (!frame?.contentWindow || !frame.src) return;

  let backend;
  try {
    backend = new URL(frame.src).origin;
  } catch {
    return;
  }

  if (e.origin !== backend || e.source !== frame.contentWindow) return;

  frameReady = true;
  await enviarTokenParaFrame();
});

supabaseClient.auth.onAuthStateChange((_event, s) => {
  session = s;
  if (s?.access_token) enviarTokenParaFrame();
});

$('out').onclick = async () => {
  await supabaseClient.auth.signOut();
  location.href = 'login.html';
};

init();
