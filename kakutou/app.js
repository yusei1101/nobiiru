/* =====================================================================
   ペタ拳: 画面の流れ(タイトル → キャラ選択 → VS → 対戦 → 勝利画面)と、キャラ管理・編集。
   ゲームの中身(Battle/Fighter)や保存(store)・画像処理(cutout)には口を出さない。
   メニューは全部 キーボード(↑↓←→＋ENTER)でも マウス/タッチでも動く＝アーケードの手触り。
   ===================================================================== */
"use strict";
(function(){
addEventListener("error",e=>{ let d=document.getElementById("err"); if(!d){ d=document.createElement("div"); d.id="err";
  d.style.cssText="position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;white-space:pre-wrap"; document.body.appendChild(d);} d.textContent="ERR: "+(e.message||e); });

const $=(id)=>document.getElementById(id);
const C=KK.cutout, CH=KK.chars, ST=KK.store;
const prefs=ST.prefs();
const S={ user:[], sound: prefs.sound!==false, voiceMode: prefs.voiceMode||"babble", mode: prefs.mode||"cpu", diff: prefs.diff!=null?prefs.diff:1, stage: prefs.stage||"random",
  slots:[null,null], active:0, cursor:1, battle:null, attract:null, screen:"title" };

// ---------------- 共通 ----------------
const SCREENS=["title","help","phone","select","manage","editor","battle","pause","result"];
function show(id){
  const keepBattle = id==="pause"||id==="result";
  for(const s of SCREENS) $(s).classList.toggle("hidden", !(s===id || (keepBattle && s==="battle")));
  S.screen=id;
  $("backLink").classList.toggle("hidden", id!=="title" && id!=="manage" && id!=="editor");
  $("pauseBtn").classList.toggle("hidden", id!=="battle");
  $("ctrlBtn").classList.toggle("hidden", id!=="battle");
  KK.input.capture = (id==="battle");
  if(id==="title") startAttract(); else stopAttract();
}
let toastT=null;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),1800); }
function chips(el, items, cur, onPick){
  el.innerHTML="";
  for(const [val,label] of items){ const b=document.createElement("button"); b.className="chip"+(val===cur?" on":""); b.textContent=label;
    b.onclick=()=>{ for(const x of el.children) x.classList.remove("on"); b.classList.add("on"); blip(); onPick(val); }; el.appendChild(b); }
}
function blip(hi){ if(S.sound && window.Yokocho) Yokocho.audio.tone(hi?1320:880,0.05,"square",0.08); }
document.addEventListener("pointerdown",()=>{ if(window.Yokocho) Yokocho.audio.resume(); },{capture:true});
function allChars(){ return S.user.concat(CH.samples()); }
async function reload(){ S.user = await ST.all(); }
function imgEl(ch){ const im=new Image(); im.src=ch.image; im.alt=ch.name; im.draggable=false; return im; }
function statBars(st0){
  const st=CH.normalizeStats(st0);
  const rows=[["HP",st.hp],["ATK",st.atk],["DEF",st.def],["SPD",st.spd]];
  return rows.map(([n,v])=>`<div class="bar"><span>${n}</span><i>${[1,2,3,4,5].map(k=>`<b class="${k<=v?"on":""}"></b>`).join("")}</i></div>`).join("");
}

// メニュー(↑↓ か ←→ で えらんで ENTER)
class Menu{
  constructor(el){ this.el=el; this.i=0; this.refresh(); }
  refresh(){ this.items=[...this.el.querySelectorAll(".mi,.pbtn")].filter(b=>!b.disabled && !b.classList.contains("hidden"));
    this.items.forEach((b,i)=>{ b.onpointerenter=()=>this.set(i); }); this.set(Math.min(this.i,this.items.length-1)); }
  set(i){ const n=this.items.length; if(!n) return; this.i=(i+n)%n; this.items.forEach((b,k)=>b.classList.toggle("focus",k===this.i)); }
  move(d){ this.set(this.i+d); blip(); }
  ok(){ const b=this.items[this.i]; if(b){ blip(true); b.click(); } }
}

// ---------------- タイトル(裏でデモ対戦) ----------------
const titleMenu=new Menu($("titleMenu"));
async function startAttract(){
  if(S.attract) return;
  const list=allChars(); if(list.length<1) return;
  const i=Math.floor(Math.random()*list.length); let j=Math.floor(Math.random()*list.length); if(list.length>1) while(j===i) j=Math.floor(Math.random()*list.length);
  let as; try{ as=await Promise.all([CH.assets(list[i]),CH.assets(list[j])]); }catch(e){ return; }
  if(S.screen!=="title" || S.attract) return;
  S.attract=new KK.Battle({ cv:$("tcv"), assets:as, ctrls:[KK.cpu(1),KK.cpu(2)], stage:KK.stage.random(), sound:false, attract:true, cover:true,
    onEnd:()=>setTimeout(()=>{ stopAttract(); if(S.screen==="title") startAttract(); },1800) });
  S.attract.start();
}
function stopAttract(){ if(S.attract){ S.attract.destroy(); S.attract=null; } }
function renderTitle(){ $("soundMi").textContent="おと："+(S.sound?"ON":"OFF"); $("voiceMi").textContent="こえ："+KK.voice.MODES[S.voiceMode]; titleMenu.refresh(); }
KK.voice.setMode(S.voiceMode);
$("titleMenu").addEventListener("click",e=>{
  const b=e.target.closest(".mi"); if(!b) return;
  const a=b.dataset.act;
  if(a==="fight") openSelect();
  if(a==="manage") openManage();
  if(a==="help") show("help");
  if(a==="phone") openPhone();
  if(a==="sound"){ S.sound=!S.sound; ST.setPref("sound",S.sound); renderTitle(); }
  if(a==="voice"){ const ks=Object.keys(KK.voice.MODES); S.voiceMode=ks[(ks.indexOf(S.voiceMode)+1)%ks.length]; KK.voice.setMode(S.voiceMode); ST.setPref("voiceMode",S.voiceMode); renderTitle();
    if(S.sound) KK.voice.announce("fight","ラウンドワン ファイッ！"); }
});
$("helpClose").onclick=()=>{ show("title"); };
// ---------------- スマホで あそぶ(同じWi-FiのスマホにURLとQRを見せる) ----------------
let qrLib=null;
function loadQR(){ if(qrLib) return qrLib; qrLib=new Promise((res,rej)=>{ const s=document.createElement("script");
  s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; s.onload=()=>res(window.QRCode); s.onerror=rej; document.head.appendChild(s); }); return qrLib; }
