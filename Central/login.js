async function go(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session)return;
  const {data:a}=await supabaseClient.rpc("verificar_acesso_cliente");
  const access=Array.isArray(a)?a[0]:a;
  if(access?.permitido) location.href="index.html";
  else await supabaseClient.auth.signOut();
}
go();

f.onsubmit=async e=>{
  e.preventDefault();
  msg.className="form-message";
  msg.textContent="Entrando...";

  const {data,error}=await supabaseClient.auth.signInWithPassword({
    email:email.value.trim(),
    password:password.value
  });

  if(error){
    msg.className="form-message error-message";
    msg.textContent="E-mail ou senha inválidos.";
    return;
  }

  const {data:p,error:profileError}=await supabaseClient
    .from("perfis")
    .select("tipo,ativo")
    .eq("id",data.user.id)
    .single();

  if(profileError || !p || p.tipo!=="cliente"){
    await supabaseClient.auth.signOut();
    msg.className="form-message error-message";
    msg.textContent="Esta conta não possui acesso de cliente.";
    return;
  }

  if(!p.ativo){
    await supabaseClient.auth.signOut();
    msg.className="form-message error-message";
    msg.textContent="Cliente bloqueado. Entre em contato com a River Tech.";
    return;
  }

  const {data:a,error:accessError}=await supabaseClient.rpc("verificar_acesso_cliente");
  const access=Array.isArray(a)?a[0]:a;
  if(accessError || !access?.permitido){
    await supabaseClient.auth.signOut();
    const messages={
      periodo_expirado:"Seu período de acesso terminou. Entre em contato com a River Tech.",
      sem_periodo:"Seu acesso ainda não foi ativado. Entre em contato com a River Tech.",
      bloqueio_manual:"Seu acesso está bloqueado. Entre em contato com a River Tech."
    };
    msg.className="form-message error-message";
    msg.textContent=messages[access?.motivo]||"Seu acesso não está liberado.";
    return;
  }

  location.href="index.html";
};
