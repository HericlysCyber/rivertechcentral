async function init(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href="login.html";return;}

  const {data:access,error:accessError}=await supabaseClient.rpc("verificar_acesso_cliente");
  const a=Array.isArray(access)?access[0]:access;
  if(accessError||!a||!a.permitido){
    await supabaseClient.auth.signOut();
    location.href="login.html?status="+(a?.motivo||"bloqueado");
    return;
  }

  const {data:p}=await supabaseClient.from("perfis").select("tipo,ativo").eq("id",session.user.id).single();
  if(!p||p.tipo!=="cliente"||!p.ativo){await supabaseClient.auth.signOut();location.href="login.html?status=bloqueado";return;}

  document.getElementById("name").textContent=a.nome||"Cliente";
  renderAccessNotice(a);

  const {data:m,error:modulesError}=await supabaseClient.from("modulos").select("id,nome,slug,descricao,icone,url,modo_acesso,ativo,ordem").eq("ativo",true).order("ordem");
  const {data:cm,error:permissionsError}=await supabaseClient.from("cliente_modulos").select("modulo_id,ativo").eq("cliente_id",a.cliente_id).eq("ativo",true);
  if(modulesError){
    console.error("Erro ao carregar módulos:",modulesError);
    document.getElementById("count").textContent="Erro ao carregar";
    document.getElementById("grid").innerHTML=`<div class="module disabled"><b>⚠️</b><span>Erro</span><h3>Não foi possível carregar os módulos</h3><p>${esc(modulesError.message||"Verifique a migração do banco de dados.")}</p>—</div>`;
    return;
  }
  if(permissionsError) console.error("Erro ao carregar permissões:",permissionsError);
  const ok=new Set((cm||[]).map(x=>x.modulo_id));
  const enabled=(m||[]).filter(x=>ok.has(x.id));
  document.getElementById("count").textContent=enabled.length+" liberado(s)";

  document.getElementById("grid").innerHTML=(m||[]).map(x=>{
    const released=ok.has(x.id);
    if(!released){
      return `<div class="module disabled" title="Módulo não disponível"><b>${esc(x.icone||"▦")}</b><span>Não disponível</span><h3>${esc(x.nome)}</h3><p>${esc(x.descricao||"")}</p>—</div>`;
    }
    if(x.slug==="cartazeamento" || x.modo_acesso==="interno"){
      const href=x.url||"#";
      const disabled=!x.url;
      return disabled
        ? `<div class="module disabled" title="Módulo não disponível"><b>${esc(x.icone||"▦")}</b><span>Em configuração</span><h3>${esc(x.nome)}</h3><p>${esc(x.descricao||"")}</p>—</div>`
        : `<a class="module" href="${escHref(href)}"><b>${esc(x.icone||"▦")}</b><span>Disponível</span><h3>${esc(x.nome)}</h3><p>${esc(x.descricao||"")}</p>→</a>`;
    }
    return x.url
      ? `<a class="module" href="${escUrl(x.url)}" target="_blank" rel="noopener"><b>${esc(x.icone||"▦")}</b><span>Disponível</span><h3>${esc(x.nome)}</h3><p>${esc(x.descricao||"")}</p>↗</a>`
      : `<div class="module disabled" title="Módulo não disponível"><b>${esc(x.icone||"▦")}</b><span>Em configuração</span><h3>${esc(x.nome)}</h3><p>${esc(x.descricao||"")}</p>—</div>`;
  }).join("");
}

function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function escUrl(v=""){try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:"#";}catch{return "#";}}
function escHref(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function renderAccessNotice(a){
  const box=document.getElementById("accessNotice"); if(!box)return;
  box.className="access-notice";
  if(a.fim_periodo&&a.dias_restantes<=3){
    box.classList.add(a.dias_restantes<=1?"urgent":"warning");
    box.innerHTML=`<strong>⚠️ Atenção ao seu acesso</strong><span>Seu ${a.tipo_periodo==="teste"?"período de teste":"contrato"} termina em <b>${a.dias_restantes} ${a.dias_restantes===1?"dia":"dias"}</b>.</span>`;
  }else if(a.tipo_periodo==="teste"){
    box.innerHTML=`<strong>🧪 Período de teste</strong><span>Seu teste está ativo. Restam <b>${a.dias_restantes} dias</b>.</span>`;
  }else if(a.tipo_periodo==="contrato"){
    box.innerHTML=`<strong>🟢 Contrato ativo</strong><span>Acesso válido até <b>${new Date(a.fim_periodo).toLocaleDateString("pt-BR")}</b>.</span>`;
  }else{box.classList.add("info");box.innerHTML=`<strong>ℹ️ Acesso</strong><span>Seu acesso está ativo.</span>`;}
}

init();
document.getElementById("out").onclick=async()=>{await supabaseClient.auth.signOut();location.href="login.html";};
