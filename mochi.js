"use strict";
(function(){
addEventListener('error',e=>{ let d=document.getElementById('err'); if(!d){ d=document.createElement('div'); d.id='err';
  d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d);} d.textContent='ERR: '+(e.message||e); });

/* =====================================================================
   もちつき ― リズムが主役。拍(ドン)に合わせて つく＝ぺったん。
   あいだの「うら」に相方の手が入る→そこで打つと つぶす(緊張)。
   のる(コンボ)ほど お囃子の層が増えて 気持ちいい(グルーヴ)。
   とちゅうで うら打ちなど パターンが変わる(意外)。餅は こわくなく陽気。
   ===================================================================== */
const Y=window.Yokocho, D=Y.draw, P=Y.PALETTE;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){ DPR=Math.min(window.devicePixelRatio||1,2.5); W=innerWidth; H=innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
addEventListener('resize',resize); resize();

const BPM=108;
const S={TITLE:0,PLAY:1,OVER:2}; let state=S.TITLE; let R=new Y.Rhythm(BPM);

// 場面(グルーヴが増していく)。pat: beat=表打ち / off=うら打ち。inten=お囃子の厚み。
const SCRIPT=[
  {name:"よいしょ",   beats:12, pat:"beat", say:"よーい、ぺったん！", inten:0},
  {name:"のってきた", beats:12, pat:"beat", say:"のってきたァ！",     inten:1},
  {name:"うらのり",   beats:12, pat:"off",  say:"うらで つけっ！",     inten:2},
  {name:"ほんばん",   beats:14, pat:"beat", say:"ここから 本番！",     inten:3},
  {name:"フィナーレ", beats:14, pat:"beat", say:"フィナーレ！",         inten:4},
];
const START=[]; { let a=0; for(const s of SCRIPT){ START.push(a); a+=s.beats; } START.push(a); }
const END_BEAT=START[START.length-1];

let secIdx=-1, pcount=0, good=0, smash=0, whiff=0, combo=0, bestCombo=0, nori=0, grow=0, anger=0;
let poundAnim=0, poundKind='', mochiSquish=0, mochiMouth=0, handHurt=0, flash=0, flashCol='255,255,255';
let bannerT="", bannerUntil=-9;
const floats=[];

function reset(){ R=new Y.Rhythm(BPM); secIdx=-1; pcount=good=smash=whiff=combo=bestCombo=0; nori=grow=anger=0;
  poundAnim=mochiSquish=mochiMouth=handHurt=flash=0; bannerT=""; bannerUntil=-9; floats.length=0; }

const usuY=()=>H*0.6, cxc=()=>W*0.5;
function section(){ return SCRIPT[Math.max(0,Math.min(SCRIPT.length-1,secIdx))]; }
function curInten(){ const s=section(); return Math.min(4,(s.inten||0)+(nori>0.7?1:0)); }

// リズム判定(純粋関数)。表打ちなら拍(0,1)で つく・うら(0.5)は手。うら打ちは逆。
function cdist(ph, targets){ let m=1; for(const t of targets){ let d=Math.abs(ph-t); d=Math.min(d,1-d); if(d<m)m=d; } return m; }
function judge(b, pat){ const ph=((b%1)+1)%1;
  const pound = pat==='off' ? [0.5] : [0,1];
  const hand  = pat==='off' ? [0,1] : [0.5];
  const dHand=cdist(ph,hand), dPound=cdist(ph,pound);
  if(dHand<0.13) return 'smash';
  if(dPound<0.06) return 'perfect';
  if(dPound<0.13) return 'good';
  return 'whiff';
}
// 手の出具合(0=引っこむ,1=出てる)。手のターゲット拍で 1。
function handIn(ph,pat){ const hand=pat==='off'?[0,1]:[0.5]; const d=cdist(ph,hand); return Math.max(0,1-d/0.5); }

// お囃子(拍の音を audio時刻に予約=ズレない)。のる/場面が進むほど層が増える。
function onBeat(n,at){ const spb=R.spb, bib=((n%4)+4)%4;
  Y.audio.tone(150,0.17,'sine',0.5,at);                 // ドン(表)
  Y.audio.noise(0.03,0.10,at+spb/2,7000);               // チッ(うら)
  const inten=curInten();
  if(inten>=1 && (bib===1||bib===3)) Y.audio.noise(0.05,0.22,at,2500);   // 手拍子 2・4
  if(inten>=2){ Y.audio.noise(0.02,0.05,at+spb/4,9000); Y.audio.noise(0.02,0.05,at+spb*3/4,9000); } // 8分ハット
  if(inten>=3 && bib===0) Y.audio.tone(80,0.20,'sine',0.32,at);          // 低音の芯
  if(inten>=4 && n%8===0) Y.audio.tone(220,0.12,'square',0.14,at);       // 賑やかし
  if(bib===2 && state===S.PLAY) setTimeout(()=>{ if(state===S.PLAY) Y.say("あいよ",{char:'niisan',volume:0.65}); }, spb*500);
}

function start(){ Y.audio.resume(); reset();
  document.getElementById('title').classList.add('hidden'); document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden'); document.getElementById('hint').classList.remove('hidden');
  state=S.PLAY; R.start(onBeat); }

function finish(){ state=S.OVER; R.stop();
  let title,deki,msg;
  if(smash>=8){ title="て が いたい"; deki="ぐちゃぐちゃ もち"; msg="手を つぶしすぎ。いてて…。"; }
  else if(bestCombo>=24 && smash<=2){ title="もちつき 名人！"; deki="つやつや もち"; msg="完ぺきな ノリ。みごと！"; }
  else if(grow>0.8){ title="でかい もち"; deki="ごきげん もち"; msg="よく のびた。うまそう。"; }
  else { title="できた"; deki="ふつうの もち"; msg="まあまあ。もういっちょ？"; }
  document.getElementById('goTitle').textContent=title;
  document.getElementById('goDeki').textContent=deki;
  document.getElementById('goMsg').textContent=msg;
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('gameover').classList.remove('hidden'); }

function tap(){
  if(state!==S.PLAY) return; const b=R.beat(); if(b<0) return;
  const sec=section(); const kind=judge(b,sec.pat); poundAnim=1;
  if(kind==='smash'){ poundKind='smash'; smash++; combo=0; nori=Math.max(0,nori-0.4); handHurt=1; anger=Math.min(1,anger+0.25);
    Y.sfx.bad(); Y.say(["いたっ","あいたっ","ちょっ"][smash%3],{char:'niisan',interrupt:true,pitch:1.4});
    addFloat(cxc()+90,usuY()-40,"ｸﾞｼｬ",'#ff5566',true); flash=0.4; flashCol='255,60,80'; return; }
  if(kind==='whiff'){ poundKind='whiff'; whiff++; combo=0; nori=Math.max(0,nori-0.12);
    Y.sfx.whiff(); addFloat(cxc(),usuY()-80,"すかっ",'#c9b98a',false); return; }
  // good / perfect ＝ つけた
  const perfect=kind==='perfect'; if(perfect)pcount++; else good++;
  poundKind='good'; combo++; if(combo>bestCombo)bestCombo=combo;
  nori=Math.min(1,nori+(perfect?0.09:0.05)); grow=Math.min(1.3,grow+0.03); mochiSquish=1; mochiMouth=1;
  Y.audio.tone(150,0.16,'sine',0.5); Y.audio.noise(0.05,0.4,undefined,1200); if(perfect) Y.sfx.good();
  addFloat(cxc(),usuY()-110, perfect?"ﾋﾟｯﾀﾘ!":"ぺったん", perfect?P.pop:'#fff', perfect); burst(cxc(),usuY()-30,perfect?12:7);
  flash=0.16; flashCol='255,240,120';
  if(perfect && combo%4===0) Y.say(["よいしょ！","もういっちょ！","そーれ！"][(combo/4)%3|0],{char:'ossan',volume:0.85});
}

function addFloat(x,y,text,col,big){ floats.push({x,y,text,col,big:!!big,life:1,vy:-52,rot:(Math.random()*2-1)*10}); }
function burst(x,y,n){ for(let i=0;i<n;i++){ const a=-Math.PI/2+(i/n-0.5)*2.3,sp=200+Math.random()*200;
  floats.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,dot:true,col:'244,240,230'}); } }

