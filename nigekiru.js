"use strict";
(function(){
addEventListener('error',e=>{ let d=document.getElementById('err'); if(!d){ d=document.createElement('div'); d.id='err';
  d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d);} d.textContent='ERR: '+(e.message||e); });

/* =====================================================================
   にげきる ― グリッド/目盛り撤廃。リアルタイムに逃げて、追っ手を
   岩や 味方同士に ぶつけて 消す(してやったり)。机の上の立体フィールド。
   ===================================================================== */
const Y=window.Yokocho, P=Y.PALETTE;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){ DPR=Math.min(window.devicePixelRatio||1,2.5); W=innerWidth; H=innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); layout(); }
addEventListener('resize',resize);

// フィールド(机の上のマット)。画面いっぱい。目盛りは無い。
let fx=0,fy=0,fw=0,fh=0,TH=20;
function layout(){ fw=W-20; fh=Math.floor(H*0.68); fx=10; fy=Math.floor(H*0.14); TH=Math.max(16,fw*0.03); }

const R_PL=17, R_PU=15;                 // 見た目/当たりの半径
const PLAYER_SPD=270;                    // 自分は速い
let level=1, PURSUER_SPD=150;            // 追っ手は明確に遅い(=難易度低め)
const S={TITLE:0,PLAY:1,OVER:2}; let state=S.TITLE;
let score=0, combo=0, shake=0, flash=0, flashCol='255,240,120', freeze=0, grace=0, msg="", msgT=0;
let waving=false, waveT=0;               // クリア→次waveまでの間
let player={x:0,y:0,tx:0,ty:0,mv:0}, pursuers=[], rocks=[], parts=[], floats=[];
let dragging=false;

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function shade(hex,amt){ const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  if(amt>=0){ r+=(255-r)*amt; g+=(255-g)*amt; b+=(255-b)*amt; } else { const f=1+amt; r*=f; g*=f; b*=f; }
  return 'rgb('+(r|0)+','+(g|0)+','+(b|0)+')'; }

function farFromPlayer(x,y,d){ return Math.hypot(x-player.x,y-player.y)>d; }
function startLevel(lv){
  level=lv; PURSUER_SPD=140+lv*10; grace=1.3; combo=0; waving=false; waveT=0; parts.length=0; floats.length=0;
  player.x=fx+fw/2; player.y=fy+fh*0.7; player.tx=player.x; player.ty=player.y; player.mv=0;
  // 岩(ぶつける的)
  rocks=[]; const nR=3+((lv/2)|0);
  let g=0; while(rocks.length<nR && g++<400){ const x=fx+40+Math.random()*(fw-80), y=fy+40+Math.random()*(fh-80);
    if(!farFromPlayer(x,y,120)) continue; if(rocks.some(r=>Math.hypot(r.x-x,r.y-y)<70)) continue;
    rocks.push({x,y,r:16+Math.random()*8}); }
  // 追っ手
  pursuers=[]; const nP=2+lv; g=0;
  while(pursuers.length<nP && g++<400){ const x=fx+30+Math.random()*(fw-60), y=fy+30+Math.random()*(fh-60);
    if(!farFromPlayer(x,y,180)) continue; if(rocks.some(r=>Math.hypot(r.x-x,r.y-y)<40)) continue;
    pursuers.push({x,y,vx:0,vy:0}); }
}
function start(){ Y.audio.resume(); state=S.PLAY; score=0; startLevel(1); updHud();
  document.getElementById('title').classList.add('hidden'); document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden'); document.getElementById('hint').classList.remove('hidden'); }
function over(){ state=S.OVER;
  document.getElementById('goTitle').textContent="つかまった";
  document.getElementById('goSub').textContent="かい "+level+"・スコア "+score;
  document.getElementById('goMsg').textContent="岩や 味方に ぶつけて 減らそう。";
  Y.sfx.bad(); Y.say("つかまえたー",{char:'ossan',interrupt:true});
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('gameover').classList.remove('hidden'); }
function updHud(){ document.getElementById('lv').textContent=level; document.getElementById('left').textContent=pursuers.length; }

// ── 更新 ──
function crash(x,y,n){ // n=まとめて消えた数
  for(let i=0;i<12;i++){ const a=(i/12)*6.28, sp=120+Math.random()*160; parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-60,life:1}); }
  score+=100*n; Y.sfx.hit(); flash=0.32; flashCol='255,240,120';
  if(n>=2){ combo++; shake=Math.max(shake,16); freeze=0.18; addFloat(x,y-30, n>=3?"してやったり！！":"してやったり！", P.pop, true);
    Y.say(["ナイス！","してやったり！","かかった！"][n%3],{char:'niisan',interrupt:true}); }
  else { shake=Math.max(shake,9); freeze=0.07; addFloat(x,y-24,"ドカッ",'#fff',false); Y.say(["あっ！","うわっ！"][(Math.random()*2)|0],{char:'chibi',interrupt:true}); }
  updHud();
}
function addFloat(x,y,text,col,big){ floats.push({x,y,text,col,big:!!big,life:1,vy:-46}); }

