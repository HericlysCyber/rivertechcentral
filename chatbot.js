(async()=>{
  const ctx=await protegerModulo("chat-bot","Chat Bot");
  if(!ctx)return;
  const $=id=>document.getElementById(id);
  $("out").onclick=sairModulo;

  const defaults={
    canal:"WhatsApp", nome:"River Assistente",
    welcome:"Olá! 👋 Seja bem-vindo à nossa empresa. Como podemos ajudar?",
    offline:"No momento estamos fora do horário. Deixe sua mensagem e retornaremos.",
    fallback:"Não consegui identificar sua solicitação. Escolha uma opção do menu ou peça para falar com um atendente.",
    human:"Certo! Vou encaminhar você para um atendente.",
    keywords:"olá, oi, atendimento, ajuda, preço, promoção",
    scheduleEnabled:false,startTime:"08:00",endTime:"18:00",active:false,
    options:[
      {label:"Comprar / Ofertas",reply:"Claro! Posso ajudar com ofertas e informações de compra."},
      {label:"Suporte",reply:"Vou ajudar com o suporte. Qual é a sua dúvida?"},
      {label:"Falar com atendente",reply:"Certo! Vou encaminhar você para um atendente."}
    ]
  };
  let state={...defaults};
  let ctxClienteId=ctx.access.cliente_id;
  async function carregarWhatsApps(){
    const {data,error}=await supabaseClient.from("whatsapp_conexoes").select("id,apelido,telefone_e164,provedor,phone_number_id,waba_id,nome_exibicao,status,ativo,observacoes,updated_at").eq("cliente_id",ctxClienteId).order("created_at");
    if(error){ console.warn("WhatsApp: tabela ainda não configurada ou sem acesso.",error); return []; }
    return data||[];
  }

  function renderWhatsApps(items){
    const box=$("whatsappConnections"); if(!box)return;
    if(!items.length){ box.innerHTML='<div class="whatsapp-empty">Nenhum número vinculado. Você pode cadastrar até <strong>2 números</strong> nesta conta.</div>'; return; }
    box.innerHTML=items.map((w,i)=>`<div class="whatsapp-row" data-id="${w.id}"><div class="whatsapp-main"><span class="whatsapp-icon">☏</span><div><strong>${esc(w.apelido||`WhatsApp ${i+1}`)}</strong><small>${esc(w.telefone_e164||"Sem número")} ${w.nome_exibicao?"· "+esc(w.nome_exibicao):""}</small></div></div><span class="wa-status ${esc(w.status||"preparando")}">${esc((w.status||"preparando").replace("_"," "))}</span><button class="danger-btn wa-remove" type="button">Remover</button></div>`).join("");
    box.querySelectorAll(".wa-remove").forEach(btn=>btn.onclick=async()=>{
      const id=btn.closest(".whatsapp-row").dataset.id;
      if(!confirm("Remover este número da conta?"))return;
      const {error}=await supabaseClient.from("whatsapp_conexoes").delete().eq("id",id).eq("cliente_id",ctxClienteId);
      if(error){alert(error.message);return;}
      renderWhatsApps(await carregarWhatsApps());
    });
  }

  function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));}

  async function adicionarWhatsApp(){
    const items=await carregarWhatsApps();
    if(items.length>=2){alert("Esta conta já possui 2 números de WhatsApp.");return;}
    const numero=prompt("Número em formato internacional (ex.: +55 82 99999-9999):");
    if(!numero)return;
    const apelido=prompt("Apelido deste número:",items.length?"WhatsApp 2":"WhatsApp principal")||"WhatsApp";
    const {error}=await supabaseClient.from("whatsapp_conexoes").insert({cliente_id:ctxClienteId,apelido,telefone_e164:numero.trim(),provedor:"meta_cloud",status:"preparando",ativo:true});
    if(error){alert(error.message);return;}
    renderWhatsApps(await carregarWhatsApps());
  }

  async function carregar(){
    const {data,error}=await supabaseClient.from("chatbot_config").select("config,ativo").eq("cliente_id",ctxClienteId).maybeSingle();
    if(error){console.warn("Chat Bot: não foi possível carregar a configuração salva.",error);return;}
    if(data?.config) state={...defaults,...data.config,active:!!data.ativo};
  }
  async function salvarNoSupabase(){
    const {error}=await supabaseClient.from("chatbot_config").upsert({cliente_id:ctxClienteId,config:state,ativo:!!state.active,updated_at:new Date().toISOString()},{onConflict:"cliente_id"});
    if(error){console.error(error);$("msg").textContent="Não foi possível salvar. Execute a migração do Chat Bot no Supabase.";return false;}
    $("msg").textContent="Configuração salva na conta do cliente.";
    return true;
  }
  if(!Array.isArray(state.options)||!state.options.length) state.options=defaults.options.map(x=>({...x}));

  function renderOptions(){
    const box=$("menuRows"); box.innerHTML="";
    state.options.forEach((opt,i)=>{
      const row=document.createElement("div"); row.className="bot-option-row";
      row.innerHTML=`<input class="option-label" maxlength="40" placeholder="Nome da opção"><input class="option-reply" maxlength="180" placeholder="Resposta do bot"><button class="danger-btn option-remove" type="button">×</button>`;
      row.querySelector(".option-label").value=opt.label||"";
      row.querySelector(".option-reply").value=opt.reply||"";
      row.querySelector(".option-label").oninput=e=>{state.options[i].label=e.target.value;preview()};
      row.querySelector(".option-reply").oninput=e=>{state.options[i].reply=e.target.value;preview()};
      row.querySelector(".option-remove").onclick=()=>{state.options.splice(i,1);renderOptions();preview()};
      box.appendChild(row);
    });
  }

  function fill(){
    $("canal").value=state.canal||defaults.canal; $("botname").value=state.nome||defaults.nome;
    $("welcome").value=state.welcome||""; $("offline").value=state.offline||""; $("fallback").value=state.fallback||""; $("human").value=state.human||"";
    $("keywords").value=state.keywords||""; $("scheduleEnabled").checked=!!state.scheduleEnabled; $("startTime").value=state.startTime||"08:00"; $("endTime").value=state.endTime||"18:00";
    renderOptions(); preview(); updateState();
  }
  function read(){
    state.canal=$("canal").value; state.nome=$("botname").value.trim()||defaults.nome; state.welcome=$("welcome").value.trim(); state.offline=$("offline").value.trim(); state.fallback=$("fallback").value.trim(); state.human=$("human").value.trim(); state.keywords=$("keywords").value.trim(); state.scheduleEnabled=$("scheduleEnabled").checked; state.startTime=$("startTime").value; state.endTime=$("endTime").value;
  }
  function preview(){
    $("prevName").textContent=$("botname").value.trim()||"River Assistente"; $("prevChannel").textContent=$("canal").value;
    $("prevWelcome").textContent=$("welcome").value;
    const box=$("prevOptions"); box.innerHTML="";
    state.options.forEach((o,i)=>{if(!o.label)return;const b=document.createElement("button");b.className="preview-option";b.textContent=`${i+1} — ${o.label}`;b.onclick=()=>{const r=document.createElement("div");r.className="chat-bubble bot reply-bubble";r.textContent=o.reply||"Opção selecionada.";$("chatScreen").appendChild(r);r.scrollIntoView({behavior:"smooth",block:"nearest"})};box.appendChild(b)});
  }
  function updateState(){
    $("stateText").textContent=state.active?"Atendimento ativado":"Configuração inativa";
    $("stateDot").classList.toggle("active",!!state.active);
  }
  ["canal","botname","welcome","offline","fallback","human","keywords","scheduleEnabled","startTime","endTime"].forEach(id=>$(id).addEventListener("input",()=>{read();preview()}));
  $("scheduleEnabled").addEventListener("change",()=>{read();preview()});
  $("addOption").onclick=()=>{state.options.push({label:"Nova opção",reply:"Como posso ajudar?"});renderOptions();preview()};
  $("save").onclick=async()=>{read();await salvarNoSupabase();updateState()};
  $("activate").onclick=async()=>{read();state.active=!state.active;await salvarNoSupabase();$("msg").textContent=state.active?"Atendimento ativado para esta conta.":"Atendimento desativado para esta conta.";updateState()};
  $("test").onclick=()=>{read();preview();$("msg").textContent="Modo de teste atualizado. Clique nas opções da prévia para simular respostas."};
  await carregar();
  fill();
  renderWhatsApps(await carregarWhatsApps());
  $("addWhatsApp")?.addEventListener("click",adicionarWhatsApp);
})();