async function openPhone(){
  show("phone");
  const box=$("qr"), urls=$("phoneUrls"); box.textContent="よみこみ中…"; urls.innerHTML="";
  const path=location.pathname.replace(/[^/]*$/,"")+"index.html";   // 横丁のトップ(そこからペタ拳へ)
  let list=[];
  try{ const r=await fetch("/__lan",{cache:"no-store"}); const j=await r.json();
    // 家のWi-Fi(192.168./10./172.)を先に。100.x は Tailscale など(外からでも つながる場合あり)
    const rank=(ip)=>/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(ip)?0:(/^100\./.test(ip)?2:1);
    list=j.ips.sort((a,b)=>rank(a)-rank(b)).map(ip=>"http://"+ip+":"+j.port+path);
  }catch(e){ if(location.protocol.startsWith("http") && !/^(localhost|127\.)/.test(location.hostname)) list=[location.origin+path]; }
  if(!list.length){ box.textContent="アドレスを調べられませんでした"; urls.innerHTML="「ペタ拳をあそぶ.bat」で起動してから もう一度ひらいてね"; return; }
  urls.innerHTML=list.map(u=>"<code></code>").join("<br>"); [...urls.querySelectorAll("code")].forEach((c,i)=>c.textContent=list[i]);
  try{ const QR=await loadQR(); box.innerHTML=""; new QR(box,{ text:list[0], width:180, height:180, correctLevel:QR.CorrectLevel.M }); }
  catch(e){ box.textContent="QRを出せませんでした(ネット未接続?) 上のアドレスを手で入力してね"; }
}
$("phoneClose").onclick=()=>show("title");
if(isTouchDevice()) $("phoneMi").classList.add("hidden");   // スマホで開いてる時は不要
function isTouchDevice(){ return ("ontouchstart" in window) || navigator.maxTouchPoints>0; }

// ---------------- キャラ選択(アーケード風) ----------------
let tiles=[]; // {kind:"rand"|"char"|"add", ch}
async function openSelect(){
  await reload();
  const ids=new Set(allChars().map(c=>c.id));
  S.slots=S.slots.map(c=>c && ids.has(c.id) ? allChars().find(x=>x.id===c.id) : null);
  S.active = !S.slots[0] ? 0 : (!S.slots[1] ? 1 : 1);
  chips($("modeChips"), [["cpu","VS CPU"],["2p","2P"]], S.mode, v=>{ S.mode=v; ST.setPref("mode",v); renderSelect(); });
  chips($("diffChips"), [[0,"EASY"],[1,"NORMAL"],[2,"HARD"]], S.diff, v=>{ S.diff=v; ST.setPref("diff",v); });
  chips($("stageChips"), [["random","RANDOM"]].concat(KK.stage.STAGES.map(s=>[s.id,s.name])), S.stage, v=>{ S.stage=v; ST.setPref("stage",v); });
  tiles=[{kind:"rand"}].concat(allChars().map(ch=>({kind:"char",ch}))).concat([{kind:"add"}]);
  S.cursor=Math.min(Math.max(1,S.cursor),tiles.length-1);
  show("select"); renderSelect();
}
function renderSelect(){
  $("diffRow").classList.toggle("hidden", S.mode!=="cpu");
  const done = S.slots[0] && S.slots[1];
  $("fightBtn").disabled = !done;
  $("selHint").innerHTML = done ? '<span class="blink">'+(isTouch?"FIGHT! を タップ":"ENTER で FIGHT!")+'</span>' : (S.active===0 ? "1P の キャラを えらべ" : (S.mode==="cpu" ? "あいて (CPU) を えらべ" : "2P の キャラを えらべ"));
  const g=$("selGrid"); g.innerHTML="";
  tiles.forEach((t,i)=>{
    const d=document.createElement("div"); d.className="tile";
    if(t.kind==="rand"){ d.classList.add("special"); d.textContent="?"; }
    else if(t.kind==="add"){ d.classList.add("special","add"); d.innerHTML='+<div class="tn">つくる</div>'; }
    else { d.appendChild(imgEl(t.ch)); const n=document.createElement("div"); n.className="tn"; n.textContent=t.ch.name; d.appendChild(n);
      for(let s=0;s<2;s++) if(S.slots[s] && S.slots[s].id===t.ch.id){ const l=document.createElement("div"); l.className="lbl l"+s; l.textContent=s?(S.mode==="cpu"?"CPU":"2P"):"1P"; d.appendChild(l); } }
    if(i===S.cursor && !done) d.classList.add("cur"+S.active);
    d.onpointerenter=()=>{ if(S.cursor!==i){ S.cursor=i; renderBig(); markCursor(); } };
    d.onclick=()=>{ S.cursor=i; choose(); };
    g.appendChild(d);
  });
  renderBig();
}
function markCursor(){ const done=S.slots[0]&&S.slots[1]; [...$("selGrid").children].forEach((d,i)=>{ d.classList.remove("cur0","cur1"); if(i===S.cursor && !done) d.classList.add("cur"+S.active); }); }
function renderBig(){
  for(let s=0;s<2;s++){
    const el=$("big"+s), locked=S.slots[s];
    const hover = !locked && S.active===s && tiles[S.cursor] && tiles[S.cursor].kind==="char" ? tiles[S.cursor].ch : null;
    const ch=locked||hover;
    el.classList.toggle("preview", !locked && !!hover);
    const tag = s===0 ? "1P" : (S.mode==="cpu"?"CPU":"2P");
    if(!ch){ el.innerHTML=`<div class="tag">${tag}</div><div class="pic"><div class="q">?</div></div><div class="bnm">-----</div>`; continue; }
    el.innerHTML=`<div class="tag">${tag}</div>${locked?'<div class="ok">OK!</div>':""}<div class="pic"></div><div class="bnm"></div><div class="bty"></div><div class="bars">${statBars(ch.stats||{power:3,speed:3,defense:3})}</div>`;
    el.querySelector(".pic").appendChild(imgEl(ch));
    el.querySelector(".bnm").textContent=ch.name; el.querySelector(".bty").textContent="("+CH.typeTag(ch.stats)+")";
  }
}
function choose(){
  const t=tiles[S.cursor]; if(!t) return;
  if(S.slots[0]&&S.slots[1]){ startBattle(); return; }
  if(t.kind==="add"){ openEditor(null,"select"); return; }
  let ch=t.ch;
  if(t.kind==="rand"){ const l=allChars(); ch=l[Math.floor(Math.random()*l.length)]; }
  S.slots[S.active]=ch; blip(true);
  if(S.sound) KK.voice.announce("name", ch.name, ch);
  if(S.active===0 && !S.slots[1]) S.active=1;
  renderSelect();
}
function unchoose(){
  if(S.slots[1]){ S.slots[1]=null; S.active=1; }
  else if(S.slots[0]){ S.slots[0]=null; S.active=0; }
  else { show("title"); return; }
  blip(); renderSelect();
}
function cols(){ const g=$("selGrid"); return Math.max(1, getComputedStyle(g).gridTemplateColumns.split(" ").length); }
$("selBack").onclick=()=>show("title");
$("fightBtn").onclick=()=>startBattle();