function update(dt){
  poundAnim=Math.max(0,poundAnim-dt*5); mochiSquish=Math.max(0,mochiSquish-dt*4);
  mochiMouth=Math.max(0,mochiMouth-dt*3); handHurt=Math.max(0,handHurt-dt*2);
  anger=Math.max(0,anger-dt*0.2); flash=Math.max(0,flash-dt*2.4);
  nori=Math.max(0,nori-dt*0.03);   // 何もしないと ノリは さめる
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; if(f.dot){ f.vy+=1000*dt; f.x+=f.vx*dt; f.y+=f.vy*dt; } else { f.y+=f.vy*dt; f.vy*=0.9; }
    f.life-=dt*(f.dot?2:1.3); if(f.life<=0) floats.splice(i,1); }

  if(state===S.PLAY){ const b=R.beat();
    if(b>=0){ let idx=0; while(idx<SCRIPT.length && b>=START[idx+1]) idx++;
      if(idx!==secIdx && idx<SCRIPT.length){ secIdx=idx; const s=SCRIPT[idx];
        bannerT=s.name; bannerUntil=b+2.2; document.getElementById('sect').textContent=s.name;
        Y.say(s.say,{char:'narr',interrupt:true}); } }
    document.getElementById('deki').textContent = nori>0.8?"ノリノリ":nori>0.5?"のってきた":nori>0.2?"ふつう":"…";
    if(b>=END_BEAT) finish();
  }
}

