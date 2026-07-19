"use strict";
(function(){
// 実機で万一エラーが出たら画面に出す(こちらで描画確認できないため)
addEventListener('error',e=>{ let d=document.getElementById('err'); if(!d){ d=document.createElement('div'); d.id='err';
  d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d);} d.textContent='ERR: '+(e.message||e); });

/* =====================================================================
   かっとばし ― 打ち返してブロックを崩す(野田ゲー版ブロック崩し)。
   面白さの芯: ①玉を落とさないギリギリ ②当てた位置で角度を狙うagency
   ③黄「＋」を崩すと玉が増える等、自分の狙いで起こせる大あばれ(意外)。
   ===================================================================== */
const Y=window.Yokocho, D=Y.draw, P=Y.PALETTE;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){ DPR=Math.min(window.devicePixelRatio||1,2.5); W=innerWidth; H=innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); layoutPaddle(); }
addEventListener('resize',resize);

const S={TITLE:0,SERVE:1,PLAY:2,CLEAR:3,OVER:4,STAGES:5}; let state=S.TITLE;
let stage=1, stageDef=null, wave=1, life=3, score=0, combo=0, comboMax=0, specialRate=0.08;
let baseSpd=380, clearT=0, serveT=0;
const paddle={x:0,y:0,w:120,h:16,tx:0};
let balls=[], blocks=[];
let shake=0, flash=0, flashCol='255,255,255';
const floats=[], puffs=[];

const BTYPE={
  normal:{color:"#4f86c6", hp:1},
  warm:{color:"#ff8a3d", hp:1},
  cool:{color:"#4fae8f", hp:1},
  tough:{color:"#9a8", hp:2},   // 2発
  plus:{color:"#ffd23e", hp:1}, // 崩すと玉増殖
  run:{color:"#d96fae", hp:1},  // 横に逃げる
};

// ブロックの配置パターン(セルを埋めるか判定)。ステージ/かい ごとに切り替えて多彩に。
const PATTERNS=[
  {name:"びっしり", fn:()=>true },
  {name:"ちどり",   fn:(r,c)=>(r+c)%2===0 },
  {name:"たてじま", fn:(r,c)=>c%2===0 },
  {name:"よこじま", fn:(r,c)=>r%2===0 },
  {name:"やま",     fn:(r,c,rows,cols)=>Math.abs(c-(cols-1)/2) <= (r+1)/rows*((cols-1)/2)+0.5 },
  {name:"さかやま", fn:(r,c,rows,cols)=>Math.abs(c-(cols-1)/2) <= (rows-r)/rows*((cols-1)/2)+0.5 },
  {name:"ひしがた", fn:(r,c,rows,cols)=>Math.abs(r-(rows-1)/2)/(rows/2)+Math.abs(c-(cols-1)/2)/(cols/2) <= 1.05 },
  {name:"わく",     fn:(r,c,rows,cols)=>r===0||r===rows-1||c===0||c===cols-1||r===((rows-1)>>1) },
  {name:"あなあき", fn:()=>Math.random()<0.7 },
  {name:"だんだん", fn:(r,c,rows,cols)=>c <= Math.floor((r+1)/rows*cols) },
];
// ステージ(選べる)。番号が大きいほど 速く・多く・変則。pat=初回パターンの起点。
const STAGES=[
  {name:"きほん",   pat:0, spd:330, sp:0.05, rows:4},
  {name:"ちどり",   pat:1, spd:350, sp:0.07, rows:4},
  {name:"やまのぼり",pat:4, spd:365, sp:0.08, rows:5},
  {name:"すきま",   pat:2, spd:380, sp:0.10, rows:5},
  {name:"しましま", pat:3, spd:395, sp:0.11, rows:5},
  {name:"ひしがた", pat:6, spd:410, sp:0.12, rows:6},
  {name:"あなあき", pat:8, spd:430, sp:0.13, rows:6},
  {name:"わくわく", pat:7, spd:450, sp:0.14, rows:6},
  {name:"ぎっしり", pat:0, spd:485, sp:0.18, rows:7},
];
const STORE="katobashi.best";
function bests(){ try{ return JSON.parse(localStorage.getItem(STORE)||"{}")||{}; }catch(e){ return {}; } }
function saveBest(st,w){ try{ const b=bests(); if(w>(b[st]||0)){ b[st]=w; localStorage.setItem(STORE,JSON.stringify(b)); } }catch(e){} }