// ---------------- 操作表(対戦画面から見られる) ----------------
const K=(t)=>t.split(" ").map(k=>"<kbd>"+k+"</kbd>").join("");
function controlsHTML(){
  if(isTouch) return `<b>左の指</b>：ひっぱって いどう／上で ジャンプ／下で しゃがみ<br><b>ガード</b>：相手と反対に ひっぱる（下＋反対=しゃがみガード）<br>`+
    `<b>右の指</b>：弱・強・必殺・投げ（指を すべらせて押しかえ OK）<br><b>コンボ</b>：弱→弱→強→必殺 ／ <b>超ひっさつ</b>：ゲージMAXで 下＋必殺`;
  const common=`<b>ガード</b>：相手と<b>反対方向</b>を押す（立ち=上段・中段・空中技／${K("S")}も押して しゃがみ=上段・中段・下段）<br>`+
    `<b>投げ</b>：近くで 弱＋強 同時押し（ガードを崩せる）。つかまれたら すぐ投げで「投げぬけ」<br>`+
    `<b>しゃがみ攻撃</b>：しゃがんで弱=下段 ／ しゃがんで強=足払い（ダウン）<br>`+
    `<b>コンボ</b>：弱→弱→強→必殺 ／ <b>超ひっさつ</b>：ゲージMAXで しゃがみ＋必殺 ／ ${K("ESC")} ポーズ`;
  if(S.mode==="2p") return `<b style="color:#ff6a5a">1P</b>　${K("A D")} いどう ${K("W")} ジャンプ ${K("S")} しゃがみ ${K("F")} 弱 ${K("G")} 強 ${K("H")} 必殺 ${K("T")} 投げ<br>`+
    `<b style="color:#7fb0ff">2P</b>　${K("← →")} いどう ${K("↑")} ジャンプ ${K("↓")} しゃがみ ${K("1 2 3 4")} か ${K(", . / ;")} 弱・強・必殺・投げ<br>`+common;
  return `${K("A D")} いどう（相手の方へ=前進 / 反対=後退） ${K("W")} ジャンプ ${K("S")} しゃがみ<br>`+
    `${K("J")} 弱 ${K("K")} 強 ${K("L")} 必殺（クールダウンあり） ${K("I")} 投げ ／ 矢印キー＋${K("Z X C V")} でもOK<br>`+common;
}
function stripHTML(){
  return S.mode==="2p" ? `1P ${K("WASD")} ${K("F G H T")}　2P ${K("矢印")} ${K("1 2 3 4")}　ガード=反対方向　${K("ESC")} 操作表`
    : `${K("A D")} いどう ${K("W")} ジャンプ ${K("S")} しゃがみ ガード=反対方向 ${K("J")} 弱 ${K("K")} 強 ${K("L")} 必殺 ${K("I")} 投げ ${K("ESC")} 操作表`;
}
let stripT=null;
function showStrip(ms){ const el=$("ctrlStrip"); el.innerHTML=stripHTML(); el.classList.remove("hidden","fade"); clearTimeout(stripT);
  stripT=setTimeout(()=>el.classList.add("fade"), ms||9000); }
$("ctrlBtn").onclick=()=>pause(true);

