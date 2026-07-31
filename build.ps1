# =====================================================================
#  DNA do Trader de Banco - Dashboard de VENDAS (Sala ao Vivo)
#  data engine. Baixa 2 planilhas Google (CSV export):
#    - Vendas (aba Hotmart): produto "Sala Educacional DNA do Trader"
#    - Queries Meta Ads (gasto/impr/cliques/LPV/checkouts por dia/anuncio)
#  Filtra o produto, separa a venda pela origem (utm_source Facebook-Ads =
#  trafego pago vs. organico) e CRUZA com o gasto de midia p/ calcular
#  ROAS, CPA/CAC, CTR, CPM, CPC, funil e otimizacao.
#  IMPORTANTE: as queries so comecaram em 28/07 -> o funil cruzado (ROAS
#  etc.) so cobre a janela das queries. A aba Vendas mostra o historico
#  completo (todas as vendas, inclusive antes do rastreio).
#  Imposto (+13,85%) em TODO gasto do Meta. Somente leitura.
#  ASCII-only de proposito (PS5.1 le .ps1 como ANSI; acentos so no front).
# =====================================================================
param([ValidateSet('all')][string]$Mode='all')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$BR = [Globalization.CultureInfo]::GetCultureInfo('pt-BR')
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# ---- Fontes (somente leitura) --------------------------------------
$VENDAS_ID = '1_Er3ILbAY4ntIWL6Dxw_bvqDSqDfl36yAquz_RkbBOE'; $VENDAS_GID = '1313255428'  # aba Hotmart
$META_ID   = '1aLQTykjrMGbU_I5rxRlggIfPixFKovi3DCz_mUgUECY'; $META_GID   = '0'            # queries Meta
$TAX = 1.1385           # imposto Meta (+13,85%) aplicado em TODO gasto
$PROD_FRAG = 'dna do trader'   # produto (deaccent contem) = venda direta principal
$SENT = 'SEM_RASTREIO'

function Get-Sheet($id,$gid,$out){
  $url = "https://docs.google.com/spreadsheets/d/$id/gviz/tq?tqx=out:csv&gid=$gid"
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  (New-Object System.Net.WebClient).DownloadFile($url,$out)
  if((Get-Item $out).Length -lt 20){ throw "Download muito pequeno: $out" }
}
Add-Type -AssemblyName Microsoft.VisualBasic
function Read-Csv($path){
  $rows = New-Object System.Collections.Generic.List[object]
  $p = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($path,[System.Text.Encoding]::UTF8)
  $p.TextFieldType='Delimited'; $p.SetDelimiters(','); $p.HasFieldsEnclosedInQuotes=$true
  while(-not $p.EndOfData){ try { $rows.Add($p.ReadFields()) } catch { } }
  $p.Close(); return $rows
}
function Norm($s){ if($null -eq $s){return ''}; return ($s -replace [char]0x200b,'').Trim() }
function MoneyBR($s){ $s=Norm $s; if($s -eq ''){return 0.0}
  $s = $s -replace '[R$\s]',''
  if($s -match ','){ $s = ($s -replace '\.','') -replace ',','.' }
  if($s -notmatch '^-?\d'){ return 0.0 }; return [double]$s }
