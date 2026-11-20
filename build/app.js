"use strict";
/* Dashboard de Controle de Tráfego Pago — funil de CAPTAÇÃO DE LEADS.
   Anúncio → Página → Lead
   META[]  = linhas da plataforma de mídia (dia × campanha × grupo): sp, im, cl
   SALES[] = leads (1 linha = 1 lead); meta=1 quando atribuído à plataforma */
const DATA = JSON.parse(document.getElementById('payload').textContent);
const META = DATA.meta, SALES = DATA.sales, B = DATA.build;
const TAX = B.tax_factor || 1;
const PLAT = B.platform || 'Google Ads';

/* ---------------- format ---------------- */
const nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl=v=>(v==null||!isFinite(v))?'-':'R$ '+nf2.format(v);
const pct=v=>(v==null||!isFinite(v))?'-':nf2.format(v*100)+'%';
const intf=v=>(v==null||!isFinite(v))?'-':nf0.format(v);
const numf=v=>(v==null||!isFinite(v))?'-':nf1.format(v);
const dimf=v=>v==null?'-':String(v);
const norm=s=>(s==null?'':String(s)).normalize('NFKD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const brdate=d=>{ if(!d) return '-'; const p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; };
const WD=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const weekday=d=>{ const dt=new Date(d+'T00:00:00'); return isNaN(dt)?'':WD[dt.getDay()]; };

/* ---------------- date helpers ---------------- */
function pad(n){return String(n).padStart(2,'0');}
function dstr(dt){return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());}
function addDays(s,n){const dt=new Date(s+'T00:00:00');dt.setDate(dt.getDate()+n);return dstr(dt);}
const TODAY = B.today || B.date_max;

/* ---------------- STATE ---------------- */
const STATE = {
  page:'geral', from:B.date_min, to:B.date_max, preset:'todo', tax:TAX!==1,
  selDays:new Set(),
  mSelC:new Set(), mSelA:new Set(),
  sort:{}, colw: JSON.parse(localStorage.getItem('dm_colw')||'{}'),
  iaWin: localStorage.getItem('ia_win') || '14d',
};
const taxf = ()=> STATE.tax ? TAX : 1;

function dateActive(d){
  if(!d) return false;
  if(STATE.selDays.size) return STATE.selDays.has(d);
  return (!STATE.from || d>=STATE.from) && (!STATE.to || d<=STATE.to);
}
const metaActive  = ()=> META.filter(m=>dateActive(m.d));
const salesActive = ()=> SALES.filter(s=>dateActive(s.d));

/* ---------------- aggregation ----------------
   bucket = {sp,im,cl, leads, leadsA}
   leads  = leads do escopo (Visão Geral: todos; aba da plataforma: só atribuídos)
   leadsA = leads atribuídos à plataforma (base de CPL e Tx Conversão) */
function newBucket(){return {sp:0,im:0,cl:0,leads:0,leadsA:0};}
function addLead(a,r){ a.leads+=1; a.leadsA+=r.meta?1:0; }
function addAd(a,r){ a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl; }
function derive(a){
  const g=a.sp*taxf();
  return {gasto:g, impr:a.im, cliques:a.cl, leads:a.leads, leadsA:a.leadsA,
    cpm:a.im?g/a.im*1000:null, ctr:a.im?a.cl/a.im:null, cpc:a.cl?g/a.cl:null,
    cpl:a.leadsA?g/a.leadsA:null,                 /* CPL = Gasto / Leads (plataforma) */
    conv:a.cl?a.leadsA/a.cl:null};                /* Tx Conversão = Leads / Cliques */
}
function buildAgg(fS,fM,dim){
  const m={}; const get=k=>m[k]||(m[k]=newBucket());
  fM.forEach(r=>addAd(get(r[dim]),r));
  fS.forEach(r=>addLead(get(r[dim]),r));
  return m;
}
function totals(fS,fM){ const a=newBucket(); fM.forEach(r=>addAd(a,r)); fS.forEach(r=>addLead(a,r)); return a; }
function daily(fS,fM){
  const days={}; const g=d=>days[d]||(days[d]=Object.assign({d},newBucket()));
  fM.forEach(r=>{if(r.d) addAd(g(r.d),r);});
  fS.forEach(r=>{if(r.d) addLead(g(r.d),r);});
  return Object.values(days).sort((a,b)=>a.d<b.d?-1:1);
}

/* ---------------- generic interactive table ---------------- */
function colWidth(cfg,c){ const saved=(STATE.colw[cfg.id]||{})[c.key];
  if(saved) return saved;
  if(c.w) return c.w;
  if(c.type==='date') return 96;
  if(c.type==='dim') return c.big?300:150;
  return 88; }
function renderTable(cfg){
  const table=document.getElementById(cfg.id); if(!table) return;
  const sortState=STATE.sort[cfg.id];
  let rows=cfg.rows.slice();
  if(sortState){ const {key,dir}=sortState; const c=cfg.cols.find(x=>x.key===key);
    rows.sort((a,b)=>{ let va=a.cells[key], vb=b.cells[key];
      if(c && c.type==='dim'){ va=norm(va); vb=norm(vb); return dir==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); }
      va=(va==null||!isFinite(va))?-Infinity:va; vb=(vb==null||!isFinite(vb))?-Infinity:vb;
      return dir==='asc'?va-vb:vb-va; }); }
  const ext={};
  cfg.cols.forEach(c=>{ if(c.heat){ const vs=rows.map(r=>r.cells[c.key]).filter(v=>v!=null&&isFinite(v)); ext[c.key]=[Math.min(...vs),Math.max(...vs)]; }});
  const fmt=(t,v)=> t==='brl'?brl(v):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='date'?brdate(v):dimf(v);
  const widths=cfg.cols.map(c=>colWidth(cfg,c)); const totalW=widths.reduce((a,b)=>a+b,0);
  const colgroup='<colgroup>'+cfg.cols.map((c,i)=>`<col style="width:${widths[i]}px">`).join('')+'</colgroup>';
  let thead='<thead><tr>'+cfg.cols.map((c,i)=>{
    const sc = sortState&&sortState.key===c.key ? (sortState.dir==='asc'?'sorted-asc':'sorted-desc') : '';
    return `<th class="${c.type==='dim'?'dim ':''}${sc}" data-k="${c.key}" data-ci="${i}">${c.label}<span class="rsz"></span></th>`;
  }).join('')+'</tr></thead>';
  let tbody='<tbody>'+rows.map(r=>{
    const sel = cfg.selectable && cfg.selSet && cfg.selSet.has(r.k);
    const tds=cfg.cols.map(c=>{
      const v=r.cells[c.key]; let bg='';
      if(c.heat && ext[c.key]) bg=`background:${heat(v,ext[c.key][0],ext[c.key][1],c.heat)}`;
      const cls=(c.type==='dim'?'dim':'');
      return `<td class="${cls}" style="${bg}">${fmt(c.type,v)}</td>`;
    }).join('');
    return `<tr class="${sel?'sel':''}" data-k="${encodeURIComponent(r.k)}">${tds}</tr>`;
  }).join('')+'</tbody>';
  let tfoot='';
  if(cfg.total){ tfoot='<tfoot><tr>'+cfg.cols.map((c,i)=>{
    const v=cfg.total[c.key]; return `<td class="${c.type==='dim'?'dim':''}">${i===0?(v==null?'Total Geral':fmt(c.type,v)):fmt(c.type,v)}</td>`;
  }).join('')+'</tr></tfoot>'; }
  table.style.width=totalW+'px';
  table.innerHTML=colgroup+thead+tbody+tfoot;
  const cols=table.querySelector('colgroup').children;
  table.querySelectorAll('thead th').forEach(th=>{
    th.addEventListener('click',e=>{ if(e.target.classList.contains('rsz'))return;
      const k=th.dataset.k, cur=STATE.sort[cfg.id];
      if(!cur||cur.key!==k) STATE.sort[cfg.id]={key:k,dir:'asc'};
      else if(cur.dir==='asc') STATE.sort[cfg.id]={key:k,dir:'desc'};
      else delete STATE.sort[cfg.id];
      renderTable(cfg);
    });
  });
  table.querySelectorAll('thead th .rsz').forEach(g=>{
    g.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, ci=+th.dataset.ci, x0=e.clientX;
      const w0=cols[ci].offsetWidth, tw0=table.offsetWidth;
      document.body.style.userSelect='none';
      const mv=ev=>{ const nw=Math.max(60,w0+(ev.clientX-x0)); cols[ci].style.width=nw+'px'; table.style.width=(tw0-w0+nw)+'px';
        STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw; };
      const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.userSelect=''; localStorage.setItem('dm_colw',JSON.stringify(STATE.colw)); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
  });
  if(cfg.selectable && cfg.onSelect){
    table.querySelectorAll('tbody tr').forEach(tr=>{
      tr.addEventListener('click',e=>{ cfg.onSelect(decodeURIComponent(tr.dataset.k), e); });
    });
  }
}
/* Heatmap por coluna: cor FIXA por métrica (definida em identidade-visual.css),
   só a OPACIDADE varia com o valor (maior valor = mais vibrante). */