function layoutPaddle(){ paddle.w=Math.max(96,Math.min(150,W*0.30)); paddle.h=16; paddle.y=H*0.86;
  if(!paddle.x){ paddle.x=W/2; paddle.tx=W/2; } }

function startStage(n){
  Y.audio.resume(); stage=n; stageDef=STAGES[n-1]||STAGES[0]; wave=1; life=3; score=0; combo=0; comboMax=0;
  blocks=[]; balls=[]; layoutPaddle(); paddle.x=W/2; paddle.tx=W/2;
  document.getElementById('title').classList.add('hidden');
  document.getElementById('stages').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('hint').classList.remove('hidden');
  buildWave(); serveBall(); updHud();
}
function reset(){ startStage(stage); }   // 現ステージを最初から

function buildWave(){
  blocks=[];
  // このかいの 速度・特殊率(ステージ基準＋かいで上昇)
  baseSpd=(stageDef?stageDef.spd:340)+(wave-1)*20;
  specialRate=(stageDef?stageDef.sp:0.08)+(wave-1)*0.01;
  const cols=6, rows=Math.min((stageDef?stageDef.rows:4)+Math.floor((wave-1)/2),7);
  const patIdx=((stageDef?stageDef.pat:0)+(wave-1))%PATTERNS.length, pat=PATTERNS[patIdx].fn;
  const mx=14, gap=6, top=H*0.12, bw=(W-mx*2-gap*(cols-1))/cols, bh=24;
  const palette=['warm','cool','normal'];
  for(let r=0;r<rows;r++){ for(let c=0;c<cols;c++){
    if(!pat(r,c,rows,cols)) continue;
    let type=palette[(r+c)%palette.length];
    const roll=Math.random();
    if(roll<specialRate) type='plus';
    else if(roll<specialRate+0.08) type='tough';
    else if(roll<specialRate+0.14 && stage>=2) type='run';
    const t=BTYPE[type];
    blocks.push({ x:mx+c*(bw+gap), y:top+r*(bh+gap), w:bw, h:bh, hp:t.hp, maxhp:t.hp, type, color:t.color,
      alive:true, vx: type==='run'? (Math.random()<0.5?-1:1)*40 : 0, wob:Math.random()*6 });
  }}
  if(!blocks.length){ for(let c=0;c<cols;c++){ const t=BTYPE.normal;   // 空パターン回避
    blocks.push({x:mx+c*(bw+gap),y:top,w:bw,h:bh,hp:1,maxhp:1,type:'normal',color:t.color,alive:true,vx:0,wob:0}); } }
}

function serveBall(){ state=S.SERVE; serveT=0.7; combo=0;
  balls=[{ x:paddle.x, y:paddle.y-20, vx:0, vy:0, r:10, big:false, stuck:true, trail:[] }];
  Y.say("いくよ",{char:'narr',interrupt:true,rate:1.2}); }

function launch(){ const b=balls[0]; if(!b||!b.stuck) return; b.stuck=false;
  const ang=(Math.random()*0.5-0.25); b.vx=Math.sin(ang)*baseSpd; b.vy=-Math.abs(Math.cos(ang)*baseSpd); state=S.PLAY; }

function addBall(x,y,vx,vy,big){ if(balls.length>=7) return;
  balls.push({x,y,vx,vy,r:big?15:10,big:!!big,stuck:false,trail:[]}); }

function spd(){ return baseSpd; }
function renorm(b){ const s=spd(), m=Math.hypot(b.vx,b.vy); if(m>0){ b.vx=b.vx/m*s; b.vy=b.vy/m*s; } }

function hitPaddle(b){
  const off=Math.max(-1,Math.min(1,(b.x-paddle.x)/(paddle.w/2)));
  const ang=off*1.15;                     // 当てた位置で角度が変わる=狙える
  const s=spd();
  b.vx=Math.sin(ang)*s; b.vy=-Math.abs(Math.cos(ang)*s);
  b.y=paddle.y-b.r-0.5; combo=0; Y.sfx.kick();
}

