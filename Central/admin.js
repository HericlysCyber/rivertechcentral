let clientsData=[],modulesData=[],permissionsData=[],whatsappData=[],selectedClientId=null,resetClientId=null;
const $=id=>document.getElementById(id);
function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function date(v){return v?new Date(v).toLocaleDateString("pt-BR"):"—";}
function remaining(v){if(!v)return null;return Math.max(0,Math.ceil((new Date(v)-Date.now())/86400000));}
function access(c){
 const days=remaining(c.fim_periodo);
 if(c.bloqueio_manual)return {label:"Bloqueado manualmente",cls:"off"};
 if(!c.ativo)return {label:days===0&&c.fim_periodo?"Período expirado":"Bloqueado",cls:"off"};
 if(c.fim_periodo&&days===0)return {label:"Período expirado",cls:"off"};
 if(c.tipo_periodo==="teste")return {label:`Teste · ${days} dia${days===1?"":"s"}`,cls:days<=3?"warn":"on"};
 if(c.tipo_periodo==="contrato")return {label:`Contrato · ${days} dia${days===1?"":"s"}`,cls:days<=3?"warn":"on"};
 return {label:"Sem período",cls:"off"};
}
async function auth(){
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(!session){location.href="admin-login.html";return false;}
 const {data:p}=await supabaseClient.from("perfis").select("tipo,ativo").eq("id",session.user.id).single();
 if(!p||p.tipo!=="admin"||!p.ativo){await supabaseClient.auth.signOut();location.href="admin-login.html";return false;}
 return true;
}
async function load(){
 const [{data:mods,error:me},{data:clients,error:ce},{data:perms,error:pe},{data:was,error:we}]=await Promise.all([
  supabaseClient.from("modulos").select("id,nome,slug,icone,descricao,url,ativo,ordem").order("ordem"),
  supabaseClient.from("clientes").select("id,nome,codigo,auth_user_id,ativo,tipo_periodo,inicio_periodo,fim_periodo,bloqueio_manual").order("nome"),
  supabaseClient.from("cliente_modulos").select("cliente_id,modulo_id,ativo"),
  supabaseClient.from("whatsapp_conexoes").select("id,cliente_id,apelido,telefone_e164,provedor,status,ativo").order("created_at",{ascending:true})
 ]);
 if(me||ce||pe||we){$("clients").innerHTML=`<div class="error-state">Não foi possível carregar os dados. ${esc((me||ce||pe)?.message||"Tente novamente.")}</div>`;return;}
 modulesData=mods||[];clientsData=clients||[];permissionsData=perms||[];whatsappData=was||[];
 renderModulePicker();renderClientList();
 if(selectedClientId&&!clientsData.some(c=>c.id===selectedClientId))selectedClientId=null;
 if(!selectedClientId&&clientsData.length)selectedClientId=clientsData[0].id;
 renderDetails();
}
function renderModulePicker(){
 $("mods").innerHTML=modulesData.length?modulesData.map(m=>`<label class="module-check"><input type="checkbox" value="${m.id}" ${m.slug==="radio"?"checked":""} ${m.ativo===false?"disabled":""}><span class="module-check-icon">${esc(m.icone||"▦")}</span><span><strong>${esc(m.nome)}</strong><small>${m.ativo===false?"Módulo desativado":esc(m.descricao||"Disponível para ativação")}</small></span></label>`).join(""):`<p class="muted-box">Nenhum módulo cadastrado.</p>`;
}
function renderClientList(){
 $("clientCount").textContent=`${clientsData.length} ${clientsData.length===1?"cliente":"clientes"}`;
 $("clients").innerHTML=clientsData.length?clientsData.map(c=>{
  const enabled=modulesData.filter(m=>permissionsData.some(p=>p.cliente_id===c.id&&p.modulo_id===m.id&&p.ativo)).length,a=access(c);
  return `<button class="client-row ${selectedClientId===c.id?"selected":""}" data-client="${c.id}"><span class="client-avatar">${esc((c.nome||"C").trim().charAt(0).toUpperCase())}</span><span class="client-row-main"><strong>${esc(c.nome)}</strong><small>${esc(c.codigo||"Sem código")}</small></span><span class="client-row-side"><span class="status-dot ${a.cls}"></span><small>${a.label}</small></span></button>`;
 }).join(""):`<div class="empty-list"><span>👤</span><p>Nenhum cliente cadastrado.</p><button class="link-button" id="emptyListNew">Cadastrar cliente</button></div>`;
 document.querySelectorAll(".client-row").forEach(b=>b.onclick=()=>{selectedClientId=b.dataset.client;renderClientList();renderDetails();});
 $("emptyListNew")?.addEventListener("click",openNew);
}
function renderDetails(){
 const c=clientsData.find(x=>x.id===selectedClientId);
 if(!c){$("details").innerHTML=`<div class="empty-selection"><div class="empty-icon">👥</div><h2>Selecione um cliente</h2><p>Escolha um cliente ao lado para visualizar e controlar os módulos liberados.</p><button id="emptyNew" class="primary-action">+ Cadastrar primeiro cliente</button></div>`;$("emptyNew").onclick=openNew;return;}
 const enabled=modulesData.filter(m=>permissionsData.some(p=>p.cliente_id===c.id&&p.modulo_id===m.id&&p.ativo)),activeModules=enabled.length,a=access(c),days=remaining(c.fim_periodo);
 const expiryText=c.fim_periodo?date(c.fim_periodo):"Sem período definido";
 $("details").innerHTML=`
 <div class="detail-head"><div class="detail-identity"><div class="large-avatar">${esc((c.nome||"C").trim().charAt(0).toUpperCase())}</div><div><span class="eyebrow">CLIENTE</span><h2>${esc(c.nome)}</h2><p>${esc(c.codigo||"Sem código")} ${c.auth_user_id?"· acesso cadastrado":"· sem acesso de autenticação"}</p></div></div><div class="detail-actions"><button id="resetBtn" class="secondary">🔑 Redefinir senha</button><button id="toggleClient" class="${c.ativo?"danger-outline":"success-button"}">${c.ativo?"Bloquear cliente":"Liberar acesso"}</button></div></div>
 <div class="detail-stats"><div><span>Status</span><strong><i class="status-dot ${a.cls}"></i>${esc(a.label)}</strong></div><div><span>Módulos liberados</span><strong>${activeModules} de ${modulesData.length}</strong></div><div><span>Vencimento</span><strong>${expiryText}</strong></div></div>
 <section class="access-control"><div class="access-control-head"><div><span class="eyebrow">PERÍODO DE ACESSO</span><h3>Teste e contrato</h3><p>O vencimento é calculado pelo horário do servidor e o acesso é bloqueado automaticamente quando o período termina.</p></div><span class="access-status ${a.cls}">${esc(a.label)}</span></div>
 <div class="access-summary"><div><span>Tipo</span><strong>${c.tipo_periodo==="teste"?"Teste de 3 dias":c.tipo_periodo==="contrato"?"Contrato":"Nenhum"}</strong></div><div><span>Início</span><strong>${date(c.inicio_periodo)}</strong></div><div><span>Fim</span><strong>${expiryText}</strong></div><div><span>Restante</span><strong>${days===null?"—":days+" dia"+(days===1?"":"s")}</strong></div></div>
 <div class="period-actions"><button id="trialBtn" class="secondary">🧪 Iniciar teste · 3 dias</button><button id="contractBtn" class="primary-action">📅 Ativar contrato · 30 dias</button><button id="renewBtn" class="secondary">🔄 Renovar +30 dias</button></div></section>
 <section class="admin-whatsapp-panel"><div class="panel-title"><div><h3>WhatsApp do cliente</h3><p>Até 2 números podem ficar vinculados a esta conta.</p></div><span class="selection-count">${whatsappData.filter(w=>w.cliente_id===c.id).length}/2</span></div><div class="admin-whatsapp-list">${whatsappData.filter(w=>w.cliente_id===c.id).length?whatsappData.filter(w=>w.cliente_id===c.id).map(w=>`<div class="admin-wa-row"><div><strong>☏ ${esc(w.apelido||"WhatsApp")}</strong><small>${esc(w.telefone_e164||"—")} · ${esc(w.status||"preparando")}</small></div><button class="danger-outline admin-wa-remove" data-wa="${w.id}">Remover</button></div>`).join(""):`<div class="muted-box">Nenhum número vinculado.</div>`}</div><button id="adminAddWhatsApp" class="secondary" type="button">+ Vincular número</button></section>

 <div class="modules-panel"><div class="panel-title"><div><h3>Liberações de módulos</h3><p>Ative ou bloqueie individualmente os sistemas deste cliente.</p></div><span class="selection-count">${activeModules} liberado${activeModules===1?"":"s"}</span></div><div class="admin-module-grid">${modulesData.map(m=>{const on=permissionsData.some(p=>p.cliente_id===c.id&&p.modulo_id===m.id&&p.ativo),available=m.ativo!==false;return `<div class="admin-module-card ${on?"enabled":"disabled"} ${available?"":"unavailable"}"><div class="module-card-top"><div class="module-symbol">${esc(m.icone||"▦")}</div><span class="module-state">${available?(on?"LIBERADO":"BLOQUEADO"):"DESATIVADO"}</span></div><h4>${esc(m.nome)}</h4><p>${esc(m.descricao||"Módulo da plataforma River Tech.")}</p><label class="switch-line"><span>Disponível para cliente</span><input class="detail-perm" data-c="${c.id}" data-m="${m.id}" type="checkbox" ${on?"checked":""} ${available?"":"disabled"}><span class="switch-ui"></span></label></div>`}).join("")}</div></div>`;
 $("toggleClient").onclick=()=>toggleClient(c);$("resetBtn").onclick=()=>openPassword(c);$("trialBtn").onclick=()=>setPeriod(c,"teste",3);$("contractBtn").onclick=()=>setPeriod(c,"contrato",30);$("renewBtn").onclick=()=>renew(c);
 document.querySelectorAll(".detail-perm").forEach(i=>i.onchange=()=>toggleModule(i));
 $("adminAddWhatsApp")?.addEventListener("click",async()=>{
   const count=whatsappData.filter(w=>w.cliente_id===c.id).length; if(count>=2){alert("Este cliente já possui 2 números.");return;}
   const numero=prompt("Número em formato internacional (ex.: +55 82 99999-9999):"); if(!numero)return;
   const apelido=prompt("Apelido:",count?"WhatsApp 2":"WhatsApp principal")||"WhatsApp";
   const {error}=await supabaseClient.from("whatsapp_conexoes").insert({cliente_id:c.id,apelido,telefone_e164:numero.trim(),provedor:"meta_cloud",status:"preparando",ativo:true});
   if(error){alert(error.message);return;} await load();
 });
 document.querySelectorAll(".admin-wa-remove").forEach(b=>b.onclick=async()=>{if(!confirm("Remover este número?"))return;const {error}=await supabaseClient.from("whatsapp_conexoes").delete().eq("id",b.dataset.wa);if(error){alert(error.message);return;}await load();});
}
async function rpc(name,args){const {data,error}=await supabaseClient.rpc(name,args);if(error)throw error;return data;}
async function setPeriod(c,type,days){if(!confirm(type==="teste"?`Iniciar teste de 3 dias para ${c.nome}?`:`Ativar contrato de 30 dias para ${c.nome}?`))return;try{await rpc("admin_definir_periodo",{p_cliente_id:c.id,p_tipo:type,p_dias:days});await load();}catch(e){alert(e.message||"Não foi possível definir o período.");}}
async function renew(c){if(!confirm(`Adicionar 30 dias ao acesso de ${c.nome}?`))return;try{await rpc("admin_renovar_contrato",{p_cliente_id:c.id,p_dias:30});await load();}catch(e){alert(e.message||"Não foi possível renovar.");}}
async function toggleClient(c){
 try{if(c.ativo){if(!confirm(`Bloquear manualmente ${c.nome}?`))return;await rpc("admin_bloquear_cliente",{p_cliente_id:c.id});}else{if(!confirm(`Liberar o acesso de ${c.nome}?`))return;await rpc("admin_liberar_cliente",{p_cliente_id:c.id});}await load();}
 catch(e){alert(e.message||"Não foi possível alterar o acesso.");}
}
async function toggleModule(i){i.disabled=true;const{error}=await supabaseClient.from("cliente_modulos").upsert({cliente_id:i.dataset.c,modulo_id:i.dataset.m,ativo:i.checked},{onConflict:"cliente_id,modulo_id"});i.disabled=false;if(error){i.checked=!i.checked;alert(`Não foi possível alterar o módulo.\n${error.message}`);return;}await load();}
async function call(body){const{data:{session}}=await supabaseClient.auth.getSession();if(!session)return{ok:false,message:"Sessão expirada."};const r=await fetch(`${RIVER_CONFIG.supabaseUrl}/functions/v1/${RIVER_CONFIG.clientFunction}`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`,apikey:RIVER_CONFIG.supabaseKey},body:JSON.stringify(body)});try{return await r.json()}catch{return{ok:false,message:`Erro HTTP ${r.status}.`}}}
function openNew(){$("modal").classList.remove("hidden");$("cf").reset();$("cm").textContent="";renderModulePicker();setTimeout(()=>$('cn').focus(),50)}
function closeNew(){$("modal").classList.add("hidden")}
function openPassword(c){if(!c.auth_user_id)return alert("Este cliente ainda não possui um usuário de autenticação.");resetClientId=c.id;$("passwordClientName").textContent=`Defina uma nova senha para ${c.nome}.`;$("passwordForm").reset();$("passwordMessage").textContent="";$("passwordModal").classList.remove("hidden");setTimeout(()=>$('newPassword').focus(),50)}
function closePassword(){$("passwordModal").classList.add("hidden");resetClientId=null}
$("new").onclick=openNew;$("emptyNew").onclick=openNew;$("refresh").onclick=load;$("close").onclick=closeNew;$("cancelNew").onclick=closeNew;$("closePassword").onclick=closePassword;$("cancelPassword").onclick=closePassword;$("modal").onclick=e=>{if(e.target===$("modal"))closeNew()};$("passwordModal").onclick=e=>{if(e.target===$("passwordModal"))closePassword()};$("out").onclick=async()=>{await supabaseClient.auth.signOut();location.href="admin-login.html"};
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeNew();closePassword()}});
$("cf").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$("cm").className="form-message";$("cm").textContent="Criando acesso...";const moduleIds=[...$("mods").querySelectorAll("input:checked")].map(x=>x.value);const r=await call({action:"create_client",name:$("cn").value.trim(),code:$("cc").value.trim(),email:$("ce").value.trim(),password:$("cp").value,moduleIds});if(r.ok){$("cm").className="form-message success-message";$("cm").textContent="Cliente cadastrado com sucesso.";setTimeout(async()=>{closeNew();await load()},500)}else{$("cm").className="form-message error-message";$("cm").textContent=r.message||"Não foi possível cadastrar o cliente."}b.disabled=false};
$("passwordForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$("passwordMessage").textContent="Salvando...";const r=await call({action:"reset_password",clientId:resetClientId,password:$("newPassword").value});if(r.ok){$("passwordMessage").className="form-message success-message";$("passwordMessage").textContent="Senha redefinida com sucesso.";setTimeout(closePassword,700)}else{$("passwordMessage").className="form-message error-message";$("passwordMessage").textContent=r.message||"Não foi possível redefinir a senha."}b.disabled=false};
(async()=>{if(await auth())await load()})();