function update(dt){
  freeze=Math.max(0,freeze-dt); const wdt=freeze>0?dt*0.14:dt;
  shake*=Math.pow(0.002,dt); if(shake<0.3)shake=0; flash=Math.max(0,flash-dt*2.2); msgT=Math.max(0,msgT-dt);
  for(let i=parts.length-1;i>=0;i--){ const p=parts[i]; p.vy+=700*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt*1.6; if(p.life<=0) parts.splice(i,1); }
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.y+=f.vy*dt; f.vy*=0.9; f.life-=dt*(f.big?0.8:1.5); if(f.life<=0) floats.splice(i,1); }
  if(state!==S.PLAY) return;
  if(grace>0) grace-=dt;
  // クリアの余韻(次waveまで少し間を空ける)
  if(waving){ waveT-=dt; if(waveT<=0){ waving=false; startLevel(level+1); updHud(); return; } }

  // 自分: 指へ向けて上限速度で移動(瞬間移動しない=追っ手が迫れる緊張)
  const ddx=player.tx-player.x, ddy=player.ty-player.y, d=Math.hypot(ddx,ddy);
  if(d>1){ const s=Math.min(d, PLAYER_SPD*wdt); player.x+=ddx/d*s; player.y+=ddy/d*s; player.mv=Math.min(1,player.mv+wdt*4); }
  else player.mv=Math.max(0,player.mv-wdt*4);
  player.x=clamp(player.x,fx+R_PL,fx+fw-R_PL); player.y=clamp(player.y,fy+R_PL,fy+fh-R_PL);

  // 追っ手: 自分へホーミング＋弱い分離(すぐ団子にならない)
  for(const p of pursuers){ let hx=player.x-p.x, hy=player.y-p.y; const hl=Math.hypot(hx,hy)||1; hx/=hl; hy/=hl;
    let sx=0,sy=0; for(const q of pursuers){ if(q===p) continue; const dx=p.x-q.x, dy=p.y-q.y, dd=Math.hypot(dx,dy);
      if(dd>0 && dd<R_PU*3.2){ sx+=dx/dd*(1-dd/(R_PU*3.2)); sy+=dy/dd*(1-dd/(R_PU*3.2)); } }
    p.vx=hx*PURSUER_SPD + sx*70; p.vy=hy*PURSUER_SPD + sy*70;
    p.x+=p.vx*wdt; p.y+=p.vy*wdt;
    p.x=clamp(p.x,fx+R_PU,fx+fw-R_PU); p.y=clamp(p.y,fy+R_PU,fy+fh-R_PU); }

  // 岩に突っ込む→消える
  for(let i=pursuers.length-1;i>=0;i--){ const p=pursuers[i];
    for(const r of rocks){ if(Math.hypot(p.x-r.x,p.y-r.y) < R_PU+r.r){ pursuers.splice(i,1); crash(p.x,p.y,1); break; } } }
  // 追っ手どうし正面衝突→両方消える(まとめると してやったり)
  for(let i=0;i<pursuers.length;i++){ for(let j=i+1;j<pursuers.length;j++){ const a=pursuers[i], b=pursuers[j];
    if(Math.hypot(a.x-b.x,a.y-b.y) < R_PU*1.7){ const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
      pursuers.splice(j,1); pursuers.splice(i,1); crash(cx,cy,2); i--; break; } } }
  // 捕まった
  if(grace<=0){ for(const p of pursuers){ if(Math.hypot(p.x-player.x,p.y-player.y) < R_PU+R_PL*0.75){ over(); return; } } }

  if(pursuers.length===0 && !waving){ waving=true; waveT=1.4;   // ここで少し間を空ける
    Y.sfx.good(); Y.say("よし つぎ！",{char:'niisan',interrupt:true}); msg="クリア！"; msgT=1.5; }
}