function breakBlock(b){
  b.hp--;
  if(b.hp>0){ Y.audio.tone(360,0.04,'square',0.15); return; }
  b.alive=false; combo++; if(combo>comboMax)comboMax=combo;
  const gain=100*Math.max(1,combo); score+=gain;
  puff(b.x+b.w/2,b.y+b.h/2,b.color);
  Y.audio.noise(0.05,0.35,null,1200); Y.audio.tone(520+combo*20,0.05,'triangle',0.18);
  if(combo>=3){ addFloat(b.x+b.w/2,b.y,"x"+combo,P.pop,combo>=6); if(combo%3===0) Y.say(["いいね","のってきた","うまい"][combo%3],{char:'niisan',interrupt:true}); }
  if(b.type==='plus'){ // 玉が増える大あばれ
    addBall(b.x+b.w/2,b.y+b.h,  spd()*0.5, spd()*0.5*-1, false);
    addBall(b.x+b.w/2,b.y+b.h, -spd()*0.5, spd()*0.5*-1, false);
    addFloat(b.x+b.w/2,b.y-6,"ふえた！",'#ffd23e',true); flash=0.25; flashCol='255,230,120'; shake=8;
    Y.say("ふえた！",{char:'neesan',interrupt:true});
  }
  updHud();
}

function update(dt){
  shake*=Math.pow(0.002,dt); if(shake<0.3)shake=0; flash=Math.max(0,flash-dt*2.2);
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.y+=f.vy*dt; f.vy*=0.9; f.life-=dt*(f.big?0.9:1.6); if(f.life<=0) floats.splice(i,1); }
  for(let i=puffs.length-1;i>=0;i--){ const p=puffs[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=400*dt; p.life-=dt*2; if(p.life<=0) puffs.splice(i,1); }
  // 板は指へ追従
  paddle.x += (paddle.tx-paddle.x)*Math.min(1,dt*18);
  paddle.x=Math.max(paddle.w/2, Math.min(W-paddle.w/2, paddle.x));
  // 逃げブロック
  for(const bl of blocks){ if(bl.alive && bl.vx){ bl.x+=bl.vx*dt;
    if(bl.x<10){ bl.x=10; bl.vx*=-1; } if(bl.x+bl.w>W-10){ bl.x=W-10-bl.w; bl.vx*=-1; } } }

  if(state===S.SERVE){ if(!balls[0]){ serveBall(); return; } serveT-=dt; balls[0].x=paddle.x; balls[0].y=paddle.y-20; if(serveT<=0) launch(); return; }
  if(state===S.CLEAR){ clearT-=dt; if(clearT<=0){ wave++; buildWave(); serveBall(); updHud(); } return; }
  if(state!==S.PLAY) return;

  for(let i=balls.length-1;i>=0;i--){
    const b=balls[i];
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>6) b.trail.shift();
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    // 壁
    if(b.x-b.r<6){ b.x=6+b.r; b.vx=Math.abs(b.vx); Y.sfx.hat(); }
    if(b.x+b.r>W-6){ b.x=W-6-b.r; b.vx=-Math.abs(b.vx); Y.sfx.hat(); }
    if(b.y-b.r<H*0.06){ b.y=H*0.06+b.r; b.vy=Math.abs(b.vy); Y.sfx.hat(); }
    // 板
    if(b.vy>0 && b.y+b.r>=paddle.y-paddle.h/2 && b.y-b.r<paddle.y+paddle.h/2 && Math.abs(b.x-paddle.x)<=paddle.w/2+b.r){
      hitPaddle(b);
    }
    // ブロック
    for(const bl of blocks){ if(!bl.alive) continue;
      if(b.x+b.r>bl.x && b.x-b.r<bl.x+bl.w && b.y+b.r>bl.y && b.y-b.r<bl.y+bl.h){
        const ox=Math.min(b.x+b.r-bl.x, bl.x+bl.w-(b.x-b.r));
        const oy=Math.min(b.y+b.r-bl.y, bl.y+bl.h-(b.y-b.r));
        if(ox<oy){ b.vx*=-1; b.x += b.vx>0? ox:-ox; } else { b.vy*=-1; b.y += b.vy>0? oy:-oy; }
        breakBlock(bl); break;
      }
    }
    // 落下
    if(b.y-b.r>H+20){ balls.splice(i,1); }
  }

  // 玉どうしの衝突(重なったら はじく)
  for(let i=0;i<balls.length;i++){ for(let j=i+1;j<balls.length;j++){
    const a=balls[i],b=balls[j], dx=b.x-a.x, dy=b.y-a.y, rr=a.r+b.r, d2=dx*dx+dy*dy;
    if(d2>0.0001 && d2<rr*rr){ const d=Math.sqrt(d2), nx=dx/d, ny=dy/d, push=(rr-d)/2;
      a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;   // めり込み解消
      const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(rel<0){ a.vx+=rel*nx; a.vy+=rel*ny; b.vx-=rel*nx; b.vy-=rel*ny; renorm(a); renorm(b);
        Y.audio.tone(300,0.03,'square',0.12); } }
  }}

  // 玉ぜんぶ落ちた
  if(balls.length===0){ life--; updHud();
    if(life<=0){ over(); } else { shake=10; flash=0.3; flashCol='255,80,90'; Y.sfx.bad(); Y.say(["あー","おしい","落とした"][life%3],{char:'ossan',interrupt:true}); serveBall(); }
    return;
  }
  // 全崩し
  if(!blocks.some(bl=>bl.alive)){ state=S.CLEAR; clearT=1.3; flash=0.3; flashCol='255,240,120';
    addFloat(W/2,H*0.5,"クリア！",P.pop,true); Y.sfx.good(); Y.say("よし つぎ！",{char:'niisan',interrupt:true}); }
}

