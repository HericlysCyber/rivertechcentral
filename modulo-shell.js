
async function protegerModulo(slug, nome){
  const {data:{session}} = await supabaseClient.auth.getSession();
  if(!session){ location.href="login.html"; return null; }
  const {data:access,error:accessError}=await supabaseClient.rpc("verificar_acesso_cliente");
  const a=Array.isArray(access)?access[0]:access;
  if(accessError || !a?.permitido){
    await supabaseClient.auth.signOut();
    location.href="login.html?status="+encodeURIComponent(a?.motivo||"bloqueado");
    return null;
  }
  const {data:p}=await supabaseClient.from("perfis").select("tipo,ativo").eq("id",session.user.id).single();
  if(!p || p.tipo!=="cliente" || !p.ativo){ await supabaseClient.auth.signOut(); location.href="login.html?status=bloqueado"; return null; }
  const {data:m,error:me}=await supabaseClient.from("modulos").select("id,nome,slug,descricao,icone,ativo").eq("slug",slug).eq("ativo",true).limit(1);
  const mod=m?.[0];
  const {data:cm,error:ce}=await supabaseClient.from("cliente_modulos").select("modulo_id,ativo").eq("cliente_id",a.cliente_id).eq("ativo",true);
  if(me||ce||!mod||!(cm||[]).some(x=>x.modulo_id===mod.id)){
    document.body.innerHTML=`<main class="module-denied"><img src="img/logo.png"><h1>${nome||"Módulo"}</h1><p>Este módulo não está liberado para sua conta.</p><a class="back-central" href="index.html">← Voltar para a Central</a></main>`;
    return null;
  }
  const n=document.querySelector("[data-client-name]"); if(n)n.textContent=a.nome||"Cliente";
  return {session,access:a,module:mod};
}
function sairModulo(){ return supabaseClient.auth.signOut().then(()=>location.href="login.html"); }
