"use strict";
(function(){
addEventListener('error',e=>{ let d=document.getElementById('err'); if(!d){ d=document.createElement('div'); d.id='err';
  d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d);} d.textContent='ERR: '+(e.message||e); });
const Y=window.Yokocho, P=Y.PALETTE;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){ DPR=Math.min(window.devicePixelRatio||1,2.5); W=innerWidth; H=innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); layout(); }
addEventListener('resize',resize);

const COLS=7, ROWS=10;
const S={TITLE:0,PLAY:1,OVER:2}; let state=S.TITLE;
let level=1, teleports=2, survived=0, msg="", msgT=0, shake=0, flash=0, flashCol='255,240,120';
let player={x:0,y:0,fx:0,fy:0}, pursuers=[], junks=new Set();
// 手番アニメ＋快感演出
let phase='idle', animT=0, freeze=0, streak=0;
const parts=[], floats=[]; const ANIMDUR=0.2;
const perfNow=()=>performance.now();
function interp(o,t){ const fx=o.fx!=null?o.fx:o.x, fy=o.fy!=null?o.fy:o.y;
  return { x: cx(fx)+(cx(o.x)-cx(fx))*t, y: cy(fy)+(cy(o.y)-cy(fy))*t }; }

// 盤の画面配置
let cell=40, cellY=26, ox=0, oy=0;
function layout(){ const availW=W-24, availH=H*0.64;
  cell=Math.floor(Math.min(availW/COLS, availH/(ROWS*0.62)));
  cellY=Math.floor(cell*0.62);           // 行を圧縮=斜め見下ろし(立体)
  ox=Math.floor((W-cell*COLS)/2); oy=Math.floor(H*0.13); }

const key=(x,y)=>x+","+y;
const inGrid=(x,y)=>x>=0&&x<COLS&&y>=0&&y<ROWS;
const isJunk=(x,y)=>junks.has(key(x,y));
const pursuerAt=(x,y)=>pursuers.some(p=>p.x===x&&p.y===y);
const sign=v=>v>0?1:v<0?-1:0;

function emptyCells(){ const out=[]; for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(isJunk(x,y)||pursuerAt(x,y)||(player.x===x&&player.y===y)) continue; out.push({x,y}); } return out; }

function startLevel(lv){
  level=lv; teleports=2; junks=new Set(); pursuers=[]; msg=""; msgT=0;
  phase='idle'; animT=0; freeze=0; parts.length=0; floats.length=0;
  player={x:(COLS/2)|0, y:ROWS-2};
  const n=3+lv; // しつこいやつの数
  // プレイヤーから離れた空きマスに配置
  let guard=0;
  while(pursuers.length<n && guard++<500){ const x=(Math.random()*COLS)|0, y=(Math.random()*(ROWS-2))|0;
    if((Math.abs(x-player.x)+Math.abs(y-player.y))<3) continue;
    if(pursuerAt(x,y)||(x===player.x&&y===player.y)) continue; pursuers.push({x,y}); }
}