function ToInt($s){ $s=Norm $s; if($s -eq ''){return 0}; $v=($s -replace '\.','' -replace ',','.'); if($v -notmatch '^-?\d'){return 0}; return [int][double]$v }
function Deaccent($s){ if($null -eq $s){return ''}; $s=$s.Normalize([Text.NormalizationForm]::FormD); $sb=New-Object Text.StringBuilder
  foreach($c in $s.ToCharArray()){ if([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark){ [void]$sb.Append($c) } }
  return $sb.ToString().ToLower().Trim() }
function HdrLike($hdr,$frag){ for($i=0;$i -lt $hdr.Count;$i++){ if((Deaccent $hdr[$i]) -like $frag){ return $i } }; return -1 }
# vendas: "27-11-2017 09:49" (dd-mm-yyyy) OU "2026-07-25" OU "25/06/2026" -> yyyy-mm-dd
function SaleDate($s){ $s=Norm $s
  if($s -match '^(\d{4})-(\d{2})-(\d{2})'){ return ('{0}-{1}-{2}' -f $Matches[1],$Matches[2],$Matches[3]) }
  if($s -match '^(\d{1,2})-(\d{1,2})-(\d{4})'){ return ('{0}-{1:d2}-{2:d2}' -f $Matches[3],[int]$Matches[2],[int]$Matches[1]) }
  if($s -match '^(\d{1,2})/(\d{1,2})/(\d{4})'){ return ('{0}-{1:d2}-{2:d2}' -f $Matches[3],[int]$Matches[2],[int]$Matches[1]) }
  return '' }
# queries Day ja vem yyyy-mm-dd (aceita dd/mm/yyyy por seguranca)
function QDay($s){ $s=Norm $s; if($s -match '^\d{4}-\d{2}-\d{2}'){ return $s.Substring(0,10) }
  if($s -match '^(\d{1,2})/(\d{1,2})/(\d{4})'){ return ('{0}-{1:d2}-{2:d2}' -f $Matches[3],[int]$Matches[2],[int]$Matches[1]) }; return '' }
# valores de utm com macro nao-resolvida ({{...}}) ou erro de planilha (#REF!/#N/A) = invalido
function CleanUtm($s){ $s=Norm $s; if($s -eq '' -or $s -like '*{{*' -or $s -like '#*'){ return '' }; return $s }
# coalesce: prefere o 1o indice (conjunto resolvido), cai no 2o (UTM cru); ja limpa
function Coa($r,$iA,$iB){
  $a=''; if($iA -ge 0 -and $r.Count -gt $iA){ $a=CleanUtm $r[$iA] }
  if($a -ne ''){ return $a }
  $b=''; if($iB -ge 0 -and $r.Count -gt $iB){ $b=CleanUtm $r[$iB] }
  return $b }

# =====================================================================
#  1) VENDAS: filtra produto DNA + status pago; separa FB x organico
# =====================================================================
Write-Host "Baixando planilhas..."
$vCsv=Join-Path $dataDir 'vendas.csv'; $mCsv=Join-Path $dataDir 'meta.csv'
Get-Sheet $VENDAS_ID $VENDAS_GID $vCsv
Get-Sheet $META_ID   $META_GID   $mCsv

$v = Read-Csv $vCsv; $vh=$v[0]; $vd=$v[1..($v.Count-1)]
$V_DATE=HdrLike $vh 'data'; $V_PROD=HdrLike $vh 'produto'; $V_STAT=HdrLike $vh 'status'; $V_FAT=HdrLike $vh 'faturamento'
# A planilha tem DOIS conjuntos de UTM: o cru "UTM Source/Medium/Campaign/Content" (as vezes
# vazio nas vendas recentes) e o RESOLVIDO "Source/Campaign/Medium/content" (mais completo).
# Prefere o resolvido, cai no cru. HdrLike exato ('source') pega "Source"; 'utm source' pega o cru.
$V_SRC =HdrLike $vh 'utm source'; $V_MED =HdrLike $vh 'utm medium'; $V_CAMP =HdrLike $vh 'utm campaign'; $V_CONT =HdrLike $vh 'utm content'
$V_SRC2=HdrLike $vh 'source';     $V_MED2=HdrLike $vh 'medium';     $V_CAMP2=HdrLike $vh 'campaign';     $V_CONT2=HdrLike $vh 'content'
if($V_SRC2 -lt 0){$V_SRC2=$V_SRC}; if($V_MED2 -lt 0){$V_MED2=$V_MED}; if($V_CAMP2 -lt 0){$V_CAMP2=$V_CAMP}; if($V_CONT2 -lt 0){$V_CONT2=$V_CONT}
foreach($pair in @(@('Data',$V_DATE),@('Produto',$V_PROD),@('Status',$V_STAT),@('Faturamento',$V_FAT),@('Source',$V_SRC2),@('Campaign',$V_CAMP2))){ if($pair[1] -lt 0){ throw ("Vendas: coluna nao encontrada: "+$pair[0]) } }

# regra de venda: SO status APPROVED conta (usuario 31/07 pediu p/ IGNORAR COMPLETED)
function IsPaid($st){ $s=Deaccent $st; return ($s -eq 'approved') }

$fbSales = New-Object System.Collections.Generic.List[object]   # trafego pago (Facebook-Ads)
$allDaily=@{}                                                   # historico completo por dia x origem
$nTest=0; $nUnpaid=0; $nOther=0
function _ad($d){ if(-not $allDaily.ContainsKey($d)){ $allDaily[$d]=[pscustomobject]@{date=$d;fbSales=0;fbRev=0.0;orgSales=0;orgRev=0.0} }; return $allDaily[$d] }

foreach($r in $vd){
  if($r.Count -le $V_FAT){ continue }
  $prod = Norm $r[$V_PROD]
  if((Deaccent $prod) -notlike ("*"+$PROD_FRAG+"*")){ $nOther++; continue }   # so o produto DNA (exclui teste/postback)
  if(-not (IsPaid $r[$V_STAT])){ $nUnpaid++; continue }
  $d = SaleDate $r[$V_DATE]; if($d -eq ''){ continue }
  $rev = MoneyBR $r[$V_FAT]
  $src = Deaccent (Coa $r $V_SRC2 $V_SRC)
  $isFb = ($src -eq 'facebook-ads')
  $o=_ad $d
  if($isFb){
    $o.fbSales++; $o.fbRev+=$rev
    $fbSales.Add([pscustomobject]@{ date=$d; rev=$rev
      camp=(Coa $r $V_CAMP2 $V_CAMP); adset=(Coa $r $V_MED2 $V_MED); ad=(Coa $r $V_CONT2 $V_CONT) })
  } else {
    $o.orgSales++; $o.orgRev+=$rev
  }
}
$allDailyArr=@($allDaily.Values | Sort-Object date)
Write-Host ("Vendas DNA pagas: FB={0}  organico={1}  (ignoradas: {2} nao-pagas, {3} outro produto)" -f `
  $fbSales.Count, (($allDailyArr|Measure-Object orgSales -Sum).Sum), $nUnpaid, $nOther)

# =====================================================================
#  2) QUERIES META: daily + grain (gasto c/ imposto, impr, cliques, lpv, checkout)
# =====================================================================
$m = Read-Csv $mCsv; $mh=$m[0]; $md=$m[1..($m.Count-1)]
$Q_DAY=HdrLike $mh 'day'; if($Q_DAY -lt 0){ $Q_DAY=HdrLike $mh 'date' }
$Q_CAMP=HdrLike $mh 'campaign name'; $Q_SET=HdrLike $mh 'ad set name'; $Q_AD=HdrLike $mh 'ad name'
$Q_SPEND=HdrLike $mh '*spent*'; if($Q_SPEND -lt 0){ $Q_SPEND=HdrLike $mh '*spend*' }
$Q_IMP=HdrLike $mh 'impressions'; $Q_CLK=HdrLike $mh '*link clicks*'; if($Q_CLK -lt 0){ $Q_CLK=HdrLike $mh 'clicks' }
$Q_LPV=HdrLike $mh '*landing page view*'; $Q_CHK=HdrLike $mh '*checkout*'
foreach($pair in @(@('Day',$Q_DAY),@('Campaign',$Q_CAMP),@('Ad Set',$Q_SET),@('Ad',$Q_AD),@('Spend',$Q_SPEND),@('Impressions',$Q_IMP))){ if($pair[1] -lt 0){ throw ("Query: coluna nao encontrada: "+$pair[0]) } }

# mapas de nome p/ atribuicao (deaccent -> nome real) + pares/triplas validas (co-localizacao)
# adToTriple/setToPair: "casa da campanha" de cada criativo nas queries. Usado como FALLBACK
# quando a venda vem taggeada numa campanha que nao esta nas queries (mesmo AD17, outra data
# no nome) -> atribui pelo criativo (anuncio) ou pelo conjunto, apontando pro gasto que existe.
$campDe=@{}; $setDe=@{}; $adDe=@{}; $qPair=@{}; $qTriple=@{}; $adToTriple=@{}; $setToPair=@{}
$qDaysSet=@{}
foreach($r in $md){ if($r.Count -le $Q_AD){continue}
  $cn=Norm $r[$Q_CAMP]; $sn=Norm $r[$Q_SET]; $an=Norm $r[$Q_AD]
  if($cn -ne ''){ $k=Deaccent $cn; if(-not $campDe.ContainsKey($k)){$campDe[$k]=$cn} }
  if($sn -ne ''){ $k=Deaccent $sn; if(-not $setDe.ContainsKey($k)){$setDe[$k]=$sn} }
  if($an -ne ''){ $k=Deaccent $an; if(-not $adDe.ContainsKey($k)){$adDe[$k]=$an} }
  if($cn -ne '' -and $sn -ne ''){ $qPair["$cn`u$sn"]=$true; if($an -ne ''){ $qTriple["$cn`u$sn`u$an"]=$true } }
  if($an -ne '' -and $sn -ne '' -and $cn -ne ''){ $k=Deaccent $an; if(-not $adToTriple.ContainsKey($k)){ $adToTriple[$k]=@{camp=$cn;set=$sn;ad=$an} } }
  if($sn -ne '' -and $cn -ne ''){ $k=Deaccent $sn; if(-not $setToPair.ContainsKey($k)){ $setToPair[$k]=@{camp=$cn;set=$sn} } }
}

$daily=@{}; $grain=@{}
function _gd($d){ if(-not $daily.ContainsKey($d)){ $daily[$d]=[pscustomobject]@{date=$d;spendRaw=0.0;spend=0.0;impr=0;clicks=0;lpv=0;checkout=0;sales=0;rev=0.0} }; return $daily[$d] }
function _gg($k,$d,$c,$s,$a){ if(-not $grain.ContainsKey($k)){ $grain[$k]=[pscustomobject]@{date=$d;campaign=$c;adset=$s;ad=$a;spendRaw=0.0;spend=0.0;impr=0;clicks=0;lpv=0;checkout=0;sales=0;rev=0.0} }; return $grain[$k] }

foreach($r in $md){ if($r.Count -le $Q_AD){continue}
  $d=QDay $r[$Q_DAY]; if($d -notmatch '^\d{4}-\d{2}-\d{2}$'){continue}
  $qDaysSet[$d]=$true
  $spRaw=MoneyBR $r[$Q_SPEND]; $sp=$spRaw*$TAX; $im=ToInt $r[$Q_IMP]; $ck= if($Q_CLK -ge 0){ ToInt $r[$Q_CLK] } else { 0 }
  $lp= if($Q_LPV -ge 0){ ToInt $r[$Q_LPV] } else { 0 }
  $chk= if($Q_CHK -ge 0){ ToInt $r[$Q_CHK] } else { 0 }
  $cn=Norm $r[$Q_CAMP]; $sn=Norm $r[$Q_SET]; $an=Norm $r[$Q_AD]
  $o=_gd $d; $o.spendRaw+=$spRaw;$o.spend+=$sp;$o.impr+=$im;$o.clicks+=$ck;$o.lpv+=$lp;$o.checkout+=$chk
  $g=_gg "$d`u$cn`u$sn`u$an" $d $cn $sn $an; $g.spendRaw+=$spRaw;$g.spend+=$sp;$g.impr+=$im;$g.clicks+=$ck;$g.lpv+=$lp;$g.checkout+=$chk
}
$qDays=@($qDaysSet.Keys | Sort-Object)
$qMin= if($qDays.Count){ $qDays[0] } else { '' }
$qMax= if($qDays.Count){ $qDays[-1] } else { '' }

# =====================================================================
#  3) CRUZAMENTO: vendas FB dentro da janela das queries -> funil + grain
# =====================================================================
function MatchName($val,$deMap){ $vd=Deaccent $val; if($vd -eq ''){return ''}; if($deMap.ContainsKey($vd)){return $deMap[$vd]}; return '' }
$attr=0; $inWin=0
foreach($s in $fbSales){
  if($qMin -eq '' -or $s.date -lt $qMin -or $s.date -gt $qMax){ continue }   # cruza SO a janela das queries
  $inWin++
  $o=_gd $s.date; $o.sales++; $o.rev+=$s.rev
  $cName=MatchName $s.camp $campDe
  if($cName -ne ''){
    # campanha existe nas queries -> co-localizacao normal (campanha > conjunto > anuncio)
    $sName=MatchName $s.adset $setDe
    $aName=MatchName $s.ad $adDe
    if($sName -eq '' -or -not $qPair.ContainsKey("$cName`u$sName")){ $sName=$SENT; $aName=$SENT }
    elseif($aName -eq '' -or -not $qTriple.ContainsKey("$cName`u$sName`u$aName")){ $aName=$SENT }
    $attr++
  } else {
    # campanha NAO esta nas queries (ex.: mesmo AD17 numa campanha nao exportada) ->
    # fallback pelo CRIATIVO: casa o anuncio (ou o conjunto) na sua "casa" das queries
    $adk=Deaccent $s.ad; $setk=Deaccent $s.adset
    if($adk -ne '' -and $adToTriple.ContainsKey($adk)){ $t=$adToTriple[$adk]; $cName=$t.camp; $sName=$t.set; $aName=$t.ad; $attr++ }
    elseif($setk -ne '' -and $setToPair.ContainsKey($setk)){ $t=$setToPair[$setk]; $cName=$t.camp; $sName=$t.set; $aName=$SENT; $attr++ }
    else { $cName=$SENT; $sName=$SENT; $aName=$SENT }
  }
  $g=_gg "$($s.date)`u$cName`u$sName`u$aName" $s.date $cName $sName $aName; $g.sales++; $g.rev+=$s.rev
}

$dailyArr=@($daily.Values | Sort-Object date)
$grainArr=@($grain.Values | Where-Object { $_.spend -gt 0 -or $_.sales -gt 0 })
function _sum($arr,$p){ $x=($arr|Measure-Object $p -Sum).Sum; if($null -eq $x){return 0}; return $x }
$tot=[pscustomobject]@{
  spendRaw=(_sum $dailyArr 'spendRaw'); spend=(_sum $dailyArr 'spend'); impr=(_sum $dailyArr 'impr'); clicks=(_sum $dailyArr 'clicks')
  lpv=(_sum $dailyArr 'lpv'); checkout=(_sum $dailyArr 'checkout'); sales=(_sum $dailyArr 'sales'); rev=(_sum $dailyArr 'rev'); salesAttr=$attr }

# intern de nomes p/ enxugar o grain
$names=New-Object System.Collections.Generic.List[string]; $nameIdx=@{}
function _ni($nm){ if(-not $nameIdx.ContainsKey($nm)){ $nameIdx[$nm]=$names.Count; $names.Add($nm) }; return $nameIdx[$nm] }
$gOut=@()
foreach($g in $grainArr){
  $gOut += [pscustomobject]@{ d=$g.date; c=(_ni $g.campaign); s=(_ni $g.adset); a=(_ni $g.ad)
    sp=[math]::Round($g.spend,2); spr=[math]::Round($g.spendRaw,2); im=[int]$g.impr; ck=[int]$g.clicks; lp=[int]$g.lpv; chk=[int]$g.checkout; vn=[int]$g.sales; rv=[math]::Round($g.rev,2) }
}
$dOut=@()
foreach($o in $dailyArr){
  $dOut += [pscustomobject]@{ date=$o.date; spend=[math]::Round($o.spend,2); spendRaw=[math]::Round($o.spendRaw,2); impr=[int]$o.impr; clicks=[int]$o.clicks; lpv=[int]$o.lpv; checkout=[int]$o.checkout; sales=[int]$o.sales; rev=[math]::Round($o.rev,2) }
}

# =====================================================================
#  4) VENDAS (historico completo, todas as origens) p/ a aba Vendas
# =====================================================================
$salesDaily=@()
foreach($o in $allDailyArr){
  $salesDaily += [pscustomobject]@{ date=$o.date; fbS=[int]$o.fbSales; fbR=[math]::Round($o.fbRev,2); orgS=[int]$o.orgSales; orgR=[math]::Round($o.orgRev,2) }
}
# ranking por campanha e por anuncio (so trafego pago; atribuido por utm) - historico completo
$byCampAgg=@{}; $byAdAgg=@{}
foreach($s in $fbSales){
  $ck= if($s.camp -ne ''){ $s.camp } else { $SENT }
  if(-not $byCampAgg.ContainsKey($ck)){ $byCampAgg[$ck]=[pscustomobject]@{name=$ck;sales=0;rev=0.0} }
  $byCampAgg[$ck].sales++; $byCampAgg[$ck].rev+=$s.rev
  $ak= if($s.ad -ne ''){ $s.ad } else { $SENT }
  if(-not $byAdAgg.ContainsKey($ak)){ $byAdAgg[$ak]=[pscustomobject]@{name=$ak;sales=0;rev=0.0} }
  $byAdAgg[$ak].sales++; $byAdAgg[$ak].rev+=$s.rev
}
$byCamp=@(); foreach($x in ($byCampAgg.Values | Sort-Object -Property @{e='sales';Descending=$true})){ $byCamp += [pscustomobject]@{ n=$x.name; s=[int]$x.sales; r=[math]::Round($x.rev,2) } }
$byAd=@();   foreach($x in ($byAdAgg.Values   | Sort-Object -Property @{e='sales';Descending=$true})){ $byAd   += [pscustomobject]@{ n=$x.name; s=[int]$x.sales; r=[math]::Round($x.rev,2) } }

$vTotFbS=($allDailyArr|Measure-Object fbSales -Sum).Sum;  if($null -eq $vTotFbS){$vTotFbS=0}
$vTotFbR=($allDailyArr|Measure-Object fbRev -Sum).Sum;    if($null -eq $vTotFbR){$vTotFbR=0}
$vTotOrgS=($allDailyArr|Measure-Object orgSales -Sum).Sum; if($null -eq $vTotOrgS){$vTotOrgS=0}
$vTotOrgR=($allDailyArr|Measure-Object orgRev -Sum).Sum;   if($null -eq $vTotOrgR){$vTotOrgR=0}
$sMin= if($allDailyArr.Count){ $allDailyArr[0].date } else { '' }
$sMax= if($allDailyArr.Count){ $allDailyArr[-1].date } else { '' }

$vendas=[pscustomobject]@{
  daily=@($salesDaily); byCamp=@($byCamp); byAd=@($byAd)
  dateMin=$sMin; dateMax=$sMax
  totals=[pscustomobject]@{ fbSales=[int]$vTotFbS; fbRev=[math]::Round($vTotFbR,2); orgSales=[int]$vTotOrgS; orgRev=[math]::Round($vTotOrgR,2) }
}

$meta=[pscustomobject]@{
  dateMin=$qMin; dateMax=$qMax; salesInWindow=$inWin
  totals=$tot; names=@($names); daily=@($dOut); grain=@($gOut)
}

# =====================================================================
#  5) Emite data.js (window.DTB)
# =====================================================================
$nowIso=(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$nowBR=[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'E. South America Standard Time').ToString('dd/MM/yyyy HH:mm')
$utf8=[System.Text.UTF8Encoding]::new($false)
$payload=[pscustomobject]@{
  generatedAt=$nowIso; generatedAtBR=$nowBR; taxMultiplier=$TAX; product='DNA do Trader de Banco'
  meta=$meta; vendas=$vendas
}
$json=$payload | ConvertTo-Json -Depth 12 -Compress
[IO.File]::WriteAllText((Join-Path $root 'data.js'), ("window.DTB="+$json+";"), $utf8)

Write-Host ("OK  META (cruzado {0} -> {1})  dias={2} grain={3} vendas-janela={4} attrib={5}  gasto+imp=R$ {6}  fat=R$ {7}" -f `
  $qMin,$qMax,$meta.daily.Count,$meta.grain.Count,$tot.sales,$tot.salesAttr,($tot.spend.ToString('N2',$BR)),($tot.rev.ToString('N2',$BR)))
Write-Host ("OK  VENDAS (historico {0} -> {1})  FB={2} vendas / R$ {3}   organico={4} vendas / R$ {5}" -f `
  $sMin,$sMax,$vTotFbS,([double]$vTotFbR).ToString('N2',$BR),$vTotOrgS,([double]$vTotOrgR).ToString('N2',$BR))