// ---------------- 対戦 ----------------
const touchCtrl = KK.input.touchPad($("pad"));
const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints>0;
document.body.classList.toggle("touch", isTouch);
// スマホ: ダブルタップ拡大・ピンチ拡大を止める。
// 対戦画面では2回目のタップの既定動作(拡大)を消す(操作は pointer イベントで受けているので影響なし)。
// メニューでは止めない(能力値の +/- を すばやく連打できるように)。
(function(){
  let last=0;
  const inGame=(t)=>t && t.closest && (t.closest("#battle")||t.closest("#pad"));
  document.addEventListener("touchend",e=>{ const now=Date.now(); if(inGame(e.target) && now-last<350) e.preventDefault(); last=now; },{passive:false});
  document.addEventListener("dblclick",e=>{ if(!(e.target.closest&&e.target.closest("input,textarea"))) e.preventDefault(); },{passive:false});
  for(const ev of ["gesturestart","gesturechange"]) document.addEventListener(ev,e=>e.preventDefault(),{passive:false});
  document.addEventListener("touchmove",e=>{ if(e.touches && e.touches.length>1 && inGame(e.target)) e.preventDefault(); },{passive:false});
})();
// スマホは たて・よこ どちらでも遊べる。向きを変えたら 対戦画面の配置をその場で切り替える
const portraitMQ = matchMedia("(orientation: portrait)");
function portLayout(){ return isTouch && innerHeight>innerWidth; }
function onOrient(){
  document.body.classList.toggle("portrait", portraitMQ.matches);
  const port=portLayout();
  $("battle").classList.toggle("port", port);
  if(S.battle && S.battle.setLayout) requestAnimationFrame(()=>{ if(S.battle) S.battle.setLayout(port); });
}
portraitMQ.addEventListener ? portraitMQ.addEventListener("change",onOrient) : portraitMQ.addListener(onOrient);
addEventListener("resize",()=>{ if(S.battle && S.battle.resize && !S.battle.headless) S.battle.resize(); });
onOrient();
// スマホ: 対戦は全画面＋よこ向き固定を試す(できない端末では何もしない)
function goFullscreen(){
  if(!isTouch) return;
  const el=document.documentElement, rq=el.requestFullscreen||el.webkitRequestFullscreen;
  try{ const pr = rq && !document.fullscreenElement ? rq.call(el) : null;
    Promise.resolve(pr).catch(()=>{}); }catch(e){}
}
const resMenu=new Menu($("resMenu")), pauseMenu=new Menu($("pauseMenu"));
async function startBattle(){
  const [c1,c2]=S.slots; if(!c1||!c2) return;
  goFullscreen();
  touchCtrl.reset();
  let a1,a2;
  try{ [a1,a2]=await Promise.all([CH.assets(c1),CH.assets(c2)]); }catch(e){ toast("画像の よみこみに 失敗しました"); return; }
  endBattle();
  const I=KK.input;
  const ctrls = S.mode==="cpu"
    ? [ I.merge([I.keyboard("solo"), I.gamepad(0), touchCtrl]), KK.cpu(S.diff) ]
    : [ I.merge([I.keyboard("p1"), I.gamepad(0), touchCtrl]), I.merge([I.keyboard("p2"), I.gamepad(1)]) ];
  const stage = S.stage==="random" ? KK.stage.random() : S.stage;
  show("battle");
  $("pad").classList.toggle("hidden", !isTouch);
  $("battle").classList.toggle("port", portLayout());
  S.battle = new KK.Battle({ cv:$("bcv"), assets:[a1,a2], ctrls, stage, sound:S.sound, touch:isTouch, portrait:portLayout(), tags:["1P", S.mode==="cpu"?"CPU":"2P"],
    onEnd:()=>setTimeout(()=>{ if(S.battle && S.screen==="battle"){ $("pad").classList.add("hidden"); $("ctrlStrip").classList.add("hidden"); show("result"); resMenu.set(0); } },1400) });
  S.battle.start();
  if(!isTouch) showStrip(11000);
  onOrient();
}
function pause(on){
  if(!S.battle || S.battle.phase==="result") return;
  S.battle.setPaused(on); show(on?"pause":"battle");
  if(on){ pauseMenu.set(0); $("pauseKeys").innerHTML=controlsHTML(); } else $("pad").classList.toggle("hidden", !isTouch);
}
$("pauseBtn").onclick=()=>pause(true);
$("pauseMenu").addEventListener("click",e=>{ const b=e.target.closest(".mi"); if(!b) return;
  if(b.dataset.act==="resume") pause(false);
  if(b.dataset.act==="restart") startBattle();
  if(b.dataset.act==="select"){ endBattle(); openSelect(); } });
$("resMenu").addEventListener("click",e=>{ const b=e.target.closest(".pbtn"); if(!b) return;
  if(b.dataset.act==="again") startBattle();
  if(b.dataset.act==="select"){ endBattle(); openSelect(); }
  if(b.dataset.act==="title"){ endBattle(); show("title"); } });
$("bcv").addEventListener("pointerdown",()=>{ if(S.battle) S.battle.skip(); });
function endBattle(){ if(S.battle){ S.battle.destroy(); S.battle=null; } }