// ── 描画(机の上の立体フィールド。目盛り無し) ──
// 丸くて可愛いゼリー。逃げる=にこっと慌て / 追う=こっちをロックオンした真剣プニ。
// 気持ち悪さゼロ、大きな目とツヤで「かわいい鬼ごっこ」に。
function drawCutie(x,y,color,kind){
  const R=R_PL*1.25, chase=(kind==='pursuer'), t=performance.now()*0.006;
  const ph=t*3 + x*0.05 + y*0.03;
  const sq=1 + Math.sin(ph)*0.08;         // ぷにぷに(縦伸び)
  const bob=Math.sin(ph)*R*0.06;
  // 影
  ctx.fillStyle="rgba(0,0,0,.20)"; ctx.beginPath(); ctx.ellipse(x,y,R*0.92,R*0.32,0,0,7); ctx.fill();
  const cy=y-R*0.80+bob;
  // 体(まる〜いゼリー)
  ctx.save(); ctx.translate(x,cy); ctx.scale(1/Math.sqrt(sq),sq);
  ctx.beginPath();
  ctx.moveTo(-R,R*0.15);
  ctx.bezierCurveTo(-R*1.06,-R*1.15, R*1.06,-R*1.15, R,R*0.15);
  ctx.bezierCurveTo(R*0.92,R*0.9, -R*0.92,R*0.9, -R,R*0.15);
  ctx.closePath();
  const g=ctx.createRadialGradient(-R*0.32,-R*0.55,R*0.2, 0,0,R*1.5);
  g.addColorStop(0,shade(color,0.42)); g.addColorStop(0.55,color); g.addColorStop(1,shade(color,-0.20));
  ctx.fillStyle=g; ctx.fill();
  ctx.lineWidth=Math.max(2.5,R*0.10); ctx.strokeStyle=shade(color,-0.5); ctx.stroke();
  // ツヤ
  ctx.fillStyle="rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(-R*0.38,-R*0.5,R*0.26,R*0.15,-0.5,0,7); ctx.fill();
  ctx.restore();
  // ── 顔(squashの影響を受けない素直な座標で) ──
  const fy=cy-R*0.08, dark="#2a2530";
  // 視線: 追う人はプレイヤーを、逃げる人は進む先を見る
  let lx=0, ly=0.2;
  if(chase){ const dx=player.x-x, dy=player.y-y, d=Math.hypot(dx,dy)||1; lx=dx/d; ly=dy/d; }
  else { const dx=player.tx-x, dy=player.ty-y, d=Math.hypot(dx,dy); if(d>6){ lx=dx/d; ly=dy/d; } }
  const eDX=R*0.40, eY=fy-R*0.06, eR=R*0.30;
  for(const s of [-1,1]){
    // 白目
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.ellipse(x+s*eDX,eY,eR,eR*1.12,0,0,7); ctx.fill();
    ctx.strokeStyle=shade(color,-0.5); ctx.lineWidth=1.6; ctx.stroke();
    // 瞳
    const px2=x+s*eDX+lx*eR*0.42, py2=eY+ly*eR*0.42, pr=eR*(chase?0.46:0.56);
    ctx.fillStyle=dark; ctx.beginPath(); ctx.arc(px2,py2,pr,0,7); ctx.fill();
    // キラッ
    ctx.fillStyle="rgba(255,255,255,.95)"; ctx.beginPath(); ctx.arc(px2-pr*0.35,py2-pr*0.4,pr*0.34,0,7); ctx.fill();
  }
  // ほっぺ(ぽわっ)
  ctx.fillStyle="rgba(255,120,150,.35)";
  ctx.beginPath(); ctx.ellipse(x-eDX*1.05,fy+R*0.28,R*0.16,R*0.10,0,0,7); ctx.ellipse(x+eDX*1.05,fy+R*0.28,R*0.16,R*0.10,0,0,7); ctx.fill();
  if(chase){
    // やる気まゆ(可愛い程度のハの字下げ)＋にっと口
    ctx.strokeStyle=dark; ctx.lineWidth=Math.max(2,R*0.08); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x-eDX-eR*0.5,eY-eR*1.05); ctx.lineTo(x-eDX+eR*0.35,eY-eR*0.8);
    ctx.moveTo(x+eDX+eR*0.5,eY-eR*1.05); ctx.lineTo(x+eDX-eR*0.35,eY-eR*0.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(x,fy+R*0.4,R*0.16,0.15*Math.PI,0.85*Math.PI); ctx.stroke(); // にっ
  } else {
    // 小さい丸口(ほへっ)
    ctx.fillStyle=dark; ctx.beginPath(); ctx.ellipse(x,fy+R*0.42,R*0.09,R*0.12,0,0,7); ctx.fill();
    // 汗ひとしずく(可愛い水色)
    ctx.fillStyle="#8ed6ff"; ctx.beginPath();
    ctx.moveTo(x+eDX*1.2,eY-eR*0.6); ctx.quadraticCurveTo(x+eDX*1.35,eY-eR*0.1,x+eDX*1.2,eY+eR*0.05);
    ctx.quadraticCurveTo(x+eDX*1.06,eY-eR*0.2,x+eDX*1.2,eY-eR*0.6); ctx.fill();
  }
}
function drawRock(x,y,r){
  ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x,y+r*0.4,r*1.15,r*0.5,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x-r,y+r*0.3); ctx.quadraticCurveTo(x-r*1.1,y-r*0.9,x,y-r*1.1); ctx.quadraticCurveTo(x+r*1.1,y-r*0.9,x+r,y+r*0.3); ctx.quadraticCurveTo(x,y+r*0.7,x-r,y+r*0.3);
  const rg=ctx.createLinearGradient(x-r,y-r,x+r,y+r); rg.addColorStop(0,"#a6a093"); rg.addColorStop(1,"#6f6a5e");
  ctx.fillStyle=rg; ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=3; ctx.stroke();
}
function draw(){
  ctx.save();   // 画面ゆれは廃止
  // 机
  const tg=ctx.createLinearGradient(0,-40,0,H+40); tg.addColorStop(0,'#8a6d47'); tg.addColorStop(1,'#584631'); ctx.fillStyle=tg; ctx.fillRect(-40,-40,W+80,H+80);
  // フィールドの影＋厚み＋マット
  ctx.fillStyle='rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(fx+fw/2+fw*0.02, fy+fh+TH+8, fw*0.56, fh*0.12, 0,0,7); ctx.fill();
  ctx.fillStyle="#8f7c58"; roundRect(fx,fy+fh-6,fw,TH+6,10); ctx.fill();
  const mg=ctx.createLinearGradient(0,fy,0,fy+fh); mg.addColorStop(0,'#c9d6b8'); mg.addColorStop(1,'#9db487'); ctx.fillStyle=mg;
  roundRect(fx,fy,fw,fh,14); ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=5; ctx.stroke();
  // 光沢(上明)
  const lg=ctx.createLinearGradient(0,fy,0,fy+fh); lg.addColorStop(0,'rgba(255,255,240,.18)'); lg.addColorStop(0.5,'rgba(255,255,240,0)'); lg.addColorStop(1,'rgba(0,0,0,.12)');
  ctx.save(); roundRect(fx,fy,fw,fh,14); ctx.clip(); ctx.fillStyle=lg; ctx.fillRect(fx,fy,fw,fh); ctx.restore();

  if(state===S.PLAY||state===S.OVER){
    // 岩
    for(const r of rocks) drawRock(r.x,r.y,r.r);
    // 人(奥→手前)。追っ手が近いと赤リング
    const list=pursuers.map(p=>({o:p,pl:false})); list.push({o:player,pl:true});
    list.sort((a,b)=>a.o.y-b.o.y);
    for(const it of list){ const o=it.o;
      if(!it.pl && state===S.PLAY && Math.hypot(o.x-player.x,o.y-player.y)<R_PL*4){
        ctx.strokeStyle='rgba(255,40,60,'+(0.3+0.35*Math.sin(performance.now()*0.012))+')'; ctx.lineWidth=4;
        ctx.beginPath(); ctx.ellipse(o.x,o.y+2,R_PU*1.5,R_PU*0.8,0,0,7); ctx.stroke(); }
      drawCutie(o.x,o.y,it.pl?"#ff6aa8":"#6c7bff", it.pl?'player':'pursuer'); }
    for(const p of parts){ ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle="#8a94a6"; ctx.beginPath(); ctx.arc(p.x,p.y,3.5*p.life+1.5,0,7); ctx.fill(); }
    ctx.globalAlpha=1;
  }
  ctx.restore();
  // 「してやったり」等
  for(const f of floats){ ctx.globalAlpha=Math.max(0,f.life); ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(-0.03);
    ctx.font=`900 ${f.big?40:24}px sans-serif`; ctx.textAlign='center'; ctx.lineWidth=8; ctx.strokeStyle=P.ink;
    ctx.strokeText(f.text,0,0); ctx.fillStyle=f.col; ctx.fillText(f.text,0,0); ctx.restore(); } ctx.globalAlpha=1;
  // 周辺減光
  const vg=ctx.createRadialGradient(W/2,H*0.46,Math.min(W,H)*0.3, W/2,H*0.46,Math.max(W,H)*0.72);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.32)'); ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
  if(flash>0){ ctx.fillStyle=`rgba(${flashCol},${flash*0.5})`; ctx.fillRect(0,0,W,H); }
  if(msgT>0){ ctx.save(); ctx.translate(W/2,fy-18); ctx.font='900 30px sans-serif'; ctx.textAlign='center';
    ctx.lineWidth=7; ctx.strokeStyle=P.ink; ctx.strokeText(msg,0,0); ctx.fillStyle=P.pop; ctx.fillText(msg,0,0); ctx.restore(); }
}
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

