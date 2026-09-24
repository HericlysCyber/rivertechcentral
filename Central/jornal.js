(async()=>{
  const ctx=await protegerModulo("jornal","Jornal de Ofertas");
  if(!ctx)return;

  const $=id=>document.getElementById(id);
  const rows=$("rows"), prev=$("prevProducts");
  let produtos=[];
  let ctxClienteId=null;
  let encarteId=null;

  $("out").onclick=sairModulo;


  async function carregar(){
    ctxClienteId=ctx.access.cliente_id;
    const {data,error}=await supabaseClient.from("jornal_encartes").select("id,titulo,periodo,destaque,colunas,cabecalho,produtos").eq("cliente_id",ctxClienteId).order("updated_at",{ascending:false}).limit(1);
    if(error){ console.warn("Jornal: não foi possível carregar o encarte salvo.",error); return; }
    const saved=data?.[0];
    if(!saved)return;
    encarteId=saved.id;
    $("titulo").value=saved.titulo||"OFERTAS DA SEMANA";
    $("periodo").value=saved.periodo||"";
    $("destaque").value=saved.destaque||"#1769e0";
    $("colunas").value=String(saved.colunas||3);
    if(saved.cabecalho)$("headPreview").src=saved.cabecalho;
    if(Array.isArray(saved.produtos))produtos=saved.produtos;
  }

  async function salvar(){
    const payload={cliente_id:ctxClienteId,titulo:$("titulo").value.trim()||"OFERTAS DA SEMANA",periodo:$("periodo").value.trim(),destaque:$("destaque").value,colunas:Number($("colunas").value),cabecalho:$("headPreview").src||"",produtos};
    let q;
    if(encarteId) q=await supabaseClient.from("jornal_encartes").update(payload).eq("id",encarteId).select("id").single();
    else q=await supabaseClient.from("jornal_encartes").insert(payload).select("id").single();
    if(q.error){ console.error(q.error); alert("Não foi possível salvar o encarte. Verifique a migração do Jornal no Supabase."); return false; }
    encarteId=q.data.id;
    $("saveJornalMsg").textContent="Encarte salvo com sucesso.";
    return true;
  }

  function esc(v=""){
    return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
  }

  function fileData(file,cb){
    if(!file){cb("");return;}
    const r=new FileReader();
    r.onload=()=>cb(r.result||"");
    r.readAsDataURL(file);
  }

  function atualizarPreview(){
    $("prevTitulo").textContent=$("titulo").value||"OFERTAS DA SEMANA";
    $("prevPeriodo").textContent=$("periodo").value||"";
    $("prevTitulo").style.color=$("destaque").value;
    $("prevProducts").style.setProperty("--encarte-accent",$("destaque").value);
    $("prevProducts").style.setProperty("--encarte-columns",$("colunas").value);

    prev.innerHTML=produtos.map((p,i)=>`
      <article class="encarte-product">
        ${p.img?`<img src="${p.img}" alt="${esc(p.nome)}">`:`<div class="product-placeholder">SEM IMAGEM</div>`}
        <b>${esc(p.nome||"Produto")}</b>
        ${p.desc?`<div>${esc(p.desc)}</div>`:""}
        <div class="price">R$ ${esc(p.preco||"0,00")}</div>
      </article>`).join("");
  }

  function renderEditor(){
    rows.innerHTML=produtos.map((p,i)=>`
      <div class="product-row product-editor-row">
        <div class="product-thumb">
          ${p.img?`<img src="${p.img}" alt="">`:`<span>IMG</span>`}
          <label class="image-btn">Trocar imagem
            <input type="file" accept="image/*" data-image="${i}">
          </label>
        </div>
        <div class="product-fields">
          <input value="${esc(p.nome)}" data-i="${i}" data-k="nome" placeholder="Nome do produto">
          <input value="${esc(p.desc)}" data-i="${i}" data-k="desc" placeholder="Descrição / unidade / detalhe">
        </div>
        <div class="price-field">
          <span>Preço</span>
          <input value="${esc(p.preco)}" data-i="${i}" data-k="preco" placeholder="0,00">
        </div>
        <button type="button" class="danger-btn remove-product" data-del="${i}" title="Remover produto">×</button>
      </div>`).join("");

    rows.querySelectorAll("input[data-i]").forEach(el=>{
      el.addEventListener("input",()=>{
        const i=Number(el.dataset.i);
        produtos[i][el.dataset.k]=el.value;
        atualizarPreview();
      });
    });

    rows.querySelectorAll("input[data-image]").forEach(el=>{
      el.addEventListener("change",e=>{
        const i=Number(el.dataset.image);
        const file=e.target.files?.[0];
        if(!file)return;
        if(!file.type.startsWith("image/"))return;
        if(file.size>5*1024*1024){alert("Escolha uma imagem de até 5 MB.");el.value="";return;}
        fileData(file,data=>{
          produtos[i].img=data;
          renderEditor();
          atualizarPreview();
        });
      });
    });

    rows.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{
      produtos.splice(Number(b.dataset.del),1);
      renderEditor();
      atualizarPreview();
    }));
  }

  $("add").onclick=()=>{
    produtos.push({nome:"Novo produto",desc:"Descrição",preco:"0,00",img:""});
    renderEditor();
    atualizarPreview();
    const last=rows.querySelector(".product-editor-row:last-child");
    last?.scrollIntoView({behavior:"smooth",block:"nearest"});
  };

  $("titulo").oninput=atualizarPreview;
  $("periodo").oninput=atualizarPreview;
  $("destaque").oninput=atualizarPreview;
  $("colunas").onchange=atualizarPreview;

  $("cabecalho").onchange=e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith("image/")){alert("Escolha uma imagem válida.");e.target.value="";return;}
    if(file.size>8*1024*1024){alert("A imagem do cabeçalho deve ter até 8 MB.");e.target.value="";return;}
    fileData(file,d=>$("headPreview").src=d);
  };

  $("saveJornal").onclick=salvar;

  $("print").onclick=async()=>{
    if(!produtos.length){
      alert("Adicione pelo menos um produto antes de imprimir ou salvar em PDF.");
      return;
    }
    await salvar();
    window.print();
  };

  // Começa com dois produtos para o cliente enxergar o funcionamento imediatamente.
  produtos=[
    {nome:"Arroz 5 kg",desc:"Tipo 1",preco:"24,90",img:""},
    {nome:"Feijão 1 kg",desc:"Carioca",preco:"7,99",img:""}
  ];
  await carregar();
  renderEditor();
  atualizarPreview();
})();