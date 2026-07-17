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
let level=1, teleports=2, survived=0, msg="", msgT=0, shake=0, flash=0;
let player={x:0,y:0}, pursuers=[], junks=new Set();
let anim=0; // 手番アニメ用

// 盤の画面配置
let cell=40, ox=0, oy=0;
function layout(){ const availW=W-24, availH=H*0.72; cell=Math.floor(Math.min(availW/COLS, availH/ROWS));
  ox=Math.floor((W-cell*COLS)/2); oy=Math.floor(H*0.16); }

const key=(x,y)=>x+","+y;
const inGrid=(x,y)=>x>=0&&x<COLS&&y>=0&&y<ROWS;
const isJunk=(x,y)=>junks.has(key(x,y));
const pursuerAt=(x,y)=>pursuers.some(p=>p.x===x&&p.y===y);
const sign=v=>v>0?1:v<0?-1:0;

function emptyCells(){ const out=[]; for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(isJunk(x,y)||pursuerAt(x,y)||(player.x===x&&player.y===y)) continue; out.push({x,y}); } return out; }

function startLevel(lv){
  level=lv; teleports=2; junks=new Set(); pursuers=[]; msg=""; msgT=0;
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

// ── 手番の芯(ロジック)。テストで検証する ──
// 戻り値: {caught, cleared, crashed}
function resolveTurn(){
  // しつこいやつが1歩 プレイヤーへ(8方向・貪欲)
  const moved=pursuers.map(p=>{ const nx=p.x+sign(player.x-p.x), ny=p.y+sign(player.y-p.y); return {x:nx,y:ny}; });
  // 目的地ごとに集計
  const cnt={}; for(const m of moved){ const k=key(m.x,m.y); cnt[k]=(cnt[k]||0)+1; }
  let caught=false, crashed=0; const survivors=[];
  for(const m of moved){
    if(m.x===player.x && m.y===player.y) caught=true;
    const k=key(m.x,m.y);
    if(cnt[k]>=2 || isJunk(m.x,m.y)){ junks.add(k); crashed++; } // 相打ち or がれきに突っ込む
    else survivors.push(m);
  }
  pursuers=survivors;
  const cleared = pursuers.length===0;
  return {caught, cleared, crashed};
}

function afterTurn(res){
  if(res.crashed>0){ Y.sfx.hit(); flash=0.25; }
  if(res.caught){ over(false); return; }
  if(res.cleared){ Y.sfx.good(); Y.say("よし つぎ！",{char:'niisan',interrupt:true});
    survived++; msg="かい "+(level+1)+"！"; msgT=1.4; startLevel(level+1); updHud(); return; }
  updHud();
}

function tryMove(nx,ny){
  if(state!==S.PLAY) return;
  // となり(自分含む)・盤内・がれき/しつこいやつが居ない
  if(!inGrid(nx,ny)) return;
  if(Math.max(Math.abs(nx-player.x),Math.abs(ny-player.y))>1) return; // となりのみ
  if(isJunk(nx,ny)||pursuerAt(nx,ny)) return;
  player.x=nx; player.y=ny; anim=1;
  afterTurn(resolveTurn());
}
function teleport(){
  if(state!==S.PLAY || teleports<=0) return;
  const e=emptyCells(); if(!e.length) return;
  const c=e[(Math.random()*e.length)|0]; player.x=c.x; player.y=c.y; teleports--; anim=1;
  Y.say("てれぽ",{char:'chibi',interrupt:true});
  afterTurn(resolveTurn());
}

function over(win){ state=S.OVER;
  document.getElementById('goTitle').textContent = win?"にげきった！":"つかまった";
  document.getElementById('goSub').textContent = "かい "+level+" まで";
  document.getElementById('goMsg').textContent = "ぶつけ合わせが うまいと 先へ進める。";
  Y.sfx.bad(); if(!win) Y.say("つかまえたー",{char:'ossan',interrupt:true});
  document.getElementById('hud').classList.add('hidden'); document.getElementById('gameover').classList.remove('hidden'); }

function updHud(){ document.getElementById('lv').textContent=level; document.getElementById('left').textContent=pursuers.length; }

// ── 描画 ──
function cx(x){ return ox+x*cell+cell/2; } function cy(y){ return oy+y*cell+cell/2; }
function draw(){
  ctx.save(); let sx=0,sy=0; if(shake>0){ sx=(Math.random()*2-1)*shake; sy=(Math.random()*2-1)*shake; } ctx.translate(sx,sy);
  ctx.fillStyle="#e7e0cf"; ctx.fillRect(-20,-20,W+40,H+40);
  // 盤
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ ctx.fillStyle=(x+y)%2?"#ded5bf":"#e9e1cd";
    ctx.fillRect(ox+x*cell,oy+y*cell,cell,cell); }
  ctx.strokeStyle="rgba(0,0,0,.12)"; ctx.lineWidth=1;
  for(let x=0;x<=COLS;x++){ ctx.beginPath(); ctx.moveTo(ox+x*cell,oy); ctx.lineTo(ox+x*cell,oy+ROWS*cell); ctx.stroke(); }
  for(let y=0;y<=ROWS;y++){ ctx.beginPath(); ctx.moveTo(ox,oy+y*cell); ctx.lineTo(ox+COLS*cell,oy+y*cell); ctx.stroke(); }
  ctx.strokeStyle=P.ink; ctx.lineWidth=5; ctx.strokeRect(ox,oy,COLS*cell,ROWS*cell);

  if(state===S.PLAY){ // 動けるマスを薄く光らせる
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const nx=player.x+dx, ny=player.y+dy;
      if(!inGrid(nx,ny)||isJunk(nx,ny)||pursuerAt(nx,ny)) continue;
      ctx.fillStyle="rgba(255,210,62,.35)"; ctx.fillRect(ox+nx*cell+2,oy+ny*cell+2,cell-4,cell-4); } }

  // がれき(ぶつかって伸びた山)
  for(const k of junks){ const [x,y]=k.split(",").map(Number);
    ctx.fillStyle="#8a94a6"; ctx.strokeStyle=P.ink; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(cx(x)-cell*0.34,cy(y)+cell*0.28); ctx.quadraticCurveTo(cx(x),cy(y)-cell*0.3,cx(x)+cell*0.34,cy(y)+cell*0.28); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // しつこいやつ(赤い人)
  for(const p of pursuers) drawGridPerson(cx(p.x),cy(p.y),cell,"#d64b3a",true);
  // あなた(ピンクの人)
  drawGridPerson(cx(player.x),cy(player.y),cell,"#ff2d6b",false);

  ctx.restore();
  // テレポ ボタン
  if(state===S.PLAY) drawTele();
  if(msgT>0){ ctx.save(); ctx.translate(W/2,oy-24); ctx.font='900 30px sans-serif'; ctx.textAlign='center';
    ctx.lineWidth=7; ctx.strokeStyle=P.ink; ctx.strokeText(msg,0,0); ctx.fillStyle=P.pop; ctx.fillText(msg,0,0); ctx.restore(); }
  if(flash>0){ ctx.fillStyle=`rgba(255,240,120,${flash*0.5})`; ctx.fillRect(0,0,W,H); }
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

function update(dt){ anim=Math.max(0,anim-dt*4); shake*=Math.pow(0.002,dt); if(shake<0.3)shake=0; flash=Math.max(0,flash-dt*2); msgT=Math.max(0,msgT-dt); }

// 入力
function onDown(e){ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back'))) return;
  if(state!==S.PLAY) return; e.preventDefault();
  const px=e.clientX, py=e.clientY;
  if(Math.hypot(px-teleBtn.x,py-teleBtn.y)<=teleBtn.r){ teleport(); return; }
  const gx=Math.floor((px-ox)/cell), gy=Math.floor((py-oy)/cell);
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
  setup(pl, purs, jk){ state=S.PLAY; player={x:pl[0],y:pl[1]}; pursuers=purs.map(p=>({x:p[0],y:p[1]})); junks=new Set((jk||[]).map(a=>a[0]+","+a[1])); },
  move(nx,ny){ tryMove(nx,ny); return this.snap(); },
  snap(){ return { state, player:{...player}, pursuers:pursuers.map(p=>({...p})), junks:[...junks], level, teleports }; },
  resolve(){ return resolveTurn(); }
};
})();