// ── 描画 ──
function draw(){
  ctx.save();   // 画面ゆれは廃止
  const b=state===S.PLAY?R.beat():END_BEAT, ph=((b%1)+1)%1;
  const pulse=Math.max(0,1-(ph<0.5?ph:1-ph)/0.5);   // 拍で1(グルーヴの鼓動)
  // 空・地面(お祭り)
  ctx.fillStyle=P.sky; ctx.fillRect(-20,-20,W+40,H*0.66);
  ctx.fillStyle=P.dirt; ctx.fillRect(-20,H*0.64,W+40,H);
  ctx.strokeStyle=P.ink; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(-10,H*0.64); ctx.lineTo(W+10,H*0.64-4); ctx.stroke();
  drawLanterns(b, pulse);

  if(state===S.PLAY||state===S.OVER){
    const hin=state===S.PLAY?handIn(ph,section().pat):0;
    drawUsu();
    drawMochi(b, ph, pulse);
    D.creature(ctx,P.buyo,{x:W*0.22,y:usuY()+6,scale:1,rot:-0.05,mouthOpen:0.3+poundAnim*0.6,brow:0.5},D.buyoBody);
    drawKine();
    const hurt=handHurt>0, panic=Math.min(1,(smash)/6);
    D.creature(ctx,P.noppo,{x:W*0.82,y:usuY()+8,scale:0.95,rot:0.05,
      mouthOpen:hurt?0.9:(0.15+panic*0.5),brow:hurt?-0.9:0.4,dead:hurt&&handHurt>0.5},D.noppoBody);
    drawHand(hin,hurt);
  }

  // 破片・掛け声文字
  for(const f of floats){ ctx.globalAlpha=Math.max(0,f.life);
    if(f.dot){ ctx.fillStyle=`rgba(${f.col},${f.life})`; ctx.beginPath(); ctx.arc(f.x,f.y,4*f.life+1,0,7); ctx.fill(); }
    else { ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(f.rot*Math.PI/180); ctx.font=`900 ${f.big?52:30}px sans-serif`;
      ctx.textAlign='center'; ctx.lineWidth=7; ctx.strokeStyle=P.ink; ctx.strokeText(f.text,0,0);
      ctx.fillStyle=f.col; ctx.fillText(f.text,0,0); ctx.restore(); } }
  ctx.globalAlpha=1;

  if(state===S.PLAY){ drawNori(); drawCombo(); drawBeatDots(ph); }
  if(state===S.PLAY && R.beat()<bannerUntil){ ctx.save(); ctx.translate(W/2,H*0.26); ctx.rotate(-0.05);
    ctx.font='900 44px sans-serif'; ctx.textAlign='center'; ctx.lineWidth=9; ctx.strokeStyle=P.ink;
    ctx.strokeText(bannerT,0,0); ctx.fillStyle=P.pop; ctx.fillText(bannerT,0,0); ctx.restore(); }

  ctx.restore();
  if(flash>0){ ctx.fillStyle=`rgba(${flashCol},${flash*0.5})`; ctx.fillRect(0,0,W,H); }
}