function start(){ Y.audio.resume(); state=S.PLAY; startLevel(1);
  document.getElementById('title').classList.add('hidden'); document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden'); updHud(); }

// ── 手番: プレイヤー移動 → 追っ手が寄る(アニメ) → 到着で相打ち判定(ジューシー) ──
// しつこいやつが1歩 プレイヤーへ(8方向・貪欲)。from を残してアニメで見せる。
function computeChase(){ for(const p of pursuers){ p.fx=p.x; p.fy=p.y;
  p.x += sign(player.x-p.x); p.y += sign(player.y-p.y); } }

function tryMove(nx,ny){
  if(state!==S.PLAY || phase!=='idle') return;
  if(!inGrid(nx,ny)) return;
  if(Math.max(Math.abs(nx-player.x),Math.abs(ny-player.y))>1) return; // となりのみ
  if(isJunk(nx,ny)||pursuerAt(nx,ny)) return;
  player.fx=player.x; player.fy=player.y; player.x=nx; player.y=ny;
  computeChase(); phase='anim'; animT=0;
}
function teleport(){
  if(state!==S.PLAY || phase!=='idle' || teleports<=0) return;
  const e=emptyCells(); if(!e.length) return;
  const c=e[(Math.random()*e.length)|0]; teleports--;
  player.fx=player.x; player.fy=player.y; player.x=c.x; player.y=c.y;
  computeChase(); Y.say("てれぽ",{char:'chibi',interrupt:true}); phase='anim'; animT=0;
}

// 追っ手が到着した瞬間の相打ち判定＋「してやったり」演出
function resolveEnd(){
  const cnt={}; for(const p of pursuers){ const k=key(p.x,p.y); cnt[k]=(cnt[k]||0)+1; }
  let caught=false; const survivors=[]; const crashCells=[];
  for(const p of pursuers){
    if(p.x===player.x && p.y===player.y) caught=true;
    const k=key(p.x,p.y);
    if(cnt[k]>=2 || isJunk(p.x,p.y)){ junks.add(k); if(crashCells.indexOf(k)<0) crashCells.push(k); }
    else survivors.push(p);
  }
  const crashed = pursuers.length - survivors.length;
  pursuers=survivors; phase='idle';

  for(const k of crashCells){ const a=k.split(",").map(Number); crashBurst(cx(a[0]),cy(a[1])); }
  if(crashed>0){ Y.sfx.hit(); flash=0.34; flashCol='255,240,120';
    if(crashed>=2){ streak++; shake=16+Math.min(crashed,4)*3; freeze=0.2;
      addFloat(W/2, oy+cell*2.4, crashed>=3?"してやったり！！":"してやったり！", P.pop, true);
      Y.say(["ナイス！","してやったり！","かかった！","うまい！"][crashed%4],{char:'niisan',interrupt:true}); }
    else { shake=9; freeze=0.08; Y.say(["あっ！","うわっ！","しまった！"][(Math.random()*3)|0],{char:'chibi',interrupt:true}); }
  } else streak=0;

  if(caught){ over(false); return; }
  if(pursuers.length===0){ Y.sfx.good(); Y.say("ぜんいん たおした！",{char:'niisan',interrupt:true});
    survived++; msg="かい "+(level+1)+"！"; msgT=1.6; startLevel(level+1); }
  updHud();
}
function crashBurst(x,y){ for(let i=0;i<12;i++){ const a=(i/12)*Math.PI*2, sp=120+Math.random()*160;
  parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-60,life:1}); } }
function addFloat(x,y,text,col,big){ floats.push({x,y,text,col,big:!!big,life:1,vy:-46}); }

function over(win){ state=S.OVER;
  document.getElementById('goTitle').textContent = win?"にげきった！":"つかまった";
  document.getElementById('goSub').textContent = "かい "+level+" まで";
  document.getElementById('goMsg').textContent = "ぶつけ合わせが うまいと 先へ進める。";
  Y.sfx.bad(); if(!win) Y.say("つかまえたー",{char:'ossan',interrupt:true});
  document.getElementById('hud').classList.add('hidden'); document.getElementById('gameover').classList.remove('hidden'); }

function updHud(){ document.getElementById('lv').textContent=level; document.getElementById('left').textContent=pursuers.length; }