function over(){ state=S.OVER; saveBest(stage,wave);
  document.getElementById('goTitle').textContent = wave>=6?"かっとばし名人！":"おとした！";
  document.getElementById('goSub').textContent = score+" てん（ステージ"+stage+"・"+wave+"かい・コンボ"+comboMax+"）";
  document.getElementById('goMsg').textContent = comboMax>=8?"すごい連鎖だった。":"板から 目を はなすな。";
  Y.say(wave>=5?"おみごと":"おーわりっ",{char:'ossan',interrupt:true});
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('gameover').classList.remove('hidden'); }

function addFloat(x,y,text,col,big){ floats.push({x,y,text,col,big:!!big,life:1,vy:-42}); }
function puff(x,y,col){ for(let i=0;i<7;i++){ const a=Math.random()*7,s=40+Math.random()*120;
  puffs.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-60,life:1,col}); } shake=Math.max(shake,5); }
function updHud(){ const w=document.getElementById('stageNum'),l=document.getElementById('life');
  if(w)w.textContent=stage; if(l)l.textContent=life; }

// ── 描画 ──
function draw(){
  ctx.save(); let sx=0,sy=0; if(shake>0){ sx=(Math.random()*2-1)*shake; sy=(Math.random()*2-1)*shake; } ctx.translate(sx,sy);
  // 背景(道場っぽい淡い)
  const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,"#bfe3f2"); bg.addColorStop(1,"#e9ddc2");
  ctx.fillStyle=bg; ctx.fillRect(-20,-20,W+40,H+40);
  // 天井ライン
  ctx.strokeStyle="rgba(0,0,0,.18)"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(0,H*0.06); ctx.lineTo(W,H*0.06); ctx.stroke();

  if(state!==S.TITLE){
    // ブロック
    for(const bl of blocks){ if(!bl.alive) continue; drawBlock(bl); }
    // 板(人が持つ台)
    drawPaddle();
    // 玉
    for(const b of balls) drawBall(b);
    // 破片
    for(const p of puffs){ ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.col;
      ctx.beginPath(); ctx.arc(p.x,p.y,4,0,7); ctx.fill(); } ctx.globalAlpha=1;

    if(state===S.SERVE){ ctx.fillStyle=P.ink; ctx.font='900 20px sans-serif'; ctx.textAlign='center';
      ctx.fillText("いくよ…", W/2, H*0.5); }
  }
  // 飛び文字
  for(const f of floats){ ctx.globalAlpha=Math.max(0,f.life); ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(-0.04);
    ctx.font=`900 ${f.big?46:26}px sans-serif`; ctx.textAlign='center'; ctx.lineWidth=7; ctx.strokeStyle=P.ink;
    ctx.strokeText(f.text,0,0); ctx.fillStyle=f.col; ctx.fillText(f.text,0,0); ctx.restore(); }
  ctx.globalAlpha=1;
  ctx.restore();
  if(flash>0){ ctx.fillStyle=`rgba(${flashCol},${flash*0.5})`; ctx.fillRect(0,0,W,H); }
}
function drawBlock(bl){
  const cracked=bl.hp<bl.maxhp;
  ctx.save(); ctx.translate(bl.x,bl.y);
  ctx.beginPath(); ctx.roundRect(0,0,bl.w,bl.h,6);
  const g=ctx.createLinearGradient(0,0,0,bl.h); g.addColorStop(0,shade(bl.color,0.25)); g.addColorStop(1,shade(bl.color,-0.18));
  ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=P.ink; ctx.stroke();
  if(bl.type==='plus'){ ctx.strokeStyle=P.ink; ctx.lineWidth=4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(bl.w/2-7,bl.h/2); ctx.lineTo(bl.w/2+7,bl.h/2); ctx.moveTo(bl.w/2,bl.h/2-7); ctx.lineTo(bl.w/2,bl.h/2+7); ctx.stroke(); }
  else if(bl.type==='run'){ ctx.fillStyle=P.ink; ctx.beginPath(); ctx.arc(bl.w*0.4,bl.h*0.5,2,0,7); ctx.arc(bl.w*0.6,bl.h*0.5,2,0,7); ctx.fill(); }
  else if(bl.type==='tough'){ ctx.fillStyle="rgba(0,0,0,.35)"; ctx.font='900 13px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText("かたい",bl.w/2,bl.h/2); ctx.textBaseline='alphabetic'; }
  if(cracked){ ctx.strokeStyle="rgba(0,0,0,.4)"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(bl.w*0.3,2); ctx.lineTo(bl.w*0.5,bl.h*0.6); ctx.lineTo(bl.w*0.4,bl.h-2); ctx.stroke(); }
  ctx.restore();
}
function drawPaddle(){
  const x=paddle.x,y=paddle.y,w=paddle.w,h=paddle.h;
  // 台(木の板)
  ctx.save(); ctx.translate(x,y);
  ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h/2);
  const g=ctx.createLinearGradient(0,-h/2,0,h/2); g.addColorStop(0,"#c99a55"); g.addColorStop(1,"#8a6a3a");
  ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle=P.ink; ctx.stroke();
  // 小さい持ち手の人(頭だけのぞく)
  ctx.beginPath(); ctx.arc(0,h/2+16,15,0,7); ctx.fillStyle="#f0c29a"; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=P.ink; ctx.stroke();
  ctx.beginPath(); ctx.arc(0,h/2+13,16,Math.PI*1.05,Math.PI*1.95); ctx.fillStyle="#3a2a1a"; ctx.fill();
  ctx.fillStyle=P.ink; ctx.beginPath(); ctx.arc(-5,h/2+16,2,0,7); ctx.arc(5,h/2+16,2,0,7); ctx.fill();
  ctx.restore();
}
function drawBall(b){
  for(let i=0;i<b.trail.length;i++){ const t=b.trail[i]; ctx.globalAlpha=(i/b.trail.length)*0.25;
    ctx.fillStyle="#d64b3a"; ctx.beginPath(); ctx.arc(t.x,t.y,b.r*0.8,0,7); ctx.fill(); }
  ctx.globalAlpha=1;
  ctx.save(); ctx.translate(b.x,b.y);
  ctx.beginPath(); ctx.arc(0,0,b.r,0,7);
  const g=ctx.createRadialGradient(-b.r*0.3,-b.r*0.3,b.r*0.2,0,0,b.r);
  g.addColorStop(0,"#ff7a5a"); g.addColorStop(1,"#c33a28"); ctx.fillStyle=g; ctx.fill();
  ctx.lineWidth=2.5; ctx.strokeStyle=P.ink; ctx.stroke();
  ctx.fillStyle=P.ink; ctx.beginPath(); ctx.arc(-b.r*0.3,-b.r*0.1,b.r*0.16,0,7); ctx.arc(b.r*0.3,-b.r*0.1,b.r*0.16,0,7); ctx.fill();
  ctx.restore();
}
function shade(hex,amt){ let h=hex.replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join('');
  let r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  const f=amt<0?0:255,t=Math.abs(amt); r=Math.round(r+(f-r)*t); g=Math.round(g+(f-g)*t); b=Math.round(b+(f-b)*t);
  return `rgb(${r},${g},${b})`; }