function drawLanterns(b,pulse){ // 提灯が拍で ゆれる
  const y=H*0.12, sway=Math.sin(b*Math.PI)* (6+nori*10);
  for(let i=0;i<5;i++){ const x=W*(0.12+i*0.19); ctx.save(); ctx.translate(x,y+ (i%2?sway:-sway)*0.5);
    ctx.strokeStyle=P.ink; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(0,-40); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,0,15,20,0,0,7); ctx.fillStyle=i%2?'#e8503a':'#ffcf3f'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=P.ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-15,-6); ctx.lineTo(15,-6); ctx.moveTo(-15,6); ctx.lineTo(15,6); ctx.stroke(); ctx.restore(); }
}
function drawUsu(){ const x=cxc(),y=usuY()+40; ctx.save(); ctx.translate(x,y);
  ctx.beginPath(); ctx.moveTo(-88,-4); ctx.quadraticCurveTo(-88,54,0,54); ctx.quadraticCurveTo(88,54,88,-4);
  ctx.quadraticCurveTo(74,-26,0,-26); ctx.quadraticCurveTo(-74,-26,-88,-4); D.fillInk(ctx,'#3a2a1a',7);
  ctx.beginPath(); ctx.ellipse(0,-8,80,22,0,0,7); D.fillInk(ctx,'#5a4428',5); ctx.restore(); }

function drawMochi(b, ph, pulse){
  const cx=cxc(), cy=usuY()+18, base=48+grow*70;
  const bounce=pulse*8*(0.4+nori), sq=(1-mochiSquish*0.3)*(1+pulse*0.06*(0.4+nori));
  ctx.save(); ctx.translate(cx,cy-bounce); ctx.scale(1+mochiSquish*0.18, sq);
  // 本体(ぷにっと)
  ctx.beginPath(); const n=16; for(let i=0;i<=n;i++){ const a=i/n*Math.PI*2, rr=base*(1+Math.sin(a*3+b)*0.05);
    const px=Math.cos(a)*rr, py=Math.sin(a)*rr*0.82 - base*0.15; i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
  ctx.closePath();
  const g=ctx.createRadialGradient(-base*0.3,-base*0.4,base*0.1,0,0,base*1.3);
  g.addColorStop(0,'#ffffff'); g.addColorStop(0.6, nori>0.5?'#fff4fa':'#f4efe2'); g.addColorStop(1,'#e6dcc8');
  ctx.fillStyle=g; ctx.fill(); D.ink(ctx,Math.max(5,base*0.08));
  // 顔(にこにこ)
  const er=base*0.12, ex=base*0.32, ey=-base*0.18;
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-ex,ey,er,0,7); ctx.arc(ex,ey,er,0,7); ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=3; ctx.stroke();
  ctx.fillStyle=P.ink; ctx.beginPath(); ctx.arc(-ex,ey+2,er*0.5,0,7); ctx.arc(ex,ey+2,er*0.5,0,7); ctx.fill();
  ctx.fillStyle='rgba(255,140,160,.5)'; ctx.beginPath(); ctx.arc(-ex*1.4,ey+er*1.7,er*0.7,0,7); ctx.arc(ex*1.4,ey+er*1.7,er*0.7,0,7); ctx.fill();
  const mo=Math.max(mochiMouth, anger*0.5), my=base*0.12;
  ctx.strokeStyle=P.ink; ctx.lineWidth=4;
  if(anger>0.4){ ctx.beginPath(); ctx.ellipse(0,my,base*0.26,base*(0.06+mo*0.4),0,0,7); ctx.fillStyle='#7a1c12'; ctx.fill(); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(0,my-base*0.05,base*0.26,0.15*Math.PI,0.85*Math.PI); ctx.stroke(); }
  ctx.restore();
}
function drawKine(){ const down=poundAnim, topY=usuY()-200+down*160, x=cxc()-4+(poundKind==='smash'?52:0);
  ctx.save(); ctx.translate(x,topY); ctx.rotate(-0.12*(1-down));
  ctx.beginPath(); ctx.roundRect(-10,0,20,160,6); D.fillInk(ctx,'#a9793f',5);
  ctx.beginPath(); ctx.roundRect(-38,-44,76,50,12); D.fillInk(ctx,'#c99a55',6); ctx.restore(); }