// ── 描画 ──
function cx(x){ return ox+x*cell+cell/2; } function cy(y){ return oy+y*cellY+cellY/2; }
function draw(){
  ctx.save(); let sx=0,sy=0; if(shake>0){ sx=(Math.random()*2-1)*shake; sy=(Math.random()*2-1)*shake; } ctx.translate(sx,sy);
  ctx.fillStyle="#cfc6b0"; ctx.fillRect(-20,-20,W+40,H+40);
  const bw=COLS*cell, bh=ROWS*cellY, th=Math.max(14,cell*0.34);
  // 盤の厚み(前面＝立体)
  ctx.fillStyle="#a89a78"; ctx.fillRect(ox-3,oy+bh,bw+6,th);
  // 盤面(斜め見下ろし。行を圧縮)
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ ctx.fillStyle=(x+y)%2?"#ded5bf":"#efe8d6";
    ctx.fillRect(ox+x*cell,oy+y*cellY,cell,cellY); }
  ctx.strokeStyle="rgba(0,0,0,.10)"; ctx.lineWidth=1;
  for(let x=0;x<=COLS;x++){ ctx.beginPath(); ctx.moveTo(ox+x*cell,oy); ctx.lineTo(ox+x*cell,oy+bh); ctx.stroke(); }
  for(let y=0;y<=ROWS;y++){ ctx.beginPath(); ctx.moveTo(ox,oy+y*cellY); ctx.lineTo(ox+bw,oy+y*cellY); ctx.stroke(); }
  ctx.strokeStyle=P.ink; ctx.lineWidth=5; ctx.strokeRect(ox,oy,bw,bh);
  ctx.beginPath(); ctx.moveTo(ox-3,oy+bh+th); ctx.lineTo(ox+bw+3,oy+bh+th); ctx.lineTo(ox+bw+3,oy+bh); ctx.stroke();

  if(state===S.PLAY && phase==='idle'){ // 動けるマスを薄く光らせる(入力待ちだけ)
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const nx=player.x+dx, ny=player.y+dy;
      if(!inGrid(nx,ny)||isJunk(nx,ny)||pursuerAt(nx,ny)) continue;
      ctx.fillStyle="rgba(255,210,62,.42)"; ctx.fillRect(ox+nx*cell+2,oy+ny*cellY+2,cell-4,cellY-4); } }

  // がれき(立体の山＋影)
  for(const k of junks){ const [x,y]=k.split(",").map(Number); const jx=cx(x), jy=cy(y);
    ctx.fillStyle="rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(jx,jy+cell*0.06,cell*0.34,cell*0.15,0,0,7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(jx-cell*0.34,jy+cell*0.06); ctx.quadraticCurveTo(jx,jy-cell*0.52,jx+cell*0.34,jy+cell*0.06); ctx.closePath();
    ctx.fillStyle="#8a94a6"; ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=3; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(jx-cell*0.06,jy-cell*0.2,cell*0.13,cell*0.07,0,0,7); ctx.fillStyle="#adb6c4"; ctx.fill(); }

  // 駒: 影を落として立ち上がる。奥(小さいy)→手前(大きいy)の順で描き重なりを出す
  const et = phase==='anim' ? (1-(1-animT)*(1-animT)) : 1;
  const pieces = pursuers.map(p=>({p,pl:false})); pieces.push({p:player,pl:true});
  pieces.sort((a,b)=>(a.p.y-b.p.y)||(a.p.x-b.p.x));
  for(const it of pieces){ const q=interp(it.p,et);
    ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(q.x,q.y+cell*0.04,cell*0.3,cell*0.14,0,0,7); ctx.fill();
    if(!it.pl && phase==='idle' && Math.max(Math.abs(it.p.x-player.x),Math.abs(it.p.y-player.y))<=1){
      ctx.strokeStyle='rgba(255,40,60,'+(0.35+0.35*Math.sin(perfNow()*0.012))+')'; ctx.lineWidth=4;
      ctx.beginPath(); ctx.ellipse(q.x,q.y,cell*0.4,cell*0.22,0,0,7); ctx.stroke(); }
    drawGridPerson(q.x, q.y-cell*0.4, cell, it.pl?"#ff2d6b":"#d64b3a", !it.pl); }
  // 粒(相打ちの飛沫)
  for(const p of parts){ ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle="#8a94a6";
    ctx.beginPath(); ctx.arc(p.x,p.y,3.5*p.life+1.5,0,7); ctx.fill(); }
  ctx.globalAlpha=1;

  ctx.restore();
  // 「してやったり」等の文字(スクリーン)
  for(const f of floats){ ctx.globalAlpha=Math.max(0,f.life); ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(-0.03);
    ctx.font=`900 ${f.big?42:24}px sans-serif`; ctx.textAlign='center'; ctx.lineWidth=8; ctx.strokeStyle=P.ink;
    ctx.strokeText(f.text,0,0); ctx.fillStyle=f.col; ctx.fillText(f.text,0,0); ctx.restore(); }
  ctx.globalAlpha=1;
  // テレポ ボタン
  if(state===S.PLAY) drawTele();
  if(msgT>0){ ctx.save(); ctx.translate(W/2,oy-24); ctx.font='900 30px sans-serif'; ctx.textAlign='center';
    ctx.lineWidth=7; ctx.strokeStyle=P.ink; ctx.strokeText(msg,0,0); ctx.fillStyle=P.pop; ctx.fillText(msg,0,0); ctx.restore(); }
  if(flash>0){ ctx.fillStyle=`rgba(${flashCol},${flash*0.5})`; ctx.fillRect(0,0,W,H); }
}
function drawGridPerson(px,py,cell,color,angry){
  const r=cell*0.3; ctx.save(); ctx.translate(px,py+cell*0.08);
  ctx.strokeStyle=P.ink; ctx.lineWidth=Math.max(2,r*0.28); ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-r*0.4,r*0.5); ctx.lineTo(-r*0.4,r*1.1); ctx.moveTo(r*0.4,r*0.5); ctx.lineTo(r*0.4,r*1.1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r*0.7,r*0.6); ctx.quadraticCurveTo(-r*0.8,-r*0.3,0,-r*0.4);
  ctx.quadraticCurveTo(r*0.8,-r*0.3,r*0.7,r*0.6); ctx.quadraticCurveTo(0,r*0.8,-r*0.7,r*0.6);
  ctx.fillStyle=color; ctx.fill(); ctx.lineWidth=Math.max(2,r*0.2); ctx.strokeStyle=P.ink; ctx.stroke();
  ctx.beginPath(); ctx.arc(0,-r*0.7,r*0.55,0,7); ctx.fillStyle="#f0c29a"; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0,-r*0.8,r*0.57,Math.PI*1.05,Math.PI*1.95); ctx.fillStyle="#2b2320"; ctx.fill();
  ctx.fillStyle=P.ink; ctx.beginPath(); ctx.arc(-r*0.2,-r*0.72,r*0.1,0,7); ctx.arc(r*0.2,-r*0.72,r*0.1,0,7); ctx.fill();
  if(angry){ ctx.strokeStyle=P.ink; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-r*0.35,-r*0.95); ctx.lineTo(-r*0.1,-r*0.82); ctx.moveTo(r*0.35,-r*0.95); ctx.lineTo(r*0.1,-r*0.82); ctx.stroke(); }
  ctx.restore();
}
let teleBtn={x:0,y:0,r:0};
function drawTele(){ const r=Math.min(46,W*0.11); teleBtn={x:W-r-18, y:H-r-30, r};
  ctx.fillStyle=teleports>0?"#7b6cff":"#666"; ctx.strokeStyle=P.ink; ctx.lineWidth=4;
  ctx.beginPath(); ctx.arc(teleBtn.x,teleBtn.y,r,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#fff"; ctx.font='900 15px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText("テレポ",teleBtn.x,teleBtn.y-6); ctx.fillText("×"+teleports,teleBtn.x,teleBtn.y+12); ctx.textBaseline="alphabetic"; }

function update(dt){
  freeze=Math.max(0,freeze-dt);
  const adt = freeze>0 ? dt*0.12 : dt;   // 相打ちの瞬間だけスロー(快感の"溜め")
  shake*=Math.pow(0.002,dt); if(shake<0.3)shake=0; flash=Math.max(0,flash-dt*2.2); msgT=Math.max(0,msgT-dt);
  for(let i=parts.length-1;i>=0;i--){ const p=parts[i]; p.vy+=700*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt*1.6; if(p.life<=0) parts.splice(i,1); }
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.y+=f.vy*dt; f.vy*=0.9; f.life-=dt*(f.big?0.8:1.5); if(f.life<=0) floats.splice(i,1); }
  if(phase==='anim'){ animT += adt/ANIMDUR; if(animT>=1){ animT=1; resolveEnd(); } }
}

// 入力
function onDown(e){ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back'))) return;
  if(state!==S.PLAY) return; e.preventDefault();
  const px=e.clientX, py=e.clientY;
  if(Math.hypot(px-teleBtn.x,py-teleBtn.y)<=teleBtn.r){ teleport(); return; }
  const gx=Math.floor((px-ox)/cell), gy=Math.floor((py-oy)/cellY);
  if(gx===player.x&&gy===player.y){ tryMove(player.x,player.y); return; } // 待つ
  tryMove(gx,gy);
}
addEventListener('pointerdown',onDown,{passive:false});
document.getElementById('startBtn').addEventListener('click',e=>{e.stopPropagation();start();});
document.getElementById('retryBtn').addEventListener('click',e=>{e.stopPropagation();start();});

let tPrev=performance.now();
function frame(now){ const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; update(dt);
  if(W===0) resize(); draw(); requestAnimationFrame(frame); }
resize(); requestAnimationFrame(frame);

// ── テスト用フック(ロジック検証。実機描画を見られないため) ──
window.__nige = {
  setup(pl, purs, jk){ state=S.PLAY; phase='idle'; player={x:pl[0],y:pl[1],fx:pl[0],fy:pl[1]}; pursuers=purs.map(p=>({x:p[0],y:p[1]})); junks=new Set((jk||[]).map(a=>a[0]+","+a[1])); },
  // テストは手番を同期で完了させる(実機はアニメ後に resolveEnd)
  move(nx,ny){ tryMove(nx,ny); if(phase==='anim'){ animT=1; resolveEnd(); } return this.snap(); },
  snap(){ return { state, phase, player:{x:player.x,y:player.y}, pursuers:pursuers.map(p=>({x:p.x,y:p.y})), junks:[...junks], level, teleports }; }
};
})();