// ステージ選択(すみません方式)
function buildStages(){ const g=document.getElementById('stgrid'); g.innerHTML="";
  const b=bests();
  STAGES.forEach((s,i)=>{ const n=i+1; const el=document.createElement('div'); el.className="stg";
    el.innerHTML='<div class="no">'+n+'</div>'+s.name + (b[n]?'<div class="bw">さいこう '+b[n]+'かい</div>':'<small>&nbsp;</small>');
    el.addEventListener('click',()=>startStage(n)); g.appendChild(el); });
}
function showStages(){ buildStages();
  document.getElementById('title').classList.add('hidden'); document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('stages').classList.remove('hidden'); state=S.STAGES; }

// 入力: 下をなぞって板を動かす。タップで発射も。
function setT(e){ const px=(e.touches?e.touches[0].clientX:e.clientX); paddle.tx=px; }
addEventListener('pointerdown',e=>{ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back')||t.closest('.stg'))) return;
  if(state!==S.PLAY && state!==S.SERVE) return;
  e.preventDefault(); setT(e); if(state===S.SERVE) launch(); },{passive:false});
addEventListener('pointermove',e=>{ if(state===S.PLAY||state===S.SERVE){ setT(e); } },{passive:false});
document.getElementById('toStages').addEventListener('click',e=>{e.stopPropagation(); Y.audio.resume(); showStages(); });
document.getElementById('backStages').addEventListener('click',e=>{e.stopPropagation(); showStages(); });
document.getElementById('retryBtn').addEventListener('click',e=>{e.stopPropagation(); reset(); });