// ---------------- キーボード(画面ごとに振り分け) ----------------
addEventListener("keydown",e=>{
  if(e.target && (e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")) return;
  const k=e.code, up=k==="ArrowUp"||k==="KeyW", dn=k==="ArrowDown"||k==="KeyS", lf=k==="ArrowLeft"||k==="KeyA", rt=k==="ArrowRight"||k==="KeyD";
  const ok=k==="Enter"||k==="Space"||k==="KeyJ"||k==="KeyZ", cancel=k==="Escape"||k==="Backspace"||k==="KeyK"||k==="KeyX";
  const sc=S.screen;
  if(sc==="title"){ if(up) titleMenu.move(-1); else if(dn) titleMenu.move(1); else if(ok) titleMenu.ok(); else return; e.preventDefault(); }
  else if(sc==="help"||sc==="phone"){ if(ok||cancel){ show("title"); e.preventDefault(); } }
  else if(sc==="select"){
    const n=tiles.length, c=cols();
    if(lf) S.cursor=(S.cursor-1+n)%n; else if(rt) S.cursor=(S.cursor+1)%n;
    else if(up) S.cursor=Math.max(0,S.cursor-c); else if(dn) S.cursor=Math.min(n-1,S.cursor+c);
    else if(ok){ choose(); e.preventDefault(); return; } else if(cancel){ unchoose(); e.preventDefault(); return; } else return;
    e.preventDefault(); blip(); markCursor(); renderBig();
  }
  else if(sc==="battle"){
    if(k==="Escape"||k==="KeyP"){ pause(true); e.preventDefault(); }
    else if(S.battle && S.battle.phase==="vs" && (k==="Enter"||k==="Space")) S.battle.skip();
  }
  else if(sc==="pause"){ if(up) pauseMenu.move(-1); else if(dn) pauseMenu.move(1); else if(ok) pauseMenu.ok(); else if(k==="Escape"||k==="KeyP") pause(false); else return; e.preventDefault(); }
  else if(sc==="result"){ if(lf||up) resMenu.move(-1); else if(rt||dn) resMenu.move(1); else if(ok) resMenu.ok(); else return; e.preventDefault(); }
});

// ---------------- キャラ管理 ----------------
async function openManage(){ await reload(); renderManage(); show("manage"); }
function renderManage(){
  const g=$("manGrid"); g.innerHTML="";
  const add=document.createElement("div"); add.className="ccard add"; add.innerHTML='<div class="plus">+</div><div class="nm">あたらしく つくる</div>';
  add.onclick=()=>openEditor(null,"manage"); g.appendChild(add);
  for(const ch of allChars()){
    const c=document.createElement("div"); c.className="ccard";
    const th=document.createElement("div"); th.className="th"; th.appendChild(imgEl(ch)); c.appendChild(th);
    c.insertAdjacentHTML("beforeend", `<div class="nm"></div><div class="ty"></div>${ch.builtin?'<div class="tag2">SAMPLE</div>':'<div class="acts"><button class="ed">なおす</button><button class="del">けす</button></div>'}`);
    c.querySelector(".nm").textContent=ch.name; c.querySelector(".ty").textContent="("+CH.typeTag(ch.stats)+")";
    if(!ch.builtin){
      c.querySelector(".ed").onclick=()=>openEditor(ch,"manage");
      const del=c.querySelector(".del"); let sure=false, t=null;
      del.onclick=async()=>{
        if(!sure){ sure=true; del.classList.add("sure"); del.textContent="ほんとに？"; t=setTimeout(()=>{ sure=false; del.classList.remove("sure"); del.textContent="けす"; },3000); return; }
        clearTimeout(t); await ST.remove(ch.id); await reload(); renderManage(); toast(ch.name+" を けしました");
      };
    }
    g.appendChild(c);
  }
}
$("manBack").onclick=()=>show("title");
$("manFight").onclick=()=>openSelect();

// ---------------- キャラ編集 ----------------
const E={ p:null, mask:null, mode:"auto", tol:40, brush:"none", size:2, composed:null, diag:null,
  type:"auto", voice:"mid", display:"auto", outfit:"suit", flip:"mirror", faceDir:"right", stats:null, editing:null, from:"manage", preview:null, pvRaf:null };
const edCv=$("edCv"), edc=edCv.getContext("2d");
const pvLayer=new KK.pixel.Layer(300,300,3);

async function openEditor(ch, from){
  E.from=from; E.editing=ch; E.p=null; E.mask=null; E.composed=null; E.diag=null; E.brush="none"; E.size=2; E.preview=null;
  $("edTitle").textContent = ch ? "EDIT FIGHTER" : "NEW FIGHTER";
  $("edName").value = ch ? ch.name : CH.randomName();
  $("edShout").value = ch ? (ch.shout||"") : CH.randomShout();
  $("edSuper").value = ch ? (ch.superName||"") : CH.randomSuper();
  E.type = ch ? (ch.type||"auto") : "auto"; E.voice = ch ? (ch.voice||"mid") : "mid";
  E.display = ch ? (ch.display||"auto") : "auto"; E.outfit = ch ? (ch.outfit||"suit") : CH.randomOutfit();
  E.flip = ch ? (ch.flip||"none") : "mirror"; E.faceDir = ch ? (ch.faceDir||"right") : "right";
  E.stats = ch ? CH.normalizeStats(ch.stats) : CH.statsFor("balance");
  E.vvSpeaker = ch && ch.vvSpeaker!=null ? ch.vvSpeaker : null;
  setupVV(ch);
  E.mode = ch && ch.src ? ch.src.mode : "auto"; E.tol = ch && ch.src && ch.src.tol ? ch.src.tol : 40;
  $("tol").value=E.tol;
  buildEditorChips();
  setHasImage(false); $("cutNote").textContent=""; $("cutNote").className="note";
  show("editor");
  if(ch){
    try{
      const orig = await C.loadImage(ch.src && ch.src.original ? ch.src.original : ch.image);
      E.p = C.prepare(orig, 640);
      if(ch.src && ch.src.mask) E.mask = await C.dataURLToMask(ch.src.mask, E.p.w, E.p.h);
      else E.mask = computeMask();
      setHasImage(true); afterMaskChange();
    }catch(e){ toast("画像を ひらけませんでした"); }
  }
  renderStats(); startPreview();
}
function buildEditorChips(){
  chips($("cutChips"), [["auto","おまかせ"],["circle","まる"],["none","そのまま"]], E.mode, v=>{ E.mode=v; if(E.p){ E.mask=computeMask(); afterMaskChange(); } $("tolRow").classList.toggle("hidden",v!=="auto"); });
  $("tolRow").classList.toggle("hidden",E.mode!=="auto");
  chips($("brushChips"), [["none","つかわない"],["erase","けす"],["restore","もどす"]], E.brush, v=>{ E.brush=v; });
  chips($("sizeChips"), [[1,"ほそ"],[2,"ふつう"],[3,"ふと"]], E.size, v=>{ E.size=v; });
  chips($("dispChips"), Object.entries(CH.DISPLAYS).map(([k,d])=>[k,d.label]), E.display, v=>{ E.display=v; updatePreviewAsset(); });
  chips($("outfitChips"), Object.entries(CH.OUTFITS).map(([k,o])=>[k,o.label]), E.outfit, v=>{ E.outfit=v; updatePreviewAsset(); });
  chips($("flipChips"), Object.entries(CH.FLIPS).map(([k,f])=>[k,f.label]), E.flip, v=>{ E.flip=v; $("faceRow").classList.toggle("hidden",v!=="mirror"); updatePreviewAsset(); });
  $("faceRow").classList.toggle("hidden",E.flip!=="mirror");
  chips($("faceChips"), [["right","右を向いてる"],["left","左を向いてる"]], E.faceDir, v=>{ E.faceDir=v; updatePreviewAsset(); });
  chips($("typeChips"), Object.entries(CH.TYPES).map(([k,t])=>[k,t.label]), E.type, v=>{ E.type=v; applyType(); });
  chips($("voiceChips"), Object.entries(CH.VOICES).map(([k,v])=>[k,v.label]), E.voice, v=>{ E.voice=v; sayTest(); });
}
function sayTest(){ if(!S.sound) return; KK.voice.play($("edShout").value||"くらえ", E.voice); }
// ---- VOICEVOX: 声を えらぶ ----
let vvSpeakers=[];
async function setupVV(ch){
  const sel=$("vvSel"), note=$("vvNote"); sel.innerHTML=""; note.textContent="VOICEVOX を さがしています…";
  const ok=await KK.vv.available();
  if(!ok){
    $("vvRow").classList.add("hidden");
    note.textContent = (ch && ch.voiceClips && ch.vvName) ? ("保存ずみの声: "+KK.vv.credit(ch.vvName)+"（変えるときは PC で VOICEVOX を起動）")
      : (KK.vv.local ? "PC で VOICEVOX を起動すると、このキャラの声を えらべます"
                     : "VOICEVOX の声づくりは、PC の「ヘンゲー横丁をあそぶ.bat」から開いた時に使えます");
    return;
  }
  vvSpeakers=await KK.vv.speakers();
  $("vvRow").classList.remove("hidden");
  sel.innerHTML='<option value="">つかわない（ペチャクチャ声）</option>'+vvSpeakers.map(s=>`<option value="${s.id}">${s.label}</option>`).join("");
  sel.value = E.vvSpeaker!=null ? String(E.vvSpeaker) : "";
  vvNoteUpdate();
}
function vvNoteUpdate(){
  const sp=vvSpeakers.find(s=>String(s.id)===$("vvSel").value);
  $("vvNote").textContent = sp ? ("保存すると 掛け声と必殺技名を この声で作ります ・ "+KK.vv.credit(sp.name)) : "名前と勝ち名乗りは アナウンスの声で作ります";
}
$("vvSel").onchange=()=>{ E.vvSpeaker = $("vvSel").value==="" ? null : +$("vvSel").value; vvNoteUpdate(); };
$("vvTry").onclick=async()=>{
  if(E.vvSpeaker==null){ sayTest(); return; }
  $("vvTry").disabled=true;
  try{ const b=await KK.vv.synth($("edShout").value||"くらえ", E.vvSpeaker); await KK.voice.playClip(URL.createObjectURL(b),"try"); }
  catch(e){ toast(e.message); }
  $("vvTry").disabled=false;
};
// 保存時: VOICEVOX で セリフを作って キャラに入れる(起動していなければ 前の声を残す)
function announcerSpeaker(){
  const m=KK.voice.manifest; if(m && m.speakerId!=null) return m.speakerId;
  const pref=["青山龍星","玄野武宏","剣崎雌雄","白上虎太郎","ずんだもん"];
  for(const n of pref){ const s=vvSpeakers.find(x=>x.name===n && x.style==="ノーマル"); if(s) return s.id; }
  return vvSpeakers.length ? vvSpeakers[0].id : null;
}
async function makeVoiceClips(ch, old){
  const clips=Object.assign({}, (old && old.voiceClips)||{});
  const changed=(k,v)=>!old || old[k]!==v;
  // 文が変わったセリフの古い声は消す(違うことを しゃべらないように)
  if(changed("shout",ch.shout) || changed("vvSpeaker",ch.vvSpeaker)) delete clips.shout;
  if(changed("superName",ch.superName) || changed("vvSpeaker",ch.vvSpeaker)) delete clips.super;
  if(changed("name",ch.name)){ delete clips.name; delete clips.win; }
  if(ch.vvSpeaker==null){ delete clips.shout; delete clips.super; }
  if(!(await KK.vv.available())){ return Object.keys(clips).length ? clips : null; }
  if(!vvSpeakers.length) vvSpeakers=await KK.vv.speakers();
  const ann=announcerSpeaker(); const jobs=[];
  const mk=async(key,text,spk,o)=>{ const b=await KK.vv.synth(text,spk,o); clips[key]=await KK.vv.blobToDataURL(b); };
  if(ch.vvSpeaker!=null){
    if(!clips.shout) jobs.push(mk("shout", ch.shout+"！", ch.vvSpeaker, {speed:1.15, intonation:1.6}));
    if(!clips.super) jobs.push(mk("super", ch.superName+"！", ch.vvSpeaker, {speed:1.05, intonation:1.7}));
    const sp=vvSpeakers.find(s=>s.id===ch.vvSpeaker); if(sp) ch.vvName=sp.name;
  } else delete ch.vvName;
  if(ann!=null){
    if(!clips.name) jobs.push(mk("name", ch.name+"！", ann, {speed:1.0, intonation:1.5}));
    if(!clips.win) jobs.push(mk("win", ch.name+"の、かち！", ann, {speed:1.0, intonation:1.6}));
  }
  await Promise.all(jobs);
  return clips;
}
document.querySelectorAll("[data-dice]").forEach(b=>b.onclick=()=>{
  const k=b.dataset.dice;
  if(k==="name") $("edName").value=CH.randomName();
  if(k==="shout"){ $("edShout").value=CH.randomShout(); sayTest(); }
  if(k==="super") $("edSuper").value=CH.randomSuper();
});
function setHasImage(has){
  edCv.classList.toggle("hidden",!has); $("dropMsg").classList.toggle("hidden",has); $("drop").classList.toggle("has",has);
  $("reFile").classList.toggle("hidden",!has);
}
function computeMask(){
  if(E.mode==="circle") return C.circleMask(E.p);
  if(E.mode==="none") return C.fullMask(E.p);
  return C.autoMask(E.p, E.tol);
}
async function takeFile(file){
  if(!file || !/^image\//.test(file.type)){ toast("画像ファイルを えらんでね"); return; }
  try{
    const url=await C.fileToDataURL(file), img=await C.loadImage(url);
    E.p=C.prepare(img,640); E.mode="auto"; buildEditorChips();
    E.mask=computeMask(); setHasImage(true); afterMaskChange();
  }catch(e){ toast("その画像は よめませんでした"); }
}
$("drop").onclick=()=>{ if(!E.p) $("file").click(); };
$("reFile").onclick=()=>$("file").click();
$("file").onchange=(e)=>{ takeFile(e.target.files[0]); e.target.value=""; };
$("drop").addEventListener("dragover",e=>{ e.preventDefault(); $("drop").classList.add("drag"); });
$("drop").addEventListener("dragleave",()=>$("drop").classList.remove("drag"));
$("drop").addEventListener("drop",e=>{ e.preventDefault(); $("drop").classList.remove("drag"); takeFile(e.dataTransfer.files[0]); });
addEventListener("paste",e=>{
  if(S.screen!=="editor") return;
  const it=[...(e.clipboardData||{}).items||[]].find(i=>i.type&&i.type.startsWith("image/"));
  if(it){ e.preventDefault(); takeFile(it.getAsFile()); }
});
let tolT=null;
$("tol").oninput=()=>{ E.tol=+$("tol").value; clearTimeout(tolT); tolT=setTimeout(()=>{ if(E.p&&E.mode==="auto"){ E.mask=computeMask(); afterMaskChange(); } },120); };

// マスクを見せる: 残る所はそのまま、消える所はうっすら(戻せると分かるように)
let drawQueued=false;
function drawEditor(){
  if(drawQueued) return; drawQueued=true;
  requestAnimationFrame(()=>{ drawQueued=false; if(!E.p) return;
    const {w,h,data}=E.p; edCv.width=w; edCv.height=h;
    const id=edc.createImageData(w,h), o=id.data, m=E.mask;
    for(let i=0,n=w*h;i<n;i++){ const k=m[i]/255; o[i*4]=data[i*4]; o[i*4+1]=data[i*4+1]; o[i*4+2]=data[i*4+2]; o[i*4+3]=data[i*4+3]*(0.18+0.82*k); }
    edc.putImageData(id,0,0);
  });
}
function afterMaskChange(){
  drawEditor();
  E.composed=C.compose(E.p,E.mask);
  const note=$("cutNote");
  if(!E.composed){ note.textContent="ぜんぶ 消えちゃった。「けす つよさ」を下げるか「もどす」ブラシで。"; note.className="note warn"; E.preview=null; return; }
  const r=C.opaqueRatio(E.mask);
  if(E.mode==="auto" && !E.p.hasAlpha && r>0.97){ note.textContent="背景を 見つけられなかった。「つよさ」を上げるか、ブラシ・まる で。"; note.className="note warn"; }
  else if(E.mode==="auto" && r<0.06){ note.textContent="ほとんど 消えた。「つよさ」を下げてみて。"; note.className="note warn"; }
  else { note.textContent = E.mode==="auto" ? (E.p.hasAlpha?"透明な画像なので そのまま使うよ":"うすい所が 消える所。ブラシで なおせる") : ""; note.className="note"; }
  E.diag=C.analyze(E.composed);
  if(E.type==="auto") E.stats=CH.statsFor("auto",E.diag);
  renderStats(); updatePreviewAsset();
}
let painting=false;
function edPos(e){ const r=edCv.getBoundingClientRect(); return { x:(e.clientX-r.left)/r.width*edCv.width, y:(e.clientY-r.top)/r.height*edCv.height }; }
function paint(e){ const p=edPos(e), rad=[0,8,18,34][E.size]*Math.max(E.p.w,E.p.h)/640;
  C.brush(E.mask,E.p.w,E.p.h,p.x,p.y,rad,E.brush==="erase"?0:255); drawEditor(); }
edCv.addEventListener("pointerdown",e=>{
  if(!E.p) return;
  if(E.brush==="none"){ toast("下の「ブラシ」で けす/もどす を えらんでから なぞってね"); return; }
  painting=true; edCv.setPointerCapture(e.pointerId); paint(e); });
edCv.addEventListener("pointermove",e=>{ if(painting) paint(e); });
const endPaint=()=>{ if(painting){ painting=false; afterMaskChange(); } };
edCv.addEventListener("pointerup",endPaint); edCv.addEventListener("pointercancel",endPaint);

// 能力値: タイプを選ぶと そのプリセット / 画像しんだん。+−で いじると「じぶんで」になる
function applyType(){
  if(E.type==="auto") E.stats=CH.statsFor("auto", E.diag);
  else if(E.type!=="custom") E.stats=CH.statsFor(E.type);
  renderStats(); updatePreviewAsset();
}
function currentStats(){ return CH.normalizeStats(E.stats); }
const STAT_EFFECT={
  hp:(v)=>"HP "+Math.round(1000*(1+0.08*(v-3))),
  atk:(v)=>"与ダメ×"+(1+0.07*(v-3)).toFixed(2),
  def:(v)=>"被ダメ×"+(1-0.06*(v-3)).toFixed(2),
  spd:(v)=>"足×"+(1+0.07*(v-3)).toFixed(2),
};
function renderStats(){
  const st=E.stats||CH.statsFor("balance"), left=CH.BUDGET-CH.statSum(st);
  $("ptLeft").textContent="のこり "+left+" pt"; $("ptLeft").classList.toggle("zero",left===0);
  $("statRows").innerHTML=CH.STAT_KEYS.map(k=>`<div class="srow"><span class="sl">${CH.STAT_LABEL[k]}</span>
    <button data-k="${k}" data-d="-1" ${st[k]<=CH.STAT_MIN?"disabled":""}>-</button>
    <i>${[1,2,3,4,5].map(n=>`<b class="${n<=st[k]?"on":""}"></b>`).join("")}</i>
    <button data-k="${k}" data-d="1" ${st[k]>=CH.STAT_MAX||left<=0?"disabled":""}>+</button>
    <span class="sv">${st[k]}</span><span class="ef">${STAT_EFFECT[k](st[k])}</span></div>`).join("");
  $("diag").textContent = E.type==="auto" ? ("画像しんだん：" + (E.diag?E.diag.reason:"画像を えらんでね")) : (E.type==="custom" ? "じぶんで調整中" : "タイプ："+CH.TYPES[E.type].label);
}
$("statRows").addEventListener("click",e=>{
  const b=e.target.closest("button[data-k]"); if(!b || b.disabled) return;
  const k=b.dataset.k, d=+b.dataset.d, st=Object.assign({},E.stats);
  const left=CH.BUDGET-CH.statSum(st);
  if(d>0 && (left<=0 || st[k]>=CH.STAT_MAX)) return;
  if(d<0 && st[k]<=CH.STAT_MIN) return;
  st[k]+=d; E.stats=st; blip();
  if(E.type!=="custom"){ E.type="custom"; for(const c of $("typeChips").children) c.classList.toggle("on", c.textContent===CH.TYPES.custom.label); }
  renderStats(); updatePreviewAsset();
});
// 右の「ゲームでの見え方」プレビュー(対戦と同じ描画をそのまま使う)
function updatePreviewAsset(){
  if(!E.composed){ E.preview=null; return; }
  const like={ name:$("edName").value, stats:currentStats(), display:E.display, outfit:E.outfit, flip:E.flip, faceDir:E.faceDir, src:{mode:E.mode} };
  const a=CH.build(like, E.composed);
  $("outfitRow").classList.toggle("hidden", a.display!=="head");
  const f=new KK.Fighter(0,a); f.x=150; f.y=280; E.preview=f;
}
function startPreview(){
  cancelAnimationFrame(E.pvRaf);
  const cv=$("pvCv"), c=cv.getContext("2d"), P=KK.pixel; let t=0;
  const loop=()=>{
    if(S.screen!=="editor") return;
    E.pvRaf=requestAnimationFrame(loop); t++;
    c.setTransform(cv.width/300,0,0,cv.height/300,0,0); c.imageSmoothingEnabled=true;
    const g=c.createLinearGradient(0,0,0,300); g.addColorStop(0,"#3a1e52"); g.addColorStop(1,"#140a1e"); c.fillStyle=g; c.fillRect(0,0,300,300);
    c.fillStyle="#5d5e63"; c.fillRect(0,280,300,20); c.fillStyle="#120a10"; c.fillRect(0,279,300,3);
    const f=E.preview;
    if(!f){ c.fillStyle="#9d95c4"; c.font="20px "+P.FONT; c.textAlign="center"; c.fillText("ここに 出るよ",150,150); return; }
    // 待機 → 弱 → 強 → くらい → 必殺 → 勝ちポーズ をくりかえす
    const cyc=t%300; f.anim++; if(f.flash>0) f.flash--;
    const atk=(k,mt)=>{ f.state="attack"; f.moveKey=k; f.move=KK.MOVES[k]; f.mt=mt; };
    if(cyc<70) f.state="idle";
    else if(cyc<90) atk("light",cyc-70);
    else if(cyc<130) atk("heavy",cyc-90);
    else if(cyc<165){ f.state="hitstun"; if(cyc===130) f.flash=8; }
    else if(cyc<205) atk("special",cyc-165);
    else if(cyc<260) f.state="win";
    else f.state="idle";
    f.facing = (Math.floor(t/300)%2===0) ? 1 : -1; f.vf += Math.max(-0.34,Math.min(0.34,f.facing-f.vf));
    c.save(); P.ellipseRows(c,f.x,284,58,10,"rgba(0,0,0,.4)",3); c.restore();
    f.render(c,pvLayer);
  };
  loop();
}

$("edCancel").onclick=()=>{ if(E.from==="select") openSelect(); else openManage(); };
$("edSave").onclick=async()=>{
  if(!E.p || !E.composed){ toast(E.p?"切り抜きが からっぽ。ブラシで もどしてね":"まず 画像を えらんでね"); return; }
  const name=$("edName").value.trim() || CH.randomName();
  const ch = E.editing ? Object.assign({},E.editing) : { id:ST.newId(), poses:{} };
  Object.assign(ch,{
    name, type:E.type, voice:E.voice, stats:currentStats(), diag:E.diag?E.diag.reason:"", display:E.display, outfit:E.outfit, flip:E.flip, faceDir:E.faceDir,
    shout:$("edShout").value.trim()||CH.randomShout(), superName:$("edSuper").value.trim()||CH.randomSuper(),
    image:E.composed.toDataURL("image/png"),
    src:{ original:C.originalDataURL(E.p), mask:C.maskToDataURL(E.mask,E.p.w,E.p.h), mode:E.mode, tol:E.tol },
  });
  ch.vvSpeaker = E.vvSpeaker;
  if(E.vvSpeaker==null) delete ch.vvSpeaker;
  $("edSave").disabled=true; toast("声を つくっています…");
  try{ const clips=await makeVoiceClips(ch, E.editing); if(clips) ch.voiceClips=clips; else delete ch.voiceClips; }
  catch(e){ toast("声を作れませんでした: "+e.message); }
  $("edSave").disabled=false;
  try{ await ST.put(ch); }catch(e){ toast("ほぞんに 失敗しました（容量いっぱい？）"); return; }
  toast(name+" を ほぞんしました");
  await reload();
  if(E.from==="select"){ S.slots[S.active]=S.user.find(c=>c.id===ch.id); if(S.active===0) S.active=1; openSelect(); }
  else openManage();
};

KK.app=S; // デバッグ用(コンソールから状態を見られる)
// ---------------- はじまり ----------------
KK.pixel.preload();
KK.voice.loadManifest().then(m=>{
  if(m && !prefs.voiceMode){ S.voiceMode="vv"; }
  if(S.voiceMode==="vv" && !m) S.voiceMode="babble";
  KK.voice.setMode(S.voiceMode);
  if(m) $("credit").textContent="YOKOCHO ARCADE ・ CREDIT 99 ・ 音声 "+m.credit;
  renderTitle();
});
reload().then(()=>{ renderTitle(); show("title"); });
})();
