(async()=>{
  const ctx=await protegerModulo('dashboard','Dashboard');
  if(!ctx)return;
  const $=id=>document.getElementById(id);
  $('out').onclick=sairModulo;

  const demo={
    faturamento:48250.00,vendas:1284,ticket:37.58,clientes:326,
    crescimento:8.4,meta:60000,
    serie:[3200,4100,3600,4550,3920,5200,4860,5710,4980,6230,5890,6410],
    produtos:[['Arroz 5kg',218],['Café 500g',187],['Açúcar 1kg',164],['Feijão 1kg',151],['Leite 1L',139]],
    categorias:[['Mercearia',42],['Bebidas',24],['Hortifruti',18],['Limpeza',10],['Outros',6]]
  };
  let current=demo;

  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  function number(v){return Number(v||0).toLocaleString('pt-BR');}
  function pct(v){return `${Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;}

  function normalized(raw){
    const d={...demo,...(raw||{})};
    d.faturamento=Number(d.faturamento||0);d.vendas=Number(d.vendas||0);d.clientes=Number(d.clientes||0);
    d.ticket=Number(d.ticket|| (d.vendas?d.faturamento/d.vendas:0));
    d.crescimento=Number(d.crescimento||0);d.meta=Number(d.meta||60000);
    d.serie=Array.isArray(d.serie)&&d.serie.length?d.serie.map(Number):demo.serie;
    d.produtos=Array.isArray(d.produtos)&&d.produtos.length?d.produtos:demo.produtos;
    d.categorias=Array.isArray(d.categorias)&&d.categorias.length?d.categorias:demo.categorias;
    return d;
  }

  function renderKpis(d){
    const metaPct=d.meta?Math.min(100,(d.faturamento/d.meta)*100):0;
    $('kpis').innerHTML=`
      <div class="dash-kpi"><span>Faturamento</span><strong>${money(d.faturamento)}</strong><small>Meta ${money(d.meta)} · ${pct(metaPct)} atingida</small></div>
      <div class="dash-kpi"><span>Vendas</span><strong>${number(d.vendas)}</strong><small>Pedidos no período</small></div>
      <div class="dash-kpi"><span>Ticket médio</span><strong>${money(d.ticket)}</strong><small>Valor médio por venda</small></div>
      <div class="dash-kpi"><span>Clientes</span><strong>${number(d.clientes)}</strong><small>${d.crescimento>=0?'+':''}${pct(d.crescimento)} vs. período anterior</small></div>`;
  }

  function drawChart(values){
    const canvas=$('salesChart'), box=canvas.parentElement, ratio=window.devicePixelRatio||1;
    const w=Math.max(300,box.clientWidth),h=300;
    canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.height=h+'px';
    const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
    const pad={l:42,r:16,t:18,b:30}, cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
    const max=Math.max(...values,1)*1.15;
    c.strokeStyle='#e5edf4';c.lineWidth=1;c.font='11px Inter,Arial';c.fillStyle='#8395a5';c.textAlign='right';
    for(let i=0;i<5;i++){const y=pad.t+(ch*i/4);c.beginPath();c.moveTo(pad.l,y);c.lineTo(w-pad.r,y);c.stroke();c.fillText(money(max-(max*i/4)).replace('R$ ','R$ '),pad.l-7,y+4);}
    const pts=values.map((v,i)=>[pad.l+(i/(values.length-1||1))*cw,pad.t+ch-(v/max)*ch]);
    c.strokeStyle='#1687e8';c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
    c.fillStyle='#1687e8';pts.forEach(p=>{c.beginPath();c.arc(p[0],p[1],4,0,Math.PI*2);c.fill();});
  }

  function render(d){
    current=d;renderKpis(d);drawChart(d.serie);
    const total=d.serie.reduce((a,b)=>a+b,0);$('chartTotal').textContent=money(total);$('chartPeriod').textContent=`Últimos ${$('period').value} dias`;
    const metaPct=d.meta?Math.min(100,d.faturamento/d.meta*100):0;
    $('details').innerHTML=`<div><span>Meta de faturamento</span><b>${money(d.meta)}</b></div><div><span>Meta atingida</span><b>${pct(metaPct)}</b></div><div><span>Crescimento</span><b>${d.crescimento>=0?'+':''}${pct(d.crescimento)}</b></div><div><span>Clientes ativos</span><b>${number(d.clientes)}</b></div>`;
    $('products').innerHTML=d.produtos.map((p,i)=>`<div class="rank-row"><span class="rank">${i+1}</span><span class="rank-name">${p[0]}</span><strong>${number(p[1])} vendas</strong></div>`).join('');
    $('categories').innerHTML=d.categorias.map(c=>`<div class="cat-row"><div><span>${c[0]}</span><b>${pct(c[1])}</b></div><div class="cat-bar"><i style="width:${Math.min(100,Number(c[1]))}%"></i></div></div>`).join('');
  }

  $('mode').addEventListener('change',()=>{ $('endpoint').disabled=$('mode').value!=='api'; });
  $('period').addEventListener('change',()=>{ if($('mode').value==='demo')render(current); });
  $('load').onclick=async()=>{
    $('load').disabled=true;$('load').textContent='Atualizando...';
    try{
      if($('mode').value==='demo'){render(normalized(demo));$('dashMsg').textContent='Dados de demonstração atualizados.';}
      else{
        const url=$('endpoint').value.trim();if(!url)throw new Error('Informe o endpoint JSON.');
        const r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);const d=normalized(await r.json());render(d);$('dashMsg').textContent='Dados carregados da API.';
      }
    }catch(e){$('dashMsg').textContent='Não foi possível atualizar: '+e.message;}
    finally{$('load').disabled=false;$('load').textContent='↻ Atualizar';}
  };
  window.addEventListener('resize',()=>drawChart(current.serie));
  $('endpoint').disabled=true;render(demo);
})();