resize();
let tPrev=performance.now();
function frame(now){ const dt=Math.min(0.033,(now-tPrev)/1000); tPrev=now; update(dt); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// テスト用フック(描画経路も含めて検証できるように draw も公開)
window.__kato={
  snap(){ return {state,stage,wave,life,score,combo,balls:balls.length,alive:blocks.filter(b=>b.alive).length}; },
  start(n){ startStage(n||1); return this.snap(); },
  showStages(){ showStages(); return {state, buttons:document.querySelectorAll('#stgrid .stg').length}; },
  stagesCount(){ return STAGES.length; },
  patternsCount(){ return PATTERNS.length; },
  step(dt){ update(dt); return this.snap(); },
  draw(){ draw(); return true; },
  // 玉を任意状態に(検証用)
  setBall(i,o){ if(balls[i]) Object.assign(balls[i],o); return this.snap(); },
  addBall2(x,y,vx,vy){ addBall(x,y,vx,vy,false); return balls.length; },
  ballInfo(i){ const b=balls[i]; return b?{x:Math.round(b.x),y:Math.round(b.y),vx:Math.round(b.vx),vy:Math.round(b.vy),stuck:b.stuck}:null; },
  firstAlive(){ const bl=blocks.find(b=>b.alive); return bl?{x:bl.x,y:bl.y,w:bl.w,h:bl.h,type:bl.type,hp:bl.hp}:null; },
  clearBlocks(){ blocks.forEach(b=>b.alive=false); },
  paddleTo(x){ paddle.x=x; paddle.tx=x; },
  killBalls(){ balls.length=0; },
};
})();