function drawHand(hin,hurt){ const x0=W*0.82-34,y0=usuY()+30,tx=cxc()+34,ty=usuY()+6;
  const px=x0+(tx-x0)*hin,py=y0+(ty-y0)*hin+(hurt?(Math.random()*2-1)*5:0);
  ctx.strokeStyle=P.ink; ctx.lineWidth=11; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(px,py); ctx.stroke();
  ctx.fillStyle=hurt?'#ff8a8a':P.noppo; ctx.strokeStyle=P.ink; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(px,py,13,0,7); ctx.fill(); ctx.stroke(); }

// ノリ メーター
function drawNori(){ const w=Math.min(W*0.6,260), x=W/2-w/2, y=H-30, h=14;
  ctx.fillStyle='rgba(0,0,0,.15)'; ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.fill();
  const g=ctx.createLinearGradient(x,0,x+w,0); g.addColorStop(0,'#ffcf3f'); g.addColorStop(1,'#ff6a3d');
  ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(x,y,w*nori,h,7); ctx.fill();
  ctx.strokeStyle=P.ink; ctx.lineWidth=3; ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.stroke();
  ctx.fillStyle=P.ink; ctx.font='900 12px sans-serif'; ctx.textAlign='center'; ctx.fillText('ノリ',W/2,y-6); }
function drawCombo(){ if(combo<2) return; ctx.save(); ctx.translate(W-16,H-30);
  ctx.font='900 26px sans-serif'; ctx.textAlign='right'; ctx.fillStyle='#c85a1a';
  ctx.fillText(combo+' れんぞく',0,0); ctx.restore(); }
// 拍の目印(4つのランプが順に光る)＝リズムを目で取れる
function drawBeatDots(ph){ const b=R.beat(); const bib=((Math.floor(b)%4)+4)%4; const y=H*0.5;
  for(let i=0;i<4;i++){ const x=W/2+(i-1.5)*30; const on=(i===bib);
    ctx.beginPath(); ctx.arc(x,y,on?9*(1+(1-ph)*0.3):6,0,7);
    ctx.fillStyle=on?'#ffcf3f':'rgba(255,255,255,.35)'; ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=2; ctx.stroke(); } }

document.getElementById('startBtn').addEventListener('click',e=>{e.stopPropagation();start();});
document.getElementById('retryBtn').addEventListener('click',e=>{e.stopPropagation();start();});
addEventListener('pointerdown',e=>{ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back'))) return;
  if(state===S.PLAY){ e.preventDefault(); tap(); } },{passive:false});

let tPrev=performance.now();
function frame(now){ const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; update(dt); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// テスト用フック(音時計に依存せず判定ロジック等を検証)
window.__mochi={
  judge(ph,pat){ return judge(ph,pat); },
  handIn(ph,pat){ return +handIn(ph,pat).toFixed(2); },
  sections:SCRIPT.length, endBeat:END_BEAT, starts:START.slice(),
  sectionAtBeat(b){ let idx=0; while(idx<SCRIPT.length && b>=START[idx+1]) idx++; return {idx, name:SCRIPT[Math.min(idx,SCRIPT.length-1)].name, pat:SCRIPT[Math.min(idx,SCRIPT.length-1)].pat}; },
  setSection(i){ secIdx=i; return section().name; },
  draw(){ draw(); return true; },
  snap(){ return {state,secIdx,combo,bestCombo,nori:+nori.toFixed(2),smash,pcount,good,whiff}; },
  playHidden(){ state=S.PLAY; },   // 描画テスト用に PLAY 状態へ
};
})();
