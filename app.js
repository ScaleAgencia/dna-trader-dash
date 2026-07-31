/* DNA do Trader de Banco — dashboard de vendas · render puro (sem libs, SVG na mão) sobre window.DTB */
(function(){
'use strict';
var D = window.DTB || {};
var arr = function(x){ return Array.isArray(x) ? x : (x ? [x] : []); };
var clamp = function(x){ return Math.max(0, Math.min(1, x)); };
var nf0 = new Intl.NumberFormat('pt-BR');
var nf1 = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
var nf2 = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
var money = function(v){ return 'R$ ' + nf2.format(v||0); };
var money0 = function(v){ return 'R$ ' + nf0.format(Math.round(v||0)); };
var intf = function(v){ return nf0.format(Math.round(v||0)); };
var pct = function(v){ return nf1.format(v||0) + '%'; };
var roasf = function(v){ return nf2.format(v||0); };
var dv = function(a,b){ return b>0 ? a/b : 0; };
function fmtBR(iso){ if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; var p=iso.split('-'); return p[2]+'/'+p[1]; }
function el(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function isDate(x){ return /^\d{4}-\d{2}-\d{2}$/.test(x); }

var COL={grn:'#28d76a',grn2:'#5bf094',yel:'#f2ec12',yel2:'#f7f45f',meta:'#3ad677',org:'#f2ec12'};

/* ---------- prepara meta (resolve grain interned) ---------- */
function prepMeta(S){
  S = S || {}; S.daily = arr(S.daily);
  var names = arr(S.names);
  S._grain = arr(S.grain).map(function(g){
    return { date:g.d, campaign:names[g.c]||'', adset:names[g.s]||'', ad:names[g.a]||'',
      spend:+g.sp||0, spendRaw:+g.spr||0, impr:+g.im||0, clicks:+g.ck||0, lpv:+g.lp||0,
      checkout:+g.chk||0, sales:+g.vn||0, rev:+g.rv||0 }; });
  return S;
}
var META = prepMeta(D.meta);
var VEN = D.vendas || {}; VEN.daily=arr(VEN.daily); VEN.byCamp=arr(VEN.byCamp); VEN.byAd=arr(VEN.byAd);

/* ---------- período global ---------- */
function boundsOf(){
  var ds=[];
  META.daily.forEach(function(d){ if(isDate(d.date))ds.push(d.date); });
  VEN.daily.forEach(function(d){ if(isDate(d.date))ds.push(d.date); });
  ds.sort(); return [ds[0]||'', ds[ds.length-1]||''];
}
var B=boundsOf(), minDate=B[0], maxDate=B[1];
function addDays(iso,n){ var p=iso.split('-'); var dt=new Date(Date.UTC(+p[0],+p[1]-1,+p[2])); dt.setUTCDate(dt.getUTCDate()+n); return dt.toISOString().slice(0,10); }
function daysBetween(a,b){ var pa=a.split('-'),pb=b.split('-'); return Math.round((Date.UTC(+pb[0],+pb[1]-1,+pb[2])-Date.UTC(+pa[0],+pa[1]-1,+pa[2]))/86400000); }
function inRange(dt,r){ return dt>=r[0] && dt<=r[1]; }
var PRESETS=[{k:'hoje',label:'Hoje'},{k:'ontem',label:'Ontem'},{k:'7d',label:'7 dias'},{k:'30d',label:'30 dias'},{k:'tudo',label:'Tudo'}];
var period='tudo', customRange=null;
function rangeFor(k){
  if(k==='custom'&&customRange) return customRange;
  if(k==='tudo') return [minDate,maxDate];
  if(k==='hoje') return [maxDate,maxDate];
  if(k==='ontem'){ var y=addDays(maxDate,-1); return [y,y]; }
  if(k==='7d')  return [addDays(maxDate,-6),maxDate];
  if(k==='30d') return [addDays(maxDate,-29),maxDate];
  return [minDate,maxDate];
}
function prevRange(rng){ var len=daysBetween(rng[0],rng[1])+1; var pe=addDays(rng[0],-1); return [addDays(pe,-(len-1)),pe]; }

/* =================== META: agregação =================== */
var METS=['spend','spendRaw','impr','clicks','lpv','checkout','sales','rev'];
function aggMeta(rng){ var o={}; METS.forEach(function(k){o[k]=0;});
  META.daily.forEach(function(d){ if(!inRange(d.date,rng))return; METS.forEach(function(k){o[k]+=(d[k]||0);}); }); return o; }
function metaDays(rng){ return META.daily.filter(function(d){return isDate(d.date)&&inRange(d.date,rng);}).sort(function(a,b){return a.date.localeCompare(b.date);}); }
function median(xs){ var a=xs.filter(function(x){return x!=null&&isFinite(x);}).sort(function(x,y){return x-y;}); if(!a.length)return 0; var m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function cacClass(v,med){ if(v==null||!isFinite(v)||v<=0||med<=0)return 'cac-n'; var r=v/med; if(r<=0.85)return 'cac-g'; if(r<=1.3)return 'cac-a'; return 'cac-r'; }
function roasClass(v){ if(v==null||!isFinite(v)||v<=0)return 'roas-n'; if(v>=1)return 'roas-g'; if(v>=0.8)return 'roas-a'; return 'roas-r'; }
function trendHTML(cur,prev,higherBetter){ if(prev==null||!isFinite(prev)||prev===0||!isFinite(cur))return ''; var ch=(cur-prev)/Math.abs(prev)*100; if(Math.abs(ch)<0.1)return '';
  var up=ch>0, good=higherBetter?up:!up; return '<span class="trend '+(good?'up':'down')+'">'+(up?'▲':'▼')+' '+nf1.format(Math.abs(ch))+'%</span>'; }

/* =================== KPI COLUMN (meta) =================== */
function subRow(l,v,tr){ return '<div class="sub-row"><span class="s-l">'+l+'</span><span class="s-v">'+v+(tr||'')+'</span></div>'; }
function kpiCard(cls,label,val,subs){ return '<div class="kpi-card'+(cls?' '+cls:'')+'"><div class="kpi-main"><div class="m-lab">'+label+'</div><div class="m-val">'+val+'</div></div><div class="kpi-sub">'+subs+'</div></div>'; }
function renderKpi(a,p){
  var roas=dv(a.rev,a.spend), lucro=a.rev-a.spend, cac=dv(a.spend,a.sales), ticket=dv(a.rev,a.sales);
  var taxaCompra=dv(a.sales,a.checkout);
  var hero='<div class="kpi-hero"><div class="h-lab">Investimento com imposto</div>'
    +'<div class="h-val">'+money(a.spend)+'</div>'
    +'<div class="h-foot"><span>Gerenciador <b>'+money0(a.spendRaw)+'</b></span>'
    +'<span>imposto <b>+13,85%</b></span></div></div>';
  var cards='';
  cards+=kpiCard('hl','Faturamento',money0(a.rev),
    subRow('Lucro (fat. − invest.)', '<span class="'+(lucro>=0?'pos':'neg')+'">'+money0(lucro)+'</span>', '')
    + subRow('Ticket médio', a.sales?money(ticket):'—', trendHTML(ticket,dv(p.rev,p.sales),true)));
  cards+=kpiCard('hl','Vendas',intf(a.sales),
    subRow('CPA / CAC', a.sales?money(cac):'—', trendHTML(cac,dv(p.spend,p.sales),false))
    + subRow('Checkout → venda', a.checkout?pct(taxaCompra*100):'—', trendHTML(taxaCompra,dv(p.sales,p.checkout),true)));
  var rc=roasClass(roas), barw=clamp(roas/2)*100, barcol=roas>=1?COL.grn:(roas>=0.8?COL.yel:'#ff5c7a');
  cards+=kpiCard('gold','ROAS c/ imposto',roasf(roas),
    subRow('Retorno por R$ 1', 'R$ '+roasf(roas), trendHTML(roas,dv(p.rev,p.spend),true))
    + '<div class="sub-row"><span class="s-l">break-even (1,00)</span><span class="s-v">'+(roas>=1?'✓ no lucro':pct(roas*100)+' do equilíbrio')+'</span></div>'
    + '<div class="mini-bar"><span style="width:'+barw.toFixed(0)+'%;background:'+barcol+'"></span></div>');
  el('m-kpi').innerHTML=hero+cards;
}

/* =================== FUNNEL =================== */
var FN_W=[100,84,68,52,38];
var FN_COL=['#5bf094','#3ad677','#28d76a','#17b855','#f2ec12'];
var STAGES=[
  {k:'impr',l:'Impressões',cost:'CPM',costfn:function(a){return dv(a.spend,a.impr)*1000;},rate:'CTR',ratefn:function(a){return dv(a.clicks,a.impr);},next:'clicks'},
  {k:'clicks',l:'Cliques',cost:'CPC',costfn:function(a){return dv(a.spend,a.clicks);},rate:'Connect',ratefn:function(a){return dv(a.lpv,a.clicks);},next:'lpv'},
  {k:'lpv',l:'View LP',cost:'Custo/LPV',costfn:function(a){return dv(a.spend,a.lpv);},rate:'Checkout',ratefn:function(a){return dv(a.checkout,a.lpv);},next:'checkout'},
  {k:'checkout',l:'Checkouts',cost:'Custo/Chk',costfn:function(a){return dv(a.spend,a.checkout);},rate:'Compra',ratefn:function(a){return dv(a.sales,a.checkout);},next:'sales'},
  {k:'sales',l:'Vendas',cost:'CPA',costfn:function(a){return dv(a.spend,a.sales);},rate:null}
];
function renderFunnel(a,p){
  var html='<div class="funnel">';
  for(var i=0;i<STAGES.length;i++){
    var s=STAGES[i], val=a[s.k]||0, cost=s.costfn(a), pcost=s.costfn(p);
    var costHtml='<div class="fs-v">'+money(cost)+'</div><div>'+s.cost+' '+trendHTML(cost,pcost,false)+'</div>';
    var rateHtml='';
    if(s.rate){ var rt=s.ratefn(a), prt=s.ratefn(p); rateHtml='<div class="fs-v">'+pct(rt*100)+'</div><div>'+s.rate+' '+trendHTML(rt,prt,true)+'</div>'; }
    html+='<div class="fn-stage">'
      +'<div class="fn-side right">'+costHtml+'</div>'
      +'<div class="fn-bar-wrap"><div class="fn-bar" style="width:'+FN_W[i]+'%;background:linear-gradient(180deg,'+FN_COL[i]+',rgba(0,0,0,.12))">'
      +'<span class="fn-n">'+intf(val)+'</span><span class="fn-l">'+s.l+'</span></div></div>'
      +'<div class="fn-side">'+rateHtml+'</div></div>';
    if(i<STAGES.length-1) html+='<div class="fn-rate"><span class="ar">↓</span></div>';
  }
  html+='</div>';
  el('m-funnel').innerHTML=html;
}

/* =================== CHARTS =================== */
function xticks(days){ var n=days.length; if(n<=1)return [0]; var step=Math.max(1,Math.round(n/7)); var t=[]; for(var i=0;i<n;i+=step)t.push(i); if(t[t.length-1]!==n-1)t.push(n-1); return t; }
var _tip=null;
function tipEl(){ if(!_tip){ _tip=document.createElement('div'); _tip.className='chart-tip'; _tip.style.display='none'; document.body.appendChild(_tip); } return _tip; }
function tipShow(html,x,y){ var t=tipEl(); t.innerHTML=html; t.style.display='block'; var w=t.offsetWidth,h=t.offsetHeight,nx=x+14,ny=y+14; if(nx+w>window.innerWidth-8)nx=x-w-14; if(ny+h>window.innerHeight-8)ny=y-h-14; t.style.left=Math.max(6,nx)+'px'; t.style.top=Math.max(6,ny)+'px'; }
function tipHide(){ if(_tip)_tip.style.display='none'; }
function hitRects(days,pl,gw,pt,ph){ var s=''; for(var i=0;i<days.length;i++){ s+='<rect class="hit" data-i="'+i+'" x="'+(pl+gw*i).toFixed(1)+'" y="'+pt+'" width="'+gw.toFixed(1)+'" height="'+ph+'" fill="transparent" pointer-events="all"/>'; } return s; }
function bindHits(cid,days,fmt){ var c=el(cid); if(!c)return; Array.prototype.forEach.call(c.querySelectorAll('.hit'),function(r){
  r.addEventListener('mousemove',function(e){ var i=+r.getAttribute('data-i'); if(days[i])tipShow(fmt(days[i]),e.clientX,e.clientY); });
  r.addEventListener('mouseleave',tipHide); }); }
function renderChartSales(days){
  var W=560,H=200,pl=32,pr=34,pt=12,pb=22,pw=W-pl-pr,ph=H-pt-pb,base=pt+ph;
  var maxV=Math.max.apply(null,days.map(function(d){return d.sales||0;}).concat([1]));
  var maxR=Math.max.apply(null,days.map(function(d){return d.rev||0;}).concat([1]));
  var n=days.length||1,gw=pw/n,bw=Math.max(2,Math.min(16,gw*0.5));
  var s='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
  [0,0.5,1].forEach(function(f){ var y=pt+ph*(1-f); s+='<line x1="'+pl+'" y1="'+y+'" x2="'+(W-pr)+'" y2="'+y+'" stroke="#16281f" stroke-dasharray="2 3"/>';
    s+='<text x="'+(pl-4)+'" y="'+(y+3)+'" text-anchor="end" fill="#557568" font-size="9">'+Math.round(maxV*f)+'</text>'; });
  days.forEach(function(d,i){ var xc=pl+gw*i+gw/2, vh=ph*dv(d.sales,maxV); if(d.sales>0) s+='<rect x="'+(xc-bw/2).toFixed(1)+'" y="'+(base-vh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+vh.toFixed(1)+'" rx="1.5" fill="rgba(40,215,106,.55)"/>'; });
  var pts=[]; days.forEach(function(d,i){ var xc=pl+gw*i+gw/2, y=base-ph*dv(d.rev,maxR); pts.push([xc,y]); });
  if(pts.length>1){ s+='<path d="M'+pts.map(function(p){return p[0].toFixed(1)+' '+p[1].toFixed(1);}).join(' L')+'" fill="none" stroke="'+COL.yel+'" stroke-width="2"/>'; }
  xticks(days).forEach(function(i){ var xc=pl+gw*i+gw/2; s+='<text x="'+xc.toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" fill="#557568" font-size="9">'+fmtBR(days[i].date)+'</text>'; });
  s+=hitRects(days,pl,gw,pt,ph)+'</svg>';
  el('m-chartSales').innerHTML='<div class="chart">'+s+'</div><div class="chart-legend"><span><span class="dot" style="background:rgba(40,215,106,.6)"></span>Vendas</span><span><span class="ln" style="background:'+COL.yel+'"></span>Faturamento</span></div>';
  bindHits('m-chartSales',days,function(d){ return '<div class="tt-d">'+fmtBR(d.date)+'</div><div class="tt-r"><span style="color:'+COL.grn2+'">Vendas</span><b>'+intf(d.sales)+'</b></div><div class="tt-r"><span style="color:'+COL.yel2+'">Faturamento</span><b>'+money0(d.rev)+'</b></div><div class="tt-sub">CPA '+(d.sales?money(dv(d.spend,d.sales)):'—')+' · ROAS '+roasf(dv(d.rev,d.spend))+'</div>'; });
}
function renderChartRoas(days){
  var W=560,H=200,pl=34,pr=30,pt=12,pb=22,pw=W-pl-pr,ph=H-pt-pb,base=pt+ph;
  var maxS=Math.max.apply(null,days.map(function(d){return d.spend||0;}).concat([1]));
  var roas=days.map(function(d){return dv(d.rev,d.spend);});
  var maxR=Math.max.apply(null,roas.concat([1]));
  var n=days.length||1,gw=pw/n,bw=Math.max(2,Math.min(16,gw*0.55));
  var s='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
  [0,0.5,1].forEach(function(f){ var y=pt+ph*(1-f); s+='<line x1="'+pl+'" y1="'+y+'" x2="'+(W-pr)+'" y2="'+y+'" stroke="#16281f" stroke-dasharray="2 3"/>';
    s+='<text x="'+(pl-4)+'" y="'+(y+3)+'" text-anchor="end" fill="#557568" font-size="9">'+Math.round(maxS*f)+'</text>';
    s+='<text x="'+(W-pr+3)+'" y="'+(y+3)+'" text-anchor="start" fill="#b9a300" font-size="9">'+nf1.format(maxR*f)+'</text>'; });
  if(maxR>0){ var y1=base-ph*clamp(1/maxR); s+='<line x1="'+pl+'" y1="'+y1.toFixed(1)+'" x2="'+(W-pr)+'" y2="'+y1.toFixed(1)+'" stroke="rgba(40,215,106,.45)" stroke-dasharray="4 3"/>'; }
  days.forEach(function(d,i){ var xc=pl+gw*i+gw/2, sh=ph*dv(d.spend,maxS); if(d.spend>0) s+='<rect x="'+(xc-bw/2).toFixed(1)+'" y="'+(base-sh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+sh.toFixed(1)+'" rx="1.5" fill="rgba(58,214,119,.32)"/>'; });
  var pts=[]; days.forEach(function(d,i){ if(d.spend>0){ var xc=pl+gw*i+gw/2, y=base-ph*clamp(roas[i]/maxR); pts.push([xc,y]); } });
  if(pts.length>1){ s+='<path d="M'+pts.map(function(p){return p[0].toFixed(1)+' '+p[1].toFixed(1);}).join(' L')+'" fill="none" stroke="'+COL.yel+'" stroke-width="2"/>'; }
  pts.forEach(function(p){ s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.6" fill="'+COL.yel+'"/>'; });
  xticks(days).forEach(function(i){ var xc=pl+gw*i+gw/2; s+='<text x="'+xc.toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" fill="#557568" font-size="9">'+fmtBR(days[i].date)+'</text>'; });
  s+=hitRects(days,pl,gw,pt,ph)+'</svg>';
  el('m-chartRoas').innerHTML='<div class="chart">'+s+'</div><div class="chart-legend"><span><span class="dot" style="background:rgba(58,214,119,.6)"></span>Investimento</span><span><span class="ln" style="background:'+COL.yel+'"></span>ROAS</span><span style="color:var(--muted2)">tracejado = break-even</span></div>';
  bindHits('m-chartRoas',days,function(d){ return '<div class="tt-d">'+fmtBR(d.date)+'</div><div class="tt-r"><span style="color:'+COL.meta+'">Investimento</span><b>'+money0(d.spend)+'</b></div><div class="tt-r"><span style="color:'+COL.yel2+'">ROAS</span><b>'+roasf(dv(d.rev,d.spend))+'</b></div><div class="tt-sub">Vendas '+intf(d.sales)+' · Fat. '+money0(d.rev)+'</div>'; });
}

/* =================== DAILY TABLE (meta) =================== */
function heatBg(rgb,frac){ return 'background:rgba('+rgb+','+(0.10+0.42*clamp(frac)).toFixed(3)+')'; }
function renderDaily(rng){
  var rows=metaDays(rng).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var maxS=Math.max.apply(null,rows.map(function(r){return r.spend||0;}).concat([1]));
  var medCac=median(rows.map(function(r){return r.sales>0?dv(r.spend,r.sales):null;}));
  var head='<thead><tr><th>Dia</th><th>Investimento</th><th>Impr.</th><th>Cliques</th><th>Vendas</th><th>CPA</th><th>Faturamento</th><th>ROAS</th><th>Lucro</th></tr></thead>';
  var body=rows.map(function(r){ var roas=dv(r.rev,r.spend), cac=r.sales>0?dv(r.spend,r.sales):null, lucro=r.rev-r.spend;
    return '<tr><td>'+fmtBR(r.date)+'</td>'
      +'<td class="num"><span class="heatcell" style="'+heatBg('58,214,119',r.spend/maxS)+'">'+money0(r.spend)+'</span></td>'
      +'<td class="num">'+intf(r.impr)+'</td>'
      +'<td class="num">'+intf(r.clicks)+'</td>'
      +'<td class="num">'+intf(r.sales)+'</td>'
      +'<td class="num">'+(cac!=null?'<span class="cac-pill '+cacClass(cac,medCac)+'">'+money0(cac)+'</span>':'—')+'</td>'
      +'<td class="num">'+money0(r.rev)+'</td>'
      +'<td class="num">'+(r.spend>0?'<span class="roas-pill '+roasClass(roas)+'">'+roasf(roas)+'</span>':'—')+'</td>'
      +'<td class="num '+(lucro>=0?'pos':'neg')+'">'+money0(lucro)+'</td></tr>'; }).join('');
  if(!rows.length) body='<tr><td colspan="9" class="empty">Sem dados no período.</td></tr>';
  var a=aggMeta(rng), tr=dv(a.rev,a.spend), tl=a.rev-a.spend, tc=a.sales>0?dv(a.spend,a.sales):null;
  var foot='<tfoot><tr><td>Total</td><td class="num">'+money0(a.spend)+'</td><td class="num">'+intf(a.impr)+'</td><td class="num">'+intf(a.clicks)+'</td><td class="num">'+intf(a.sales)+'</td><td class="num">'+(tc!=null?money0(tc):'—')+'</td><td class="num">'+money0(a.rev)+'</td><td class="num">'+(a.spend>0?roasf(tr):'—')+'</td><td class="num '+(tl>=0?'pos':'neg')+'">'+money0(tl)+'</td></tr></tfoot>';
  el('m-daily').innerHTML=head+'<tbody>'+body+'</tbody>'+foot;
}

/* =================== OTIMIZAÇÃO (árvore) =================== */
function prettyName(x){ return x==='SEM_RASTREIO' ? '— sem rastreio —' : x; }
function newNode(name,full){ return {name:name,full:full,spend:0,impr:0,clicks:0,lpv:0,checkout:0,sales:0,rev:0,kids:{}}; }
function accum(n,r){ n.spend+=r.spend||0;n.impr+=r.impr||0;n.clicks+=r.clicks||0;n.lpv+=r.lpv||0;n.checkout+=r.checkout||0;n.sales+=r.sales||0;n.rev+=r.rev||0; }
var expanded={}, treeInit=false;
function buildTree(rows){ var c={}; rows.forEach(function(r){
  var cn=c[r.campaign]||(c[r.campaign]=newNode(prettyName(r.campaign),r.campaign)); accum(cn,r);
  var sn=cn.kids[r.adset]||(cn.kids[r.adset]=newNode(prettyName(r.adset),r.adset)); accum(sn,r);
  var an=sn.kids[r.ad]||(sn.kids[r.ad]=newNode(prettyName(r.ad),r.ad)); accum(an,r); }); return c; }
function actTag(n,medRoas){
  if(n.spend===0 && n.sales>0) return {t:'s/ gasto',c:'act-ins'};
  if(n.spend>0 && n.sales===0) return {t:'Pausar',c:'act-pause'};
  if(n.sales<2) return {t:'Dado insuf.',c:'act-ins'};
  if(medRoas<=0) return {t:'—',c:'act-ins'};
  var r=dv(n.rev,n.spend)/medRoas;
  if(r>=1.2) return {t:'Acelerar',c:'act-acel'};
  if(r<=0.6) return {t:'Revisar',c:'act-rev'};
  return {t:'Manter',c:'act-mant'};
}
function metricsCells(n,medRoas,medCac){ var roas=dv(n.rev,n.spend), cac=(n.sales>0&&n.spend>0)?dv(n.spend,n.sales):null, tag=actTag(n,medRoas);
  var cpm=n.impr>0?dv(n.spend,n.impr)*1000:null, ctr=n.impr>0?dv(n.clicks,n.impr)*100:null, cpc=n.clicks>0?dv(n.spend,n.clicks):null;
  return '<td class="num">'+money0(n.spend)+'</td>'
    +'<td class="num">'+(cpm!=null?money(cpm):'—')+'</td>'
    +'<td class="num">'+(ctr!=null?pct(ctr):'—')+'</td>'
    +'<td class="num">'+(cpc!=null?money(cpc):'—')+'</td>'
    +'<td class="num">'+intf(n.checkout)+'</td>'
    +'<td class="num">'+intf(n.sales)+'</td>'
    +'<td class="num">'+(cac!=null?'<span class="cac-pill '+cacClass(cac,medCac)+'">'+money0(cac)+'</span>':'—')+'</td>'
    +'<td class="num">'+money0(n.rev)+'</td>'
    +'<td class="num">'+(n.spend>0?'<span class="roas-pill '+roasClass(roas)+'">'+roasf(roas)+'</span>':'—')+'</td>'
    +'<td class="num"><span class="act '+tag.c+'">'+tag.t+'</span></td>'; }
function treeRow(n,lvl,key,hasKids,medR,medC){
  var caret=hasKids?'<span class="caret'+(expanded[key]?' open':'')+'">▶</span>':'<span class="caret" style="opacity:.2">•</span>';
  return '<tr class="lvl'+lvl+(hasKids?' parent':'')+'" data-key="'+encodeURIComponent(key)+'"><td><span class="name" title="'+esc(n.full||n.name)+'">'+caret+' '+esc(n.name)+'</span></td>'+metricsCells(n,medR,medC)+'</tr>';
}
var treeSort={key:'rev',rev:false};
var ACT_RANK={'Acelerar':0,'Manter':1,'Revisar':2,'Pausar':3,'s/ gasto':4,'Dado insuf.':5};
var TREE_COLS=[{k:'name',l:'Campanha › Conjunto › Anúncio'},{k:'spend',l:'Gasto'},{k:'cpm',l:'CPM'},{k:'ctr',l:'CTR'},{k:'cpc',l:'CPC'},{k:'checkout',l:'Chk'},{k:'sales',l:'Vendas'},{k:'cac',l:'CPA'},{k:'rev',l:'Faturamento'},{k:'roas',l:'ROAS'},{k:'act',l:'Ação'}];
function sortValOf(key,n,medR){
  if(key==='spend') return -(n.spend||0);
  if(key==='checkout') return -(n.checkout||0);
  if(key==='sales') return -(n.sales||0);
  if(key==='rev')   return -(n.rev||0);
  if(key==='cpm')   return n.impr>0?dv(n.spend,n.impr)*1000:Infinity;
  if(key==='ctr')   return n.impr>0?-dv(n.clicks,n.impr):Infinity;
  if(key==='cpc')   return n.clicks>0?dv(n.spend,n.clicks):Infinity;
  if(key==='cac')   return (n.sales>0&&n.spend>0)?dv(n.spend,n.sales):Infinity;
  if(key==='roas')  return n.spend>0?-dv(n.rev,n.spend):Infinity;
  if(key==='act'){ var r=ACT_RANK[actTag(n,medR).t]; return r==null?9:r; }
  return 0;
}
function renderTree(rng){
  var ss=treeSort;
  var rows=META._grain.filter(function(r){return inRange(r.date,rng);});
  var camps=buildTree(rows);
  var leafR=[],leafC=[]; Object.keys(camps).forEach(function(cK){ if(cK==='SEM_RASTREIO')return; var c=camps[cK]; Object.keys(c.kids).forEach(function(sK){ var sN=c.kids[sK]; Object.keys(sN.kids).forEach(function(aK){ var an=sN.kids[aK]; if(an.spend>0&&an.sales>0){leafR.push(dv(an.rev,an.spend));leafC.push(dv(an.spend,an.sales));} }); }); });
  var medR=median(leafR), medC=median(leafC);
  function cmp(a,b){
    if(ss.key==='name'){ var rn=String(a.name).localeCompare(String(b.name),'pt',{numeric:true}); return ss.rev?-rn:rn; }
    var va=sortValOf(ss.key,a,medR), vb=sortValOf(ss.key,b,medR);
    var na=!isFinite(va), nb=!isFinite(vb);
    if(na&&nb) return (b.rev||0)-(a.rev||0);
    if(na) return 1; if(nb) return -1;
    var r=va-vb; if(r===0){ r=(b.rev||0)-(a.rev||0); }
    return ss.rev?-r:r;
  }
  function skeys(obj){ return Object.keys(obj).sort(function(x,y){ return cmp(obj[x],obj[y]); }); }
  var order=skeys(camps);
  if(!treeInit){ order.slice(0,4).forEach(function(cK){ expanded['c:'+cK]=true; }); treeInit=true; }
  var head='<thead><tr>'+TREE_COLS.map(function(c){ var on=ss.key===c.k;
    return '<th class="sortable'+(on?' sorton':'')+'" data-col="'+c.k+'">'+c.l+(on?' <span class="sarr">'+(ss.rev?'▲':'▼')+'</span>':'')+'</th>'; }).join('')+'</tr></thead>';
  var out=[];
  order.forEach(function(cK){ var c=camps[cK],cKey='c:'+cK,cHas=Object.keys(c.kids).length>0; out.push(treeRow(c,0,cKey,cHas,medR,medC));
    if(expanded[cKey]){ skeys(c.kids).forEach(function(sK){ var sN=c.kids[sK],sKey=cKey+'|s:'+sK,sHas=Object.keys(sN.kids).length>0; out.push(treeRow(sN,1,sKey,sHas,medR,medC));
      if(expanded[sKey]){ skeys(sN.kids).forEach(function(aK){ out.push(treeRow(sN.kids[aK],2,sKey+'|a:'+aK,false,medR,medC)); }); } }); } });
  if(!out.length) out.push('<tr><td colspan="11" class="empty">Sem dados no período.</td></tr>');
  var tEl=el('m-tree'); tEl.innerHTML=head+'<tbody>'+out.join('')+'</tbody>';
  el('m-treeLegend').innerHTML='<span><span class="act act-acel">Acelerar</span> ROAS ≥ 1,2× a mediana</span><span><span class="act act-rev">Revisar</span> ROAS ≤ 0,6×</span><span><span class="act act-pause">Pausar</span> gastou e não vendeu</span><span style="color:var(--muted2)">clique num cabeçalho p/ ordenar (melhor→pior); clique de novo p/ inverter</span>';
  Array.prototype.forEach.call(tEl.querySelectorAll('th.sortable'),function(th){
    th.addEventListener('click',function(){ var k=th.getAttribute('data-col'); var s=treeSort;
      if(s.key===k){ s.rev=!s.rev; } else { s.key=k; s.rev=false; } renderTree(rangeFor(period)); }); });
  Array.prototype.forEach.call(tEl.querySelectorAll('tr.parent'),function(tr){
    tr.addEventListener('click',function(){ var k=decodeURIComponent(tr.getAttribute('data-key')); expanded[k]=!expanded[k]; renderTree(rangeFor(period)); }); });
}

/* =================== INSIGHTS =================== */
function aggBy(rows,keyf){ var m={}; rows.forEach(function(r){ var k=keyf(r); if(k==null)return; var n=m[k]||(m[k]={key:k,spend:0,sales:0,rev:0,clicks:0}); n.spend+=r.spend||0;n.sales+=r.sales||0;n.rev+=r.rev||0;n.clicks+=r.clicks||0; }); return Object.keys(m).map(function(k){return m[k];}); }
function insCard(kind,icon,tag,title,desc){ return '<div class="ins '+kind+'"><div class="ic">'+icon+'</div><div><div class="it">'+title+'</div><div class="id">'+desc+'</div><span class="tag">'+tag+'</span></div></div>'; }
function renderInsights(rng){
  var rows=META._grain.filter(function(r){return inRange(r.date,rng);});
  var a=aggMeta(rng), accRoas=dv(a.rev,a.spend), out=[];
  var camps=aggBy(rows,function(r){return r.campaign==='SEM_RASTREIO'?null:r.campaign;}).filter(function(n){return n.spend>0;});
  var ads=aggBy(rows,function(r){return (r.ad==='SEM_RASTREIO'||r.campaign==='SEM_RASTREIO')?null:r.ad+' ⟨'+r.campaign+'⟩';}).filter(function(n){return n.spend>0;});
  function rz(n){return dv(n.rev,n.spend);}
  function shortAd(k){ return k.split(' ⟨')[0]; }
  var accel=camps.filter(function(n){return n.sales>=2 && rz(n)>=Math.max(1, accRoas*1.1);}).sort(function(x,y){return rz(y)-rz(x);});
  accel.slice(0,2).forEach(function(n){ out.push(insCard('acel','🚀','Escalar',esc(n.key.length>52?n.key.slice(0,52)+'…':n.key),
    'ROAS <b>'+roasf(rz(n))+'</b> · <b>'+intf(n.sales)+'</b> vendas · CPA <b>'+money0(dv(n.spend,n.sales))+'</b> · gasto '+money0(n.spend)+'. Tem espaço p/ aumentar orçamento.')); });
  var goodAds=ads.filter(function(n){return n.sales>=2;}).sort(function(x,y){return rz(y)-rz(x);});
  if(goodAds.length){ var g=goodAds[0]; if(rz(g)>=accRoas*1.05) out.push(insCard('acel','🎯','Criativo campeão',esc(shortAd(g.key)),
    'Melhor ROAS entre os anúncios: <b>'+roasf(rz(g))+'</b> · '+intf(g.sales)+' vendas · CPA '+money0(dv(g.spend,g.sales))+'. Vale duplicar em novos conjuntos/públicos.')); }
  var noSale=camps.filter(function(n){return n.sales===0 && n.spend>=(a.spend*0.02);}).sort(function(x,y){return y.spend-x.spend;});
  noSale.slice(0,2).forEach(function(n){ out.push(insCard('pause','⛔','Pausar',esc(n.key.length>52?n.key.slice(0,52)+'…':n.key),
    'Gastou <b>'+money0(n.spend)+'</b> e <b>não gerou venda</b> no período. Candidata a pausa imediata.')); });
  var bleed=camps.filter(function(n){return n.sales>0 && rz(n)<=accRoas*0.6 && n.spend>=(a.spend*0.03);}).sort(function(x,y){return (x.rev-x.spend)-(y.rev-y.spend);});
  bleed.slice(0,2).forEach(function(n){ out.push(insCard('pause','⚠️','Revisar',esc(n.key.length>52?n.key.slice(0,52)+'…':n.key),
    'ROAS <b>'+roasf(rz(n))+'</b> (abaixo da média '+roasf(accRoas)+') · gasto '+money0(n.spend)+' p/ '+money0(n.rev)+'. Reveja criativo/público ou corte.')); });
  out.push(insCard('info','📊','Panorama do período',
    accRoas>=1?'No lucro (ROAS '+roasf(accRoas)+')':'Break-even em ROAS 1,00 — falta '+pct(Math.max(0,(1-accRoas))*100)+' p/ empatar',
    '<b>'+intf(a.sales)+'</b> vendas · faturamento <b>'+money0(a.rev)+'</b> · investimento '+money0(a.spend)+' · CPA médio '+(a.sales?money0(dv(a.spend,a.sales)):'—')+' · ticket '+(a.sales?money(dv(a.rev,a.sales)):'—')+'.'));
  if(!out.length) out.push('<div class="empty">Sem dados suficientes no período p/ gerar insights.</div>');
  el('m-insights').innerHTML=out.join('');
}

/* =================== VENDAS (histórico) =================== */
function aggVen(rng){ var o={fbS:0,fbR:0,orgS:0,orgR:0};
  VEN.daily.forEach(function(d){ if(!inRange(d.date,rng))return; o.fbS+=d.fbS||0;o.fbR+=d.fbR||0;o.orgS+=d.orgS||0;o.orgR+=d.orgR||0; }); return o; }
function qcard(cls,lab,val,sub){ return '<div class="qcard'+(cls?' '+cls:'')+'"><div class="q-l">'+lab+'</div><div class="q-v">'+val+'</div>'+(sub?'<div class="q-s">'+sub+'</div>':'')+'</div>'; }
function renderVChart(rng){
  var days=VEN.daily.filter(function(d){return isDate(d.date)&&inRange(d.date,rng);}).sort(function(a,b){return a.date.localeCompare(b.date);});
  var W=1120,H=230,pl=34,pr=16,pt=12,pb=24,pw=W-pl-pr,ph=H-pt-pb,base=pt+ph;
  var maxV=Math.max.apply(null,days.map(function(d){return (d.fbS||0)+(d.orgS||0);}).concat([1]));
  var n=days.length||1,gw=pw/n,bw=Math.max(2,Math.min(22,gw*0.6));
  var s='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
  [0,0.5,1].forEach(function(f){ var y=pt+ph*(1-f); s+='<line x1="'+pl+'" y1="'+y+'" x2="'+(W-pr)+'" y2="'+y+'" stroke="#16281f" stroke-dasharray="2 3"/>';
    s+='<text x="'+(pl-4)+'" y="'+(y+3)+'" text-anchor="end" fill="#557568" font-size="9">'+Math.round(maxV*f)+'</text>'; });
  days.forEach(function(d,i){ var xc=pl+gw*i+gw/2, tot=(d.fbS||0)+(d.orgS||0); if(tot<=0)return;
    var fbh=ph*dv(d.fbS,maxV), orh=ph*dv(d.orgS,maxV);
    s+='<rect x="'+(xc-bw/2).toFixed(1)+'" y="'+(base-fbh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+fbh.toFixed(1)+'" rx="1.5" fill="rgba(40,215,106,.75)"/>';
    s+='<rect x="'+(xc-bw/2).toFixed(1)+'" y="'+(base-fbh-orh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+orh.toFixed(1)+'" rx="1.5" fill="rgba(242,236,18,.7)"/>'; });
  xticks(days).forEach(function(i){ var xc=pl+gw*i+gw/2; s+='<text x="'+xc.toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" fill="#557568" font-size="9">'+fmtBR(days[i].date)+'</text>'; });
  s+=hitRects(days,pl,gw,pt,ph)+'</svg>';
  el('v-chart').innerHTML='<div class="chart">'+s+'</div><div class="chart-legend"><span><span class="dot" style="background:rgba(40,215,106,.8)"></span>Tráfego pago (Meta)</span><span><span class="dot" style="background:rgba(242,236,18,.75)"></span>Orgânico</span></div>';
  bindHits('v-chart',days,function(d){ var tot=(d.fbS||0)+(d.orgS||0), rev=(d.fbR||0)+(d.orgR||0); return '<div class="tt-d">'+fmtBR(d.date)+'</div><div class="tt-r"><span>Total</span><b>'+intf(tot)+' vendas</b></div><div class="tt-r"><span style="color:'+COL.grn2+'">Pago</span><b>'+intf(d.fbS)+'</b></div><div class="tt-r"><span style="color:'+COL.yel2+'">Orgânico</span><b>'+intf(d.orgS)+'</b></div><div class="tt-sub">Faturamento '+money0(rev)+'</div>'; });
}
function renderVendas(rng){
  var a=aggVen(rng);
  var sales=a.fbS+a.orgS, rev=a.fbR+a.orgR, ticket=dv(rev,sales);
  var fbShare=dv(a.fbS,sales)*100;
  el('v-quad').innerHTML=
    qcard('big','Total de Vendas',intf(sales),'produto <b>DNA do Trader</b> · pagas')
    +qcard('','Faturamento',money0(rev),'líquido · ticket médio <b>'+(sales?money(ticket):'—')+'</b>')
    +qcard('gold','Tráfego Pago (Meta)',intf(a.fbS),pct(fbShare)+' das vendas · <b>'+money0(a.fbR)+'</b>')
    +qcard('','Orgânico',intf(a.orgS),pct(100-fbShare)+' das vendas · <b>'+money0(a.orgR)+'</b>');
  // split bars
  function splitBar(title,vf,vo){ var t=vf+vo; if(t<=0)t=1; var wf=vf/t*100, wo=vo/t*100;
    return '<div style="font-size:11.5px;color:var(--muted);margin:2px 0 3px">'+title+'</div><div class="split">'
      +(wf>0?'<span style="width:'+wf.toFixed(1)+'%;background:'+COL.grn+'" title="Pago">'+(wf>10?nf0.format(Math.round(wf))+'%':'')+'</span>':'')
      +(wo>0?'<span style="width:'+wo.toFixed(1)+'%;background:'+COL.yel+'" title="Orgânico">'+(wo>10?nf0.format(Math.round(wo))+'%':'')+'</span>':'')+'</div>'; }
  el('v-split').innerHTML=splitBar('Vendas',a.fbS,a.orgS)+splitBar('Faturamento',a.fbR,a.orgR)
    +'<div class="split-leg"><span><span class="dot" style="background:'+COL.grn+'"></span>Tráfego pago (Meta)</span><span><span class="dot" style="background:'+COL.yel+'"></span>Orgânico</span></div>';
  // comparativo
  function row(name,dot,vs,vr){ var tk=dv(vr,vs), sh=dv(vs,sales)*100;
    return '<tr><td><span class="srcname"><span class="sd" style="background:'+dot+'"></span>'+name+'</span></td>'
      +'<td class="num">'+intf(vs)+'</td><td class="num">'+money0(vr)+'</td><td class="num">'+(vs?money(tk):'—')+'</td><td class="num">'+pct(sh)+'</td></tr>'; }
  var totRow='<tr><td>Total</td><td class="num">'+intf(sales)+'</td><td class="num">'+money0(rev)+'</td><td class="num">'+(sales?money(ticket):'—')+'</td><td class="num">100%</td></tr>';
  el('v-cmp').innerHTML='<thead><tr><th>Origem</th><th>Vendas</th><th>Faturamento</th><th>Ticket</th><th>% vendas</th></tr></thead><tbody>'
    +row('Tráfego pago (Meta)',COL.grn,a.fbS,a.fbR)+row('Orgânico / direto',COL.yel,a.orgS,a.orgR)+'</tbody><tfoot>'+totRow+'</tfoot>';
  renderVChart(rng);
  // daily table
  var rows=VEN.daily.filter(function(d){return isDate(d.date)&&inRange(d.date,rng);}).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var head='<thead><tr><th>Dia</th><th>Vendas</th><th>Faturamento</th><th>Pago</th><th>Fat. Pago</th><th>Orgânico</th><th>Fat. Org.</th></tr></thead>';
  var body=rows.map(function(r){ var ts=(r.fbS||0)+(r.orgS||0), trv=(r.fbR||0)+(r.orgR||0);
    return '<tr><td>'+fmtBR(r.date)+'</td><td class="num">'+intf(ts)+'</td><td class="num">'+money0(trv)+'</td>'
      +'<td class="num">'+intf(r.fbS)+'</td><td class="num">'+money0(r.fbR)+'</td>'
      +'<td class="num">'+intf(r.orgS)+'</td><td class="num">'+money0(r.orgR)+'</td></tr>'; }).join('');
  if(!rows.length)body='<tr><td colspan="7" class="empty">Sem dados no período.</td></tr>';
  var foot='<tfoot><tr><td>Total</td><td class="num">'+intf(sales)+'</td><td class="num">'+money0(rev)+'</td><td class="num">'+intf(a.fbS)+'</td><td class="num">'+money0(a.fbR)+'</td><td class="num">'+intf(a.orgS)+'</td><td class="num">'+money0(a.orgR)+'</td></tr></tfoot>';
  el('v-daily').innerHTML=head+'<tbody>'+body+'</tbody>'+foot;
  // rankings (histórico completo)
  function ranking(list,total){ var totR=0; list.forEach(function(x){totR+=x.r;}); if(totR<=0)totR=1;
    var head='<thead><tr><th>'+(total?'Anúncio':'Campanha')+'</th><th>Vendas</th><th>Faturamento</th><th>Ticket</th><th>%</th></tr></thead>';
    var body=list.slice(0,15).map(function(x){ var nm=x.n==='SEM_RASTREIO'?'— sem rastreio —':x.n;
      return '<tr><td><span class="name" title="'+esc(nm)+'" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:bottom">'+esc(nm)+'</span></td>'
        +'<td class="num">'+intf(x.s)+'</td><td class="num">'+money0(x.r)+'</td><td class="num">'+(x.s?money(dv(x.r,x.s)):'—')+'</td>'
        +'<td class="num">'+pct(dv(x.r,totR)*100)+'</td></tr>'; }).join('');
    if(!list.length)body='<tr><td colspan="5" class="empty">Sem vendas de tráfego pago.</td></tr>';
    return head+'<tbody>'+body+'</tbody>'; }
  el('v-camp').innerHTML=ranking(VEN.byCamp,false);
  el('v-ad').innerHTML=ranking(VEN.byAd,true);
}

/* =================== ORQUESTRAÇÃO =================== */
function renderMeta(rng,prng){
  var a=aggMeta(rng), p=aggMeta(prng), days=metaDays(rng);
  renderKpi(a,p); renderFunnel(a,p); renderChartSales(days); renderChartRoas(days);
  renderInsights(rng); renderDaily(rng); renderTree(rng);
}
function renderAll(){ var rng=rangeFor(period), prng=prevRange(rng);
  renderMeta(rng,prng); renderVendas(rng); }

/* período UI */
function periodsHTML(){ return PRESETS.map(function(p){return '<button data-k="'+p.k+'" class="pbtn">'+p.label+'</button>';}).join('')
  +'<span class="daterange" id="daterange"><span class="dr-l">De</span> <input type="date" id="dtDe" min="'+minDate+'" max="'+maxDate+'"> <span class="dr-l">até</span> <input type="date" id="dtAte" min="'+minDate+'" max="'+maxDate+'"></span>'; }
function syncPeriodUI(){ var rng=rangeFor(period);
  Array.prototype.forEach.call(el('periods').querySelectorAll('.pbtn'),function(b){ b.classList.toggle('on',period===b.getAttribute('data-k')); });
  var dr=el('daterange'); if(dr)dr.classList.toggle('on',period==='custom');
  var de=el('dtDe'),at=el('dtAte'); if(de&&at){ de.value=rng[0]; at.value=rng[1]; } }
function initPeriods(){ el('periods').innerHTML=periodsHTML();
  Array.prototype.forEach.call(el('periods').querySelectorAll('.pbtn'),function(b){ b.addEventListener('click',function(){ period=b.getAttribute('data-k'); customRange=null; syncPeriodUI(); renderAll(); }); });
  var de=el('dtDe'),at=el('dtAte');
  function onDate(){ var s=de.value,e=at.value; if(!s||!e)return; if(s>e){var t=s;s=e;e=t;} if(s<minDate)s=minDate; if(e>maxDate)e=maxDate; customRange=[s,e]; period='custom'; syncPeriodUI(); renderAll(); }
  de.addEventListener('change',onDate); at.addEventListener('change',onDate); syncPeriodUI(); }

var TABS=['meta','vendas'];
function activateTab(id){ Array.prototype.forEach.call(document.querySelectorAll('.tab'),function(x){x.classList.toggle('active',x.getAttribute('data-tab')===id);});
  TABS.forEach(function(k){ el('tab-'+k).classList.toggle('hidden',k!==id); }); }
function initTabs(){ Array.prototype.forEach.call(document.querySelectorAll('.tab'),function(t){ t.addEventListener('click',function(){ var id=t.getAttribute('data-tab'); activateTab(id); if(history.replaceState)history.replaceState(null,'','#'+id); }); });
  var h=(location.hash||'').replace('#',''); if(TABS.indexOf(h)>=0)activateTab(h);
  window.addEventListener('hashchange',function(){ var k=(location.hash||'').replace('#',''); if(TABS.indexOf(k)>=0)activateTab(k); }); }
function initCoverage(){ el('updated').textContent=D.generatedAtBR||'—'; el('taxf').textContent=(D.taxMultiplier||1.1385).toFixed(4).replace('.',',');
  var tm=META.totals||{}, vt=VEN.totals||{};
  var totVen=(vt.fbSales||0)+(vt.orgSales||0);
  var win = (META.dateMin&&META.dateMax) ? (fmtBR(META.dateMin)+' → '+fmtBR(META.dateMax)) : '—';
  el('coverage').innerHTML='<b>Funil cruzado Meta × Vendas</b> na janela das queries ('+win+', início do rastreio): '
    +'<b>'+intf(tm.sales||0)+'</b> venda(s) de tráfego pago cruzada(s) com o gasto. '
    +'A aba <span class="cy">Vendas</span> traz o <b>histórico completo</b>: '+intf(totVen)+' vendas do produto DNA ('+intf(vt.fbSales||0)+' tráfego pago · '+intf(vt.orgSales||0)+' orgânico), de '+fmtBR(VEN.dateMin||'')+' a '+fmtBR(VEN.dateMax||'')+'.'; }

if(!META.daily.length && !VEN.daily.length){ el('coverage').innerHTML='<b>Sem dados.</b> Rode o build.ps1 para gerar o data.js.'; }
else { initCoverage(); initPeriods(); initTabs(); renderAll(); }
})();