// ── 入力: なぞって逃げる(指の少し上に自分) ──
function setT(e){ player.tx=clamp(e.clientX,fx+R_PL,fx+fw-R_PL); player.ty=clamp(e.clientY-40,fy+R_PL,fy+fh-R_PL); }
addEventListener('pointerdown',e=>{ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back'))) return;
  if(state===S.PLAY){ e.preventDefault(); dragging=true; setT(e); } },{passive:false});
addEventListener('pointermove',e=>{ if(dragging&&state===S.PLAY){ e.preventDefault(); setT(e); } },{passive:false});
addEventListener('pointerup',()=>{ dragging=false; });
document.getElementById('startBtn').addEventListener('click',e=>{e.stopPropagation();start();});
document.getElementById('retryBtn').addEventListener('click',e=>{e.stopPropagation();start();});

let tPrev=performance.now();
function frame(now){ const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; update(dt); if(W===0) resize(); draw(); requestAnimationFrame(frame); }
resize(); requestAnimationFrame(frame);

// テスト用フック(ロジック検証)
window.__nige={
  setup(pl,purs,rk){ state=S.PLAY; grace=0; player.x=pl[0]; player.y=pl[1]; player.tx=pl[0]; player.ty=pl[1];
    pursuers=purs.map(p=>({x:p[0],y:p[1],vx:0,vy:0})); rocks=(rk||[]).map(r=>({x:r[0],y:r[1],r:r[2]||18})); },
  step(dt){ update(dt||0.016); return this.snap(); },
  snap(){ return {state, level, score, pursuers:pursuers.length, field:{fx,fy,fw,fh}, player:{x:Math.round(player.x),y:Math.round(player.y)} }; }
};
})();
