(async function(){
  const ctx = await protegerModulo('river-music','River Music');
  if(!ctx) return;
  window.riverMusicSession = ctx.session;

  const out = document.getElementById('out');
  if(out){
    out.textContent = 'Sair';
    out.addEventListener('click', sairModulo);
  }

  const base = String(window.RIVER_CONFIG?.riverMusicBackendUrl || '').trim();
  if(!base){
    const box = document.createElement('div');
    box.className='river-config-warning';
    box.innerHTML='<strong>River Music ainda não configurado.</strong><span>Configure <code>riverMusicBackendUrl</code> em <code>config.js</code> para conectar o servidor do River Music.</span>';
    document.querySelector('main')?.prepend(box);
    return;
  }

  // Reenvia/atualiza o token antes de cada pesquisa, evitando sessão expirada.
  supabaseClient.auth.onAuthStateChange((_event, session)=>{
    window.riverMusicSession=session;
  });

  const script=document.createElement('script');
  script.src='rivermusic-core.js';
  script.defer=true;
  document.body.appendChild(script);
})();