const HEAT_HUE={gasto:'--heat-gasto', leads:'--heat-fat', conv:'--heat-roas'};
function heat(v,lo,hi,kind){
  if(v==null||!isFinite(v)||hi===lo||!HEAT_HUE[kind]) return 'transparent';
  const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
  const c=hx2rgb(cvar(HEAT_HUE[kind]));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.06+0.5*t).toFixed(3)})`;
}
function toggleSet(set,key,ctrl){
  if(ctrl){ set.has(key)?set.delete(key):set.add(key); }
  else { const only=set.has(key)&&set.size===1; set.clear(); if(!only) set.add(key); }
}

/* ---------------- charts ---------------- */
const charts={};
const CHART_SERIES=['--cc1','--cc2','--cc3','--cc4','--cc5','--cc6','--cc7','--cc8','--cc9','--cc10'];
const cvar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const chartPalette=()=>CHART_SERIES.map(v=>cvar(v)||'#888888');
const hx2rgb=h=>{h=(h||'').replace('#','').trim();if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h||'888888',16);return [(n>>16)&255,(n>>8)&255,n&255];};
const cmuted=()=>cvar('--muted')||'#6B7280', cink=()=>cvar('--ink')||'#1A1D2E', cgrid=()=>cvar('--grid')||'#EEF0F5';
function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }
const FMT={brl:brl,pct:pct,num:numf,int:intf};

/* combo: Leads (barras) · Gasto (R$) · CPL (eixo próprio) */
function comboChart(id, d){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const labels=d.map(x=>x.d.slice(5)), mut=cmuted(), gr=cgrid();
  charts[id]=new Chart(el,{
    data:{labels, datasets:[
      {type:'bar',label:'Leads',data:d.map(x=>x.leads),backgroundColor:cvar('--chart-vendas'),yAxisID:'y',borderRadius:3,order:3},
      {type:'line',label:'Gasto',data:d.map(x=>+(x.sp*taxf()).toFixed(2)),borderColor:cvar('--chart-gasto'),backgroundColor:cvar('--chart-gasto'),yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:2},
      {type:'line',label:'CPL',data:d.map(x=>{const g=x.sp*taxf();return x.leadsA?+(g/x.leadsA).toFixed(2):null;}),borderColor:cink(),backgroundColor:cink(),yAxisID:'y2',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,order:0},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:11}}},
        tooltip:{callbacks:{label:c=>{const v=c.raw,ax=c.dataset.yAxisID; return c.dataset.label+': '+(ax==='y'?intf(v):brl(v));}}}},
      scales:{x:{ticks:{color:mut,font:{size:10}},grid:{display:false}},
        y:{position:'left',ticks:{color:mut,font:{size:10}},grid:{color:gr},beginAtZero:true,title:{display:true,text:'Leads',color:mut,font:{size:10}}},
        y1:{position:'right',ticks:{color:mut,font:{size:10}},grid:{display:false},beginAtZero:true,title:{display:true,text:'Gasto R$',color:mut,font:{size:10}}},
        y2:{position:'right',ticks:{color:mut,font:{size:10},callback:v=>brl(v)},grid:{display:false},beginAtZero:true,title:{display:true,text:'CPL',color:mut,font:{size:10}}}}}
  });
}
/* linhas genéricas (1 ou 2 eixos) */
function multiLine(id, d, series, opts){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const labels=d.map(x=>x.d.slice(5)), mut=cmuted();
  const useR=series.some(s=>s.axis==='R');
  const datasets=series.map(s=>({label:s.label,data:d.map(s.fn),borderColor:s.color,backgroundColor:s.color,
    yAxisID:s.axis==='R'?'y1':'y',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,_fmt:FMT[s.fmt]||numf}));
  const scales={x:{ticks:{color:mut,font:{size:9}},grid:{display:false}},
    y:{position:'left',beginAtZero:true,ticks:{color:mut,font:{size:9},callback:v=>(FMT[opts.L.fmt]||numf)(v)},grid:{color:cgrid()}}};
  if(useR) scales.y1={position:'right',beginAtZero:true,grid:{display:false},ticks:{color:mut,font:{size:9},callback:v=>(FMT[opts.R.fmt]||numf)(v)}};
  charts[id]=new Chart(el,{type:'line',data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:10}}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset._fmt||numf)(c.raw)}}},
      scales}});
}
/* barras horizontais (faturamento por anúncio) */
const barLabels={id:'barLabels',afterDatasetsDraw(ch){const{ctx}=ch;ctx.save();ctx.font='600 11px Segoe UI,system-ui';ctx.fillStyle=cmuted();ctx.textBaseline='middle';
  const ds=ch.data.datasets[0], f=ds._fmt||intf;
  ch.getDatasetMeta(0).data.forEach((el,i)=>{const v=ds.data[i]; if(!v)return; ctx.fillText(f(v),el.x+5,el.y);});ctx.restore();}};
function hbar(id, items, valFn, color, top, fmtFn){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  let arr=items.slice().sort((a,b)=>valFn(b)-valFn(a)); if(top) arr=arr.slice(0,top);
  const mut=cmuted(), f=fmtFn||intf;
  charts[id]=new Chart(el,{type:'bar', plugins:[barLabels],
    data:{labels:arr.map(x=>x.label), datasets:[{label:'v',data:arr.map(valFn),backgroundColor:color||'#1BAF7A',borderRadius:3,_fmt:f}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:44}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>f(c.raw)}}},
      scales:{x:{beginAtZero:true,ticks:{color:mut,font:{size:9}},grid:{color:cgrid()}},
              y:{ticks:{color:mut,font:{size:9}},grid:{display:false}}}}});
}
/* CPL por dia, por item de uma dimensão (campanha/grupo) — 1 linha por item */
function cplDimChart(id, fM, fS, dim){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const spendTot={}; fM.forEach(r=>spendTot[r[dim]]=(spendTot[r[dim]]||0)+r.sp);
  const items=Object.keys(spendTot).sort((a,b)=>spendTot[b]-spendTot[a]).slice(0,6);
  const dset=new Set(); fM.forEach(r=>r.d&&dset.add(r.d)); fS.forEach(r=>r.d&&dset.add(r.d));
  const days=[...dset].sort();
  const K=(c,dd)=>c+'\u0001'+dd, sp={}, ld={};
  fM.forEach(r=>{if(!r.d)return; sp[K(r[dim],r.d)]=(sp[K(r[dim],r.d)]||0)+r.sp;});
  fS.forEach(r=>{if(!r.d||!r.meta)return; ld[K(r[dim],r.d)]=(ld[K(r[dim],r.d)]||0)+1;});
  const PAL=chartPalette();
  const ds=items.map((c,i)=>({label:c.length>22?c.slice(0,22)+'…':c,
    data:days.map(dd=>{const s=(sp[K(c,dd)]||0)*taxf(), v=ld[K(c,dd)]||0; return v?+(s/v).toFixed(2):null;}),
    borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],borderWidth:2,pointRadius:1.5,spanGaps:true,tension:.25}));
  const mut=cmuted();
  charts[id]=new Chart(el,{type:'line',data:{labels:days.map(x=>x.slice(5)),datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:8,font:{size:9}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+brl(c.raw)}}},
      scales:{x:{ticks:{color:mut,font:{size:9},maxRotation:0,autoSkip:true,autoSkipPadding:8},grid:{display:false}},y:{ticks:{color:mut,font:{size:9},callback:v=>brl(v)},grid:{color:cgrid()},beginAtZero:true}}}});
}

/* ---------------- colunas das tabelas (Gasto · CPM · Cliques · CPC · CTR · Leads · CPL · Tx Conversão) ---------------- */
const METRIC_COLS=[
  {key:'gasto',label:'Gasto',type:'brl',heat:'gasto'},
  {key:'impr',label:'Impressões',type:'int'},
  {key:'cpm',label:'CPM',type:'brl'},
  {key:'cliques',label:'Cliques',type:'int'},
  {key:'cpc',label:'CPC',type:'brl'},
  {key:'ctr',label:'CTR',type:'pct'},
  {key:'leads',label:'Leads',type:'int',heat:'leads'},
  {key:'cpl',label:'CPL',type:'brl'},
  {key:'conv',label:'Tx Conversão',type:'pct',heat:'conv',w:104},
];
const DAILY_COLS=[{key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:64}].concat(METRIC_COLS);
const HCOLS=[{key:'dim',label:'',type:'dim',big:true}].concat(METRIC_COLS.map(c=>{const o={...c}; delete o.heat; return o;}));
function metricCells(x,d){
  return {gasto:d.gasto, impr:x.im, cpm:d.cpm, cliques:x.cl, cpc:d.cpc, ctr:d.ctr, leads:x.leads, cpl:d.cpl, conv:d.conv};
}
function dailyCells(x,d,isTotal){
  return Object.assign({date:isTotal?null:x.d, wd:isTotal?'':weekday(x.d)}, metricCells(x,d));
}

/* ---------------- tabela Leads por origem ---------------- */
function renderSrcTable(id, leadsSet){
  const tot=leadsSet.length, by={};
  leadsSet.forEach(r=>{ by[r.src]=(by[r.src]||0)+1; });
  const rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([src,c])=>({k:src, cells:{src, leads:c, p:tot?c/tot:null}}));
  renderTable({id, cols:[{key:'src',label:'Origem',type:'dim',big:true},{key:'leads',label:'Leads',type:'int',w:80},{key:'p',label:'% do total',type:'pct',w:110}], rows,
    total:{src:null, leads:tot, p:tot?1:null}});
}

/* ---- comparativo período atual vs período anterior de MESMO tamanho ---- */
function prevWindow(){
  if(!STATE.from||!STATE.to) return null;
  const span=Math.round((new Date(STATE.to+'T00:00:00')-new Date(STATE.from+'T00:00:00'))/86400000)+1;
  if(!(span>=1)) return null;
  return {from:addDays(STATE.from,-span), to:addDays(STATE.from,-1), span};
}
const inRange=(d,a,b)=>d&&d>=a&&d<=b;
/* métricas em que MENOR é melhor (custo); nas demais, maior é melhor */
const GOOD_LOW={gasto:1,cpm:1,cpc:1,cpl:1};
function deltaBadge(cur,prev,key){
  if(cur==null||prev==null||!isFinite(cur)||!isFinite(prev)||prev===0) return '';
  const p=((cur-prev)/Math.abs(prev))*100; if(!isFinite(p)) return '';
  const flat=Math.abs(p)<0.05, up=cur>prev;
  const good=flat?null:(GOOD_LOW[key]?!up:up);
  const cls=flat?'flat':(good?'good':'bad'), arrow=flat?'→':(up?'▲':'▼');
  return `<span class="delta ${cls}">${arrow} ${nf1.format(Math.abs(p))}%</span>`;
}
function renderFunnel(id, steps){
  document.getElementById(id).innerHTML=steps.map(s=>{
    const color=s[4]?`var(${s[4]})`:'var(--accent-blue)';
    const hi=(s[3]==='gasto'||s[3]==='leads');   // valores em destaque + contorno inteiro
    const border=hi?`border-color:${color}`:`border-left-color:${color}`;
    const secs=s[2].map(x=>`<div><span class="s-label">${x[0]}</span><span class="s-val${x[2]?' s-pill '+x[2]:''}">${x[1]}</span></div>`).join('');
    return `<div class="step" style="${border}">
      <div class="step-main"><div class="m-label">${s[0]}</div>
        <div class="m-val"${hi?` style="color:${color}"`:''}>${s[1]}</div>
        ${s[5]?`<div class="m-delta">${s[5]}</div>`:''}</div>
      <div class="secs">${secs}</div></div>`;
  }).join('');
}
function funnelSteps(t, tp){
  const d=derive(t), P=(k)=>tp?tp[k]:null, Pd=tp?derive(tp):null;
  return [
    ['Gasto Total', brl(d.gasto), [], 'gasto', '--heat-gasto', deltaBadge(d.gasto, Pd?Pd.gasto:null, 'gasto')],
    ['Impressões', intf(t.im), [['CPM',brl(d.cpm)]], 'impr', '--c6', deltaBadge(t.im, P('im'), 'im')],
    ['Cliques (Página)', intf(t.cl), [['CPC',brl(d.cpc)],['CTR',pct(d.ctr)]], 'cl', '--c1', deltaBadge(t.cl, P('cl'), 'cl')],
    ['Leads', intf(t.leads), [['CPL',brl(d.cpl),'cac'],['Tx Conversão',pct(d.conv)]], 'leads', '--heat-fat', deltaBadge(t.leads, P('leads'), 'leads')],
  ];
}
function convCharts(id1,id2,id3,dd){
  multiLine(id1, dd, [{label:'CPM',fn:x=>x.im?+((x.sp*taxf())/x.im*1000).toFixed(2):null,color:cvar('--chart-cpm'),fmt:'brl',axis:'L'},
     {label:'CTR',fn:x=>x.im?+(x.cl/x.im).toFixed(4):null,color:cvar('--chart-ctr'),fmt:'pct',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'pct'}});
  multiLine(id2, dd, [{label:'CPC',fn:x=>x.cl?+((x.sp*taxf())/x.cl).toFixed(2):null,color:cvar('--chart-cr'),fmt:'brl',axis:'L'},
     {label:'CPL',fn:x=>x.leadsA?+((x.sp*taxf())/x.leadsA).toFixed(2):null,color:cvar('--chart-gasto'),fmt:'brl',axis:'L'}], {L:{fmt:'brl'}});
  multiLine(id3, dd, [{label:'Tx Conversão',fn:x=>x.cl?+(x.leadsA/x.cl).toFixed(4):null,color:cvar('--chart-convlp'),fmt:'pct',axis:'L'}], {L:{fmt:'pct'}});
}
const dayTable=(id,dd,t)=>renderTable({id, cols:DAILY_COLS,
    rows:dd.slice().reverse().map(x=>({k:x.d, cells:dailyCells(x,derive(x))})),
    total:dailyCells(t,derive(t),true),
    selectable:true, selSet:STATE.selDays,
    onSelect:(k,e)=>{ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); }});

/* ---------------- PAGE 1: Visão Geral ---------------- */
function renderGeral(){
  const fM=metaActive(), fS=salesActive();
  const t=totals(fS,fM);
  const pw=prevWindow();
  const tp = pw ? totals(SALES.filter(s=>inRange(s.d,pw.from,pw.to)), META.filter(m=>inRange(m.d,pw.from,pw.to))) : null;
  renderFunnel('geralFunnel', funnelSteps(t, tp));
  const dd=daily(fS,fM);
  convCharts('gCpmCtr','gCpcCpl','gConv', dd);
  comboChart('gCombo', dd);
  renderSrcTable('gSrc', fS);
  dayTable('gDaily', dd, t);
}

/* ---------------- PAGE 2: plataforma (Google Ads) ---------------- */
function metaScope(ex){ let fM=metaActive(), fS=salesActive().filter(s=>s.meta);
  if(ex!=='C'&&STATE.mSelC.size){ fM=fM.filter(r=>STATE.mSelC.has(r.camp)); fS=fS.filter(r=>STATE.mSelC.has(r.camp)); }
  if(ex!=='A'&&STATE.mSelA.size){ fM=fM.filter(r=>STATE.mSelA.has(r.adset)); fS=fS.filter(r=>STATE.mSelA.has(r.adset)); }
  return {fM,fS}; }
function selDim(dim,key,ctrl){
  const sets={C:STATE.mSelC,A:STATE.mSelA}, s=sets[dim];
  if(ctrl){ s.has(key)?s.delete(key):s.add(key); }
  else { const sole=s.has(key)&&s.size===1&&!Object.entries(sets).some(([k2,x])=>k2!==dim&&x.size);
    Object.values(sets).forEach(x=>x.clear()); if(!sole) s.add(key); }
  renderMeta();
}
function metaPrevTotals(pw){
  let fM=META.filter(m=>inRange(m.d,pw.from,pw.to));
  let fS=SALES.filter(s=>s.meta && inRange(s.d,pw.from,pw.to));
  if(STATE.mSelC.size){fM=fM.filter(r=>STATE.mSelC.has(r.camp));fS=fS.filter(r=>STATE.mSelC.has(r.camp));}
  if(STATE.mSelA.size){fM=fM.filter(r=>STATE.mSelA.has(r.adset));fS=fS.filter(r=>STATE.mSelA.has(r.adset));}
  return totals(fS,fM);
}
function renderMeta(){
  const F=metaScope(null), fM=F.fM, fS=F.fS;
  const t=totals(fS,fM);
  const pw=prevWindow(); const tp = pw ? metaPrevTotals(pw) : null;
  renderFunnel('metaFunnel', funnelSteps(t, tp));
  const dd=daily(fS,fM);
  convCharts('mCpmCtr','mCpcCpl','mConv', dd);
  comboChart('mCombo', dd);
  const aggG=buildAgg(fS,[], 'adset');
  hbar('mGroup', Object.entries(aggG).map(([label,a])=>({label,v:a.leads})), x=>x.v, cvar('--chart-faturamento'), 10, intf);
  dayTable('tDaily', dd, t);

  function hierRows(map){ return Object.entries(map).map(([k,a])=>({k, cells:Object.assign({dim:k}, metricCells(a,derive(a)))})); }
  function totRowOf(tt){ return Object.assign({dim:null}, metricCells(tt,derive(tt))); }
  const Sc=metaScope('C'), Sa=metaScope('A');
  renderTable({id:'tCamp', cols:HCOLS.map((c,i)=>i===0?{...c,label:'Campanha'}:c), rows:hierRows(buildAgg(Sc.fS,Sc.fM,'camp')), total:totRowOf(totals(Sc.fS,Sc.fM)),
    selectable:true, selSet:STATE.mSelC, onSelect:(k,e)=>selDim('C',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'tAdset', cols:HCOLS.map((c,i)=>i===0?{...c,label:'Grupo de anúncios'}:c), rows:hierRows(buildAgg(Sa.fS,Sa.fM,'adset')), total:totRowOf(totals(Sa.fS,Sa.fM)),
    selectable:true, selSet:STATE.mSelA, onSelect:(k,e)=>selDim('A',k,e&&(e.ctrlKey||e.metaKey))});
  cplDimChart('chCamp', Sc.fM, Sc.fS, 'camp');
  cplDimChart('chAdset', Sa.fM, Sa.fS, 'adset');

  document.getElementById('qCount').textContent=fS.length+' leads';
  const rows=fS.slice().sort((a,b)=>(a.d<b.d?1:-1));
  renderTable({id:'tQual',
    cols:[{key:'d',label:'Data',type:'date'},{key:'nm',label:'Nome',type:'dim'},{key:'camp',label:'Campanha',type:'dim',big:true},
      {key:'adset',label:'Grupo de anúncios',type:'dim',w:200},{key:'st',label:'Status',type:'dim',w:110}],
    rows:rows.map((s,i)=>({k:'s'+i, cells:{d:s.d,nm:s.nm,camp:s.camp,adset:s.adset,st:s.st}}))});
}

/* ---------------- PAGE: Relatórios ----------------
   Total = todos os leads · Tráfego = só leads atribuídos à plataforma.
   Código de cor em CPL e Tx Conversão (metas em build/config.py; 0 = sem cor). */
const CPL_TARGET=B.cpl_target, CONV_TARGET=B.conv_target;
const REL_BAND_LO=(B.report_band_low!=null?B.report_band_low:0.7);
const REL_BAND_HI=(B.report_band_high!=null?B.report_band_high:1.3);
function relPerf(v,kind){
  if(v==null||!isFinite(v)) return null;
  if(kind==='conv') return CONV_TARGET?v/CONV_TARGET:null;
  return (CPL_TARGET&&v>0)?CPL_TARGET/v:null;
}
function relColor(v,kind){ const p=relPerf(v,kind); if(p==null) return '';
  if(p<REL_BAND_LO) return 'rc-red'; if(p<1) return 'rc-yellow';
  if(p<REL_BAND_HI) return 'rc-green'; return 'rc-cyan'; }
function relCard(label,val,hero){ return `<div class="rel-card${hero?' hero':''}"><div class="rl">${label}</div><div class="rv">${val}</div></div>`; }
function relCards(id,t){ const d=derive(t);
  document.getElementById(id).innerHTML=[
    relCard('Valor Gasto',brl(d.gasto)),
    relCard('Cliques',intf(t.cl)),
    relCard('Leads',intf(t.leads)),
    relCard('CPL',`<span class="${relColor(d.cpl,'cpl')}">${brl(d.cpl)}</span>`,true),
    relCard('CPC',brl(d.cpc)),
    relCard('Tx Conversão',`<span class="${relColor(d.conv,'conv')}">${pct(d.conv)}</span>`),
  ].join('');
}
/* tabela estática simples (cols/rows/foot = [{v,cls}]) — mantém a estética .dt */
function relRenderTable(id,cols,rows,foot){
  const el=document.getElementById(id); if(!el) return;
  const th='<thead><tr>'+cols.map(c=>`<th class="${c.cls||''}">${c.label}</th>`).join('')+'</tr></thead>';
  const tb='<tbody>'+(rows.length?rows.map(r=>'<tr>'+r.map(c=>`<td class="${c.cls||''}">${c.v}</td>`).join('')+'</tr>').join('')
    :`<tr><td class="dim" colspan="${cols.length}" style="color:var(--muted)">Sem dados no período.</td></tr>`)+'</tbody>';
  const tf=foot?('<tfoot><tr>'+foot.map(c=>`<td class="${c.cls||''}">${c.v}</td>`).join('')+'</tr></tfoot>'):'';
  el.innerHTML=th+tb+tf;
}
function relBriefKey(){ if(STATE.selDays.size) return null; return STATE.preset||null; }
function renderRelBrief(){
  const wrap=document.getElementById('relBrief'), stampEl=document.getElementById('relBriefStamp');
  const bf=DATA.briefings||{}, per=bf.periodos||{}, key=relBriefKey();
  stampEl.textContent = bf.generated_at ? `Briefing gerado por IA · última atualização ${bf.generated_at} · atualiza 1×/dia às 23h59` : '';
  if(!Object.keys(per).length){
    wrap.innerHTML='<div class="rel-brief-empty">Briefing do Gestor ainda não configurado para este funil (opcional — ver build/GUIA-RELATORIOS.md).</div>'; return; }
  if(!key || !per[key]){
    wrap.innerHTML='<div class="rel-brief-empty">Briefing disponível para os períodos predefinidos (Hoje, Ontem, 3&nbsp;dias, 7&nbsp;dias, 14&nbsp;dias, 30&nbsp;dias, Este mês, Mês passado, Todo período). Selecione um desses botões no topo.</div>'; return; }
  const item=per[key];
  wrap.innerHTML = item.html || item.texto || '<div class="rel-brief-empty">Sem conteúdo.</div>';
}
function renderRelatorios(){
  const fM=metaActive(), fSall=salesActive(), fSads=fSall.filter(s=>s.meta);
  const tTot=totals(fSall,fM), tAds=totals(fSads,fM);
  const dvT=derive(tTot), dvA=derive(tAds);

  const pr=PRESETS.find(p=>p[0]===STATE.preset);
  document.getElementById('relPeriodName').textContent = STATE.selDays.size?'Dias selecionados':(pr?pr[1]:'Personalizado');
  let rangeTxt='';
  if(STATE.from&&STATE.to){ const nD=Math.round((new Date(STATE.to+'T00:00:00')-new Date(STATE.from+'T00:00:00'))/86400000)+1;
    rangeTxt=`${brdate(STATE.from)} a ${brdate(STATE.to)}`+(nD>0?` · ${nD} dia${nD>1?'s':''}`:''); }
  document.getElementById('relPeriodRange').textContent=rangeTxt;

  relCards('relCardsTotal',tTot);
  relCards('relCardsAds',tAds);

  const ddTot=daily(fSall,fM), ddAds={}; daily(fSads,fM).forEach(x=>ddAds[x.d]=x);
  const dcols=[{label:'Data'},{label:'Dia',cls:'dim'},{label:'Gasto'},{label:'Cliques'},{label:'Leads Totais'},
    {label:'Leads Ads',cls:'sep-col'},{label:'CPL Ads'},{label:'Tx Conv. Ads'}];
  const drows=ddTot.slice().reverse().map(x=>{ const dv=derive(x), a=ddAds[x.d], da=a?derive(a):null;
    const cpl=da?da.cpl:null, conv=da?da.conv:null;
    return [{v:brdate(x.d),cls:'dim'},{v:weekday(x.d),cls:'dim'},{v:brl(dv.gasto)},{v:intf(x.cl)},{v:intf(x.leads)},
      {v:intf(a?a.leads:0),cls:'sep-col'},{v:brl(cpl),cls:relColor(cpl,'cpl')},{v:pct(conv),cls:relColor(conv,'conv')}]; });
  const dfoot=[{v:'Total',cls:'dim'},{v:'',cls:'dim'},{v:brl(dvT.gasto)},{v:intf(tTot.cl)},{v:intf(tTot.leads)},
    {v:intf(tAds.leads),cls:'sep-col'},{v:brl(dvA.cpl),cls:relColor(dvA.cpl,'cpl')},{v:pct(dvA.conv),cls:relColor(dvA.conv,'conv')}];
  relRenderTable('relDaily',dcols,drows,dfoot);

  const rowOf=(name,ag)=>{ const d=derive(ag);
    return [{v:esc(name),cls:'dim'},{v:brl(d.gasto)},{v:brl(d.cpm)},{v:intf(ag.cl)},{v:brl(d.cpc)},{v:pct(d.ctr)},
      {v:intf(ag.leads)},{v:brl(d.cpl),cls:relColor(d.cpl,'cpl')},{v:pct(d.conv),cls:relColor(d.conv,'conv')}]; };
  const hcols=lbl=>[{label:lbl,cls:'dim'},{label:'Gasto'},{label:'CPM'},{label:'Cliques'},{label:'CPC'},{label:'CTR'},{label:'Leads'},{label:'CPL'},{label:'Tx Conv.'}];
  const aggC=buildAgg(fSads,fM,'camp');
  relRenderTable('relCamp', hcols('Campanha'),
    Object.entries(aggC).sort((a,b)=>b[1].sp-a[1].sp).map(([n,ag])=>rowOf(n,ag)),
    rowOf('Total',tAds).map((c,i)=>i===0?{v:'Total',cls:'dim'}:c));

  const aggG=buildAgg(fSads,fM,'adset');
  const grs=Object.entries(aggG).filter(([n,ag])=>ag.sp>0).map(([name,ag])=>({name,ag,d:derive(ag)}));
  grs.sort((a,b)=>{ const ca=a.d.cpl==null?Infinity:a.d.cpl, cb=b.d.cpl==null?Infinity:b.d.cpl; if(ca!==cb) return ca-cb;
    return (b.d.conv||0)-(a.d.conv||0); });
  const k=Math.min(5,Math.ceil(grs.length/2));
  const top=grs.slice(0,k), topSet=new Set(top.map(a=>a.name));
  const worst=grs.filter(a=>!topSet.has(a.name)).slice(-5).reverse();
  relRenderTable('relTop',hcols('Grupo'),top.map(g=>rowOf(g.name,g.ag)));
  relRenderTable('relWorst',hcols('Grupo'),worst.map(g=>rowOf(g.name,g.ag)));

  renderRelBrief();
}

/* ---------------- PAGE 3: IA Insights ---------------- */
const r2=v=>(v==null||!isFinite(v))?null:Math.round(v*100)/100;
const r4=v=>(v==null||!isFinite(v))?null:Math.round(v*10000)/10000;
function iaMetricRow(x,d){
  return {gasto:r2(d.gasto),impressoes:x.im,cpm:r2(d.cpm),cliques:x.cl,cpc:r2(d.cpc),ctr:r4(d.ctr),
    leads:x.leads,leads_plataforma:x.leadsA,cpl:r2(d.cpl),tx_conversao:r4(d.conv)};
}
/* janela própria da IA — independente do filtro de período das outras abas */
const IA_WINDOWS=[['3d',3,'3 dias'],['7d',7,'7 dias'],['14d',14,'14 dias'],['30d',30,'30 dias']];
function iaWinDays(){ const w=IA_WINDOWS.find(x=>x[0]===STATE.iaWin); return w?w[1]:14; }
function iaRenderWin(){
  document.getElementById('iaWin').innerHTML=IA_WINDOWS.map(w=>
    `<button class="chip ${STATE.iaWin===w[0]?'active':''}" data-w="${w[0]}">${w[2]}</button>`).join('');
  document.querySelectorAll('#iaWin .chip').forEach(c=>c.addEventListener('click',()=>{
    STATE.iaWin=c.dataset.w; localStorage.setItem('ia_win',STATE.iaWin); iaRenderWin();
  }));
}
function iaBuildData(){
  const winDays=iaWinDays(), from=addDays(TODAY,-(winDays-1)), to=TODAY;
  const inWin=d=>d && d>=from && d<=to;
  const fM=META.filter(m=>inWin(m.d)), fSall=SALES.filter(s=>inWin(s.d)), fSads=fSall.filter(s=>s.meta);
  const t=totals(fSall,fM), ta=totals(fSads,fM);
  const top=(dim,lim)=>Object.entries(buildAgg(fSads,fM,dim)).sort((a,b)=>b[1].sp-a[1].sp).slice(0,lim)
    .map(([nome,a])=>Object.assign({nome}, iaMetricRow(a,derive(a))));
  return {
    periodo:{de:from,ate:to,janela_ia:STATE.iaWin},
    funil:"Captação de leads: Anúncio ("+PLAT+") → Página → Lead. Sem vendas/faturamento.",
    obs:"Taxas em fração 0-1. tx_conversao = Leads/Cliques; cpl = Gasto/Leads atribuídos à plataforma. total_todos_leads inclui orgânico/direto.",
    total_todos_leads: iaMetricRow(t,derive(t)),
    total_plataforma: iaMetricRow(ta,derive(ta)),
    serie_diaria: daily(fSads,fM).map(x=>Object.assign({d:x.d}, iaMetricRow(x,derive(x)))),
    campanhas: top('camp',10),
    grupos_de_anuncios: top('adset',15),
  };
}
function iaBackendUrl(){ return iaNormUrl(localStorage.getItem('ia_backend')||B.ia_worker_url||''); }
function iaStatusText(){
  const b=iaBackendUrl(), p=localStorage.getItem('ia_pass');
  document.getElementById('iaStatus').textContent = b ? '' : 'backend não configurado — clique em Configurar';
  document.getElementById('iaGen').disabled = !(b&&p);
}
function iaShow(html){ document.getElementById('iaCards').innerHTML=html; }
function iaFmtDate(ts){ try{ return new Date(ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return ''; } }
function iaRenderCards(insights,usage,at,from,to){
  if(!insights.length){ iaShow('<div class="ia-empty">A IA não retornou insights.</div>'); return; }
  const stamp = at ? `<div class="ia-empty" style="grid-column:1/-1;text-align:left">Gerado em ${iaFmtDate(at)}${from&&to?` · janela ${esc(from)} a ${esc(to)}`:''}</div>` : '';
  const sev=s=>['alta','media','baixa'].includes(String(s))?s:'baixa';
  const cards=insights.map(i=>{
    const s=sev(i.severidade); let verba='';
    if(i.verba && i.verba.acao && i.verba.acao!=='manter'){
      const v=i.verba, pct=(v.percentual!=null?(' '+Math.abs(v.percentual)+'%'):'');
      verba=`<div class="ins-verba">💰 <b>Verba:</b> ${esc(v.acao)}${pct} ${v.nivel_ajuste?('no '+esc(v.nivel_ajuste)):''}${v.observacao?(' — '+esc(v.observacao)):''}<span class="ins-apply">Peça no chat para eu aplicar no Meta Ads.</span></div>`;
    }
    return `<div class="ins-card sev-${s}">
      <div class="ins-head"><span class="ins-badge">${esc(i.nivel||'funil')} · ${esc(i.metrica||'')}</span><span class="ins-sev">${esc(s)}</span></div>
      <div class="ins-title">${esc(i.titulo||'')}</div>
      <div class="ins-diag">${esc(i.diagnostico||'')}</div>
      <div class="ins-rec"><b>Ação:</b> ${esc(i.recomendacao||'')}</div>
      ${i.estrutura?`<div class="ins-struct">Estrutura: ${esc(i.estrutura)}</div>`:''}
      ${verba}
    </div>`;
  }).join('');
  const u = usage ? `<div class="ia-empty" style="grid-column:1/-1">Tokens: entrada ${usage.input_tokens||'?'} · saída ${usage.output_tokens||'?'}</div>` : '';
  iaShow(stamp+cards+u);
}
function iaNormUrl(u){ u=(u||'').trim(); if(u && !/^https?:\/\//i.test(u)) u='https://'+u; return u; }
async function iaGenerate(){
  const backend=iaBackendUrl(), pass=localStorage.getItem('ia_pass');
  if(!backend||!pass){ document.getElementById('iaConfig').style.display='block'; return; }
  const btn=document.getElementById('iaGen'); btn.classList.add('loading'); btn.disabled=true;
  iaShow('<div class="ia-empty">Gerando insights com a IA… (pode levar alguns segundos)</div>');
  try{
    const res=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass,data:iaBuildData()})});
    const txt=await res.text(); let j=null; try{ j=JSON.parse(txt); }catch{}
    if(!j){ iaShow('<div class="ins-card err"><div class="ins-title">Resposta inválida do backend</div><div class="ins-diag">HTTP '+res.status+'. A URL do Worker pode estar errada ou o Worker não está publicado. Abra a URL no navegador: deve mostrar <code>{"error":"Use GET ou POST."}</code>.</div><div class="ins-struct">'+esc(txt.slice(0,200))+'</div></div>'); return; }
    if(!res.ok || j.error){
      const extra=[]; if(j.detail) extra.push(String(j.detail)); if(j.stop_reason) extra.push('stop_reason='+j.stop_reason); if(j.raw) extra.push('Resposta do modelo: '+String(j.raw));
      iaShow('<div class="ins-card err"><div class="ins-title">Erro</div><div class="ins-diag">'+esc(j.error||('HTTP '+res.status))+'</div>'+(extra.length?('<div class="ins-struct" style="white-space:pre-wrap">'+esc(extra.join('\n').slice(0,1200))+'</div>'):'')+'</div>');
    }
    else {
      iaRenderCards(j.insights||[], j.usage, j.at||Date.now(), j.from, j.to);
    }
  }catch(e){ iaShow('<div class="ins-card err"><div class="ins-title">Falha de rede</div><div class="ins-diag">'+esc(e.message)+' — a URL deve começar com https:// e terminar em .workers.dev, e o Worker precisa estar publicado (CORS).</div></div>'); }
  finally{ btn.classList.remove('loading'); btn.disabled=false; }
}
async function iaLoadLatest(){
  const backend=iaBackendUrl();
  if(!backend){ iaShow('<div class="ia-empty">Configure o backend e clique em <b>Gerar insights</b>.</div>'); return; }
  iaShow('<div class="ia-empty">Carregando insights…</div>');
  try{
    const res=await fetch(backend,{method:'GET'});
    const j=await res.json().catch(()=>null);
    if(j && Array.isArray(j.insights) && j.insights.length){ iaRenderCards(j.insights, j.usage, j.at, j.from, j.to); }
    else { iaShow('<div class="ia-empty">Nenhum insight gerado ainda. Clique em <b>Gerar insights</b>.</div>'); }
  }catch(e){ iaShow('<div class="ia-empty">Não foi possível carregar os insights agora. Clique em <b>Gerar insights</b>.</div>'); }
}
function renderIA(){ iaStatusText(); iaRenderWin(); iaLoadLatest(); }

/* ---------------- date presets ---------------- */
const PRESETS=[
  ['hoje','Hoje',()=>[TODAY,TODAY]],
  ['ontem','Ontem',()=>[addDays(TODAY,-1),addDays(TODAY,-1)]],
  ['3d','3 dias',()=>[addDays(TODAY,-2),TODAY]],
  ['7d','7 dias',()=>[addDays(TODAY,-6),TODAY]],
  ['14d','14 dias',()=>[addDays(TODAY,-13),TODAY]],
  ['30d','30 dias',()=>[addDays(TODAY,-29),TODAY]],
  ['mes','Este mês',()=>{const [y,m]=TODAY.split('-');return [`${y}-${m}-01`,TODAY];}],
  ['mespass','Mês passado',()=>{const dt=new Date(TODAY+'T00:00:00');const f=new Date(dt.getFullYear(),dt.getMonth()-1,1);const l=new Date(dt.getFullYear(),dt.getMonth(),0);return [dstr(f),dstr(l)];}],
  ['todo','Máximo',()=>[B.date_min,B.date_max]],
];
/* rótulo do botão de período — mostra o intervalo aplicado dentro do próprio botão */
function syncDateInputs(){
  const el=document.getElementById('periodBtnLabel'); if(!el) return;
  if(STATE.selDays.size){ el.textContent=STATE.selDays.size+(STATE.selDays.size>1?' dias selecionados':' dia selecionado'); return; }
  const pr=PRESETS.find(p=>p[0]===STATE.preset);
  if(STATE.from&&STATE.to) el.textContent=brdate(STATE.from)+' – '+brdate(STATE.to)+(pr?' · '+pr[1]:'');
  else el.textContent='Selecionar período';
}
function applyPreset(id){ const p=PRESETS.find(x=>x[0]===id); if(!p)return; const [f,t]=p[2]();
  STATE.from=f; STATE.to=t; STATE.preset=id; STATE.selDays.clear(); ppClose(); syncDateInputs(); renderAll(); }

/* ---- popover do seletor de período (estilo Data Studio) ---- */
const MONTHS_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_PT=['D','S','T','Q','Q','S','S'];
const PP={from:null,to:null,preset:'',fromView:'',toView:''};
function ymView(ds){ return (ds||TODAY).slice(0,7); }
function shiftView(view,delta){ const [y,m]=view.split('-').map(Number); const dt=new Date(y,m-1+delta,1); return dt.getFullYear()+'-'+pad(dt.getMonth()+1); }
function ppIsOpen(){ const pop=document.getElementById('periodPop'); return pop && !pop.hidden; }
function ppOpen(){
  PP.from=STATE.from; PP.to=STATE.to; PP.preset=STATE.selDays.size?'':STATE.preset;
  PP.fromView=ymView(STATE.from); PP.toView=ymView(STATE.to);
  document.getElementById('periodPop').hidden=false;
  document.getElementById('periodBtn').setAttribute('aria-expanded','true');
  ppRenderAll();
}
function ppClose(){ const pop=document.getElementById('periodPop'); if(pop) pop.hidden=true;
  const b=document.getElementById('periodBtn'); if(b) b.setAttribute('aria-expanded','false'); }
function ppRenderAll(){ ppRenderPresets(); ppRenderCal('from'); ppRenderCal('to'); ppRenderRange(); }
function ppRenderPresets(){
  const host=document.getElementById('ppPresets');
  host.innerHTML=PRESETS.map(p=>`<button class="pp-preset ${PP.preset===p[0]?'active':''}" data-p="${p[0]}">${p[1]}</button>`).join('');
  host.querySelectorAll('.pp-preset').forEach(c=>c.addEventListener('click',()=>{
    const p=PRESETS.find(x=>x[0]===c.dataset.p); const [f,t]=p[2]();
    PP.from=f; PP.to=t; PP.preset=p[0]; PP.fromView=ymView(f); PP.toView=ymView(t); ppRenderAll();
  }));
}
function ppRenderCal(side){
  const host=document.getElementById(side==='from'?'ppCalFrom':'ppCalTo');
  const view=side==='from'?PP.fromView:PP.toView;
  const [y,m]=view.split('-').map(Number);
  const startDow=new Date(y,m-1,1).getDay(), dim=new Date(y,m,0).getDate();
  let cells='';
  for(let i=0;i<startDow;i++) cells+='<span class="pp-day empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=view+'-'+pad(d);
    const inR=PP.from&&PP.to&&ds>=PP.from&&ds<=PP.to, isEdge=(ds===PP.from||ds===PP.to);
    const cls=['pp-day']; if(inR) cls.push('in'); if(ds===PP.from) cls.push('edge-l'); if(ds===PP.to) cls.push('edge-r'); if(isEdge) cls.push('sel');
    cells+=`<button class="${cls.join(' ')}" data-side="${side}" data-d="${ds}">${d}</button>`;
  }
  host.innerHTML=`<div class="pp-cal-head"><span class="pp-cal-title">${side==='from'?'Data de início':'Data de término'}</span></div>
    <div class="pp-cal-nav"><button class="pp-nav" data-nav="-1">‹</button><span class="pp-cal-month">${MONTHS_PT[m-1]} ${y}</span><button class="pp-nav" data-nav="1">›</button></div>
    <div class="pp-dow">${DOW_PT.map(x=>`<span>${x}</span>`).join('')}</div>
    <div class="pp-grid">${cells}</div>`;
  host.querySelectorAll('.pp-nav').forEach(b=>b.addEventListener('click',()=>{
    const nv=shiftView(view,+b.dataset.nav); if(side==='from') PP.fromView=nv; else PP.toView=nv; ppRenderCal(side);
  }));
  host.querySelectorAll('.pp-day[data-d]').forEach(b=>b.addEventListener('click',()=>ppPickDay(side,b.dataset.d)));
}
function ppPickDay(side,ds){
  PP.preset='';
  if(side==='from'){ PP.from=ds; if(PP.to&&PP.from>PP.to) PP.to=PP.from; }
  else { PP.to=ds; if(PP.from&&PP.to<PP.from) PP.from=PP.to; }
  ppRenderAll();
}
function ppRenderRange(){
  const el=document.getElementById('ppRange');
  if(PP.from&&PP.to){ const n=Math.round((new Date(PP.to+'T00:00:00')-new Date(PP.from+'T00:00:00'))/86400000)+1;
    el.textContent=brdate(PP.from)+' – '+brdate(PP.to)+(n>0?' · '+n+(n>1?' dias':' dia'):''); }
  else el.textContent='Selecione as datas';
}
function ppApply(){
  if(!PP.from||!PP.to){ ppClose(); return; }
  STATE.from=PP.from; STATE.to=PP.to; STATE.preset=PP.preset||''; STATE.selDays.clear();
  ppClose(); syncDateInputs(); renderAll();
}

/* ---------------- navigation & boot ---------------- */
const HAS_IA = !!B.ia_worker_url;
function setPage(p){ if(p==='ia'&&!HAS_IA) p='geral'; STATE.page=p;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===p));
  ['geral','meta','rel','ia'].forEach(id=>document.getElementById('page-'+id).classList.toggle('active',p===id));
  document.getElementById('ptitle').textContent = p==='meta'?PLAT:(p==='rel'?'Relatórios':(p==='ia'?'IA Insights':'Visão Geral'));
  document.getElementById('navToggle').checked=false;
  history.replaceState(null,'', '#'+p);
  renderAll();
}
function renderAll(){ if(STATE.page==='meta') renderMeta(); else if(STATE.page==='rel') renderRelatorios(); else if(STATE.page==='ia') renderIA(); else renderGeral(); }

function applyTheme(){ const t=localStorage.getItem('dm_theme'); if(t==='light') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme','dark'); }
applyTheme();
document.getElementById('themeBtn').addEventListener('click',()=>{ const dark=document.documentElement.getAttribute('data-theme')==='dark'; localStorage.setItem('dm_theme',dark?'light':'dark'); applyTheme(); renderAll(); });

document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>setPage(n.dataset.page)));
document.getElementById('taxToggle').addEventListener('click',function(){ STATE.tax=!STATE.tax; this.classList.toggle('on',STATE.tax); renderAll(); });
document.getElementById('periodBtn').addEventListener('click',e=>{ e.stopPropagation(); ppIsOpen()?ppClose():ppOpen(); });
document.getElementById('ppApply').addEventListener('click',ppApply);
document.getElementById('ppCancel').addEventListener('click',ppClose);
document.getElementById('periodPop').addEventListener('click',e=>e.stopPropagation());
document.addEventListener('click',()=>{ if(ppIsOpen()) ppClose(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&ppIsOpen()) ppClose(); });
document.getElementById('clearBtn').addEventListener('click',()=>{ STATE.mSelC.clear();STATE.mSelA.clear();STATE.selDays.clear(); applyPreset('todo'); });
document.getElementById('refreshBtn').addEventListener('click',function(){ this.classList.add('loading'); goRefresh(); });

document.getElementById('iaCfgBtn').addEventListener('click',()=>{ const c=document.getElementById('iaConfig');
  c.style.display = c.style.display==='none'?'block':'none';
  document.getElementById('iaUrl').value=localStorage.getItem('ia_backend')||'';
  document.getElementById('iaPass').value=localStorage.getItem('ia_pass')||''; });
document.getElementById('iaSave').addEventListener('click',()=>{
  const u=iaNormUrl(document.getElementById('iaUrl').value), p=document.getElementById('iaPass').value;
  if(u) localStorage.setItem('ia_backend',u); else localStorage.removeItem('ia_backend');
  if(p) localStorage.setItem('ia_pass',p); else localStorage.removeItem('ia_pass');
  document.getElementById('iaCfgMsg').textContent='Salvo neste navegador ✓';
  document.getElementById('iaConfig').style.display='none'; iaStatusText(); });
document.getElementById('iaGen').addEventListener('click',iaGenerate);

document.title=(B.client_sub?B.client_sub+' · ':'')+(B.client_name||'Dashboard');
document.getElementById('logoMain').textContent=B.client_name||'—';
document.getElementById('logoSub').textContent=B.client_sub||'';
document.getElementById('navPlat').textContent=PLAT;
document.querySelectorAll('.platName').forEach(el=>el.textContent=PLAT);
document.getElementById('taxLabel').textContent=B.tax_label||'Imposto';
if(TAX===1) document.getElementById('taxToggle').style.display='none';
if(!HAS_IA) document.getElementById('navIa').style.display='none';
document.getElementById('updated').innerHTML='Última atualização:<br>'+B.generated_at_brt+' (BRT)';
document.getElementById('buildFoot').textContent='build __BUILD_ID__';
document.getElementById('buildFoot2').textContent='· build __BUILD_ID__';

syncDateInputs(); iaStatusText();
document.getElementById('taxToggle').classList.toggle('on', STATE.tax);
setPage(location.hash==='#meta'?'meta':(location.hash==='#rel'?'rel':(location.hash==='#ia'?'ia':'geral')));

/* ---------------- Aviso de nova versão (sem recarregar por cima do usuário) ----------------
   O build publica uma versão nova a cada ~30 min, mas o GitHub Pages serve o HTML
   com Cache-Control próprio (as metatags http-equiv do <head> NÃO controlam o cache
   HTTP), então abrir a URL "pelada" pode entregar uma cópia antiga.

   Em vez de recarregar a página sozinho — o que apagava filtros, seleção e rolagem no
   meio do uso, e empilhava uma entrada no histórico a cada 30 min —, aqui a página
   CONSULTA a versão publicada com cache:'no-store' e, se houver build novo, mostra um
   aviso discreto. Quem decide a hora de atualizar é o usuário. */
const UPD_CHECK_MS = 5*60*1000;   /* consulta a cada 5 min (a página tem ~35 KB) */
let updPending = false;

function goRefresh(){
  /* replace() em vez de href: não empilha histórico a cada atualização */
  location.replace(location.pathname+'?t='+Date.now()+location.hash);
}

function updShowBanner(){
  if(updPending || document.getElementById('updBanner')) return;
  updPending = true;
  const el = document.createElement('div');
  el.id = 'updBanner';
  el.innerHTML = '<span>Novos dados publicados.</span>'
               + '<button class="btn primary" id="updNow">Atualizar agora</button>'
               + '<button class="btn" id="updLater" title="Continuar nesta versão">Depois</button>';
  document.body.appendChild(el);
  document.getElementById('updNow').addEventListener('click', goRefresh);
  document.getElementById('updLater').addEventListener('click', ()=>{ el.remove(); });
}

async function updCheck(){
  if(updPending || document.hidden) return;
  try{
    const r = await fetch(location.pathname+'?v='+Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    const html = await r.text();
    const m = html.match(/<meta\s+name="build"\s+content="([^"]+)"/i);
    if(m && B.build_id && m[1] !== B.build_id) updShowBanner();
  }catch(e){ /* offline ou falha de rede: tenta de novo no próximo ciclo */ }
}

setInterval(updCheck, UPD_CHECK_MS);
/* uma checagem logo após abrir: se o Pages entregou uma cópia de cache, o usuário
   descobre em segundos em vez de ficar olhando número velho sem saber */
setTimeout(updCheck, 15*1000);
/* e ao voltar para a aba, que é quando a pessoa vai de fato olhar os números */
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) updCheck(); });

