"use strict";
(function(){
// 実機で万一エラーが出たら画面に出す(こちらで実行確認できないため)
addEventListener('error',e=>{ let d=document.getElementById('err'); if(!d){ d=document.createElement('div'); d.id='err';
  d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d);} d.textContent='ERR: '+(e.message||e); });

/* =====================================================================
   ボタン とおすぎ ― 野田ゲーの基準の1本。
   「発想that自体がバカ」= 早押しクイズなのにボタンが理不尽に遠い。
   連打で走る労力 vs どうでもいいクイズ、の落差が笑い。声も全開。
   ===================================================================== */
const Y=window.Yokocho, D=Y.draw, P=Y.PALETTE;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){ DPR=Math.min(window.devicePixelRatio||1,2.5); W=innerWidth; H=innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
addEventListener('resize',resize); resize();

const S={TITLE:0,COUNT:1,RACE:2,RESULT:3,OVER:4}; let state=S.TITLE;
let round=1, life=3, pp=0, rp=0, rivalSpd=0, dist=50, phase="", phaseT=0, shake=0, flash=0, flashCol='255,255,255';
let mashKick=0, rivalKick=0, won=false, resultT=0;
const floats=[];

// どうでもいいお題(答えは問わない。ボタンに着けば早押し成立、という体)
const QS=["1たす1は？","ねこは なんて なく？","そらは なにいろ？","うめぼしは？","おれは だれ？",
  "きのう なに たべた？","3の つぎは？","カレーは のみもの？","いま なんじ？","すきな 色は？"];
let q="";

function reset(){ round=1; life=3; startRound(); }
function startRound(){
  pp=0; rp=0; won=false; dist=Math.round(50*Math.pow(6,round-1)); // 50,300,1800,10800… 理不尽に遠く
  rivalSpd=0.16+round*0.03;   // ライバルは勝手に進む(やや不利=ズルい)
  q=QS[(Math.random()*QS.length)|0];
  phase="count"; phaseT=1.4; state=S.COUNT;
  Y.say("つぎ！ "+q, {char:'narr', interrupt:true});
  updHud();
}

function tapRun(){
  if(state!==S.RACE) return;
  pp=Math.min(1, pp + 0.028); mashKick=1;
  if(pp>=1){ finishRace(true); }
}
function finishRace(playerWon){
  won=playerWon; state=S.RESULT; resultT=1.6;
  if(playerWon){ Y.sfx.good(); Y.say(["ピンポーン！","せいかい！","はやい！"][round%3],{char:'niisan',interrupt:true});
    addFloat(W*0.5,H*0.4,"ピンポン！",P.pop,true); flash=0.4; flashCol='255,240,120'; shake=10; round++; }
  else { Y.sfx.bad(); Y.say(["ブッブー！","おそーい！","ざんねーん"][round%3],{char:'ossan',interrupt:true});
    addFloat(W*0.5,H*0.4,"ブブー",'#ff5566',true); flash=0.4; flashCol='255,60,80'; shake=14; life--; }
  updHud();
}

function update(dt){
  mashKick=Math.max(0,mashKick-dt*5); rivalKick=Math.max(0,rivalKick-dt*5);
  shake*=Math.pow(0.002,dt); if(shake<0.3)shake=0; flash=Math.max(0,flash-dt*2.2);
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.y+=f.vy*dt; f.vy*=0.9; f.life-=dt*(f.big?0.9:1.6); if(f.life<=0) floats.splice(i,1); }

  if(state===S.COUNT){ phaseT-=dt; if(phaseT<=0){ state=S.RACE; Y.say("よーい ドン！",{char:'narr',interrupt:true}); } }
  else if(state===S.RACE){ const before=rp; rp=Math.min(1, rp+rivalSpd*dt); if((rp*10|0)!==(before*10|0)) rivalKick=1;
    if(rp>=1 && !won){ finishRace(false); } }
  else if(state===S.RESULT){ resultT-=dt; if(resultT<=0){ if(life<=0) over(); else startRound(); } }
}

function over(){ state=S.OVER;
  document.getElementById('goTitle').textContent = round>5?"えらい！":"ボタン かてなかった";
  document.getElementById('goSub').textContent = (round-1)+" かい 勝った";
  document.getElementById('goMsg').textContent = "ボタンが 遠すぎた。世の中 理不尽。";
  Y.say("おーわりっ",{char:'ossan',interrupt:true});
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('gameover').classList.remove('hidden'); }

function addFloat(x,y,text,col,big){ floats.push({x,y,text,col,big:!!big,life:1,vy:-40}); }
function updHud(){ document.getElementById('round').textContent=round; document.getElementById('life').textContent=life; }

// ── 描画 ──
const trackY=()=>H*0.62, trackL=()=>W*0.12, trackR=()=>W*0.82;
function px(prog){ return trackL()+(trackR()-trackL())*prog; }
function draw(){
  ctx.save(); let sx=0,sy=0; if(shake>0){ sx=(Math.random()*2-1)*shake; sy=(Math.random()*2-1)*shake; } ctx.translate(sx,sy);
  ctx.fillStyle="#8fd0e8"; ctx.fillRect(-20,-20,W+40,H*0.66);
  ctx.fillStyle="#d9b25a"; ctx.fillRect(-20,H*0.64,W+40,H);
  ctx.strokeStyle=P.ink; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(-10,H*0.64); ctx.lineTo(W+10,H*0.64-4); ctx.stroke();

  if(state!==S.TITLE){
    // お題ふきだし(上)
    ctx.save(); ctx.translate(W/2,H*0.16); ctx.rotate(-0.02);
    const bw=Math.min(W*0.86,420);
    ctx.beginPath(); ctx.roundRect(-bw/2,-40,bw,80,16); ctx.fillStyle="#fff"; ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=5; ctx.stroke();
    ctx.fillStyle=P.ink; ctx.font='900 26px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(q,0,0);
    ctx.textBaseline='alphabetic'; ctx.restore();

    // 走路
    ctx.strokeStyle="rgba(0,0,0,.25)"; ctx.lineWidth=4; ctx.setLineDash([10,10]);
    ctx.beginPath(); ctx.moveTo(trackL(),trackY()+30); ctx.lineTo(trackR(),trackY()+30); ctx.stroke(); ctx.setLineDash([]);
    // 「のこり ○m」理不尽な距離
    ctx.fillStyle=P.ink; ctx.font='900 15px sans-serif'; ctx.textAlign='center';
    ctx.fillText("のこり "+Math.max(0,Math.round(dist*(1-pp)))+"m", (px(pp)+trackR())/2, trackY()-42);

    // 早押しボタン(右端・でかい赤)
    drawButton(trackR(), trackY()-6, 1+(state===S.RESULT&&won?0.3:0));
    // ライバル(赤い人)
    D.creature(ctx,"#d64b3a",{x:px(rp),y:trackY(),scale:0.8,rot:rivalKick*-0.1,arm:rivalKick*0.6,mouthOpen:0.3},D.machoBody);
    // あなた(ピンクの人)
    D.creature(ctx,"#ff2d6b",{x:px(pp),y:trackY(),scale:0.9,rot:mashKick*-0.12,arm:mashKick*0.8,mouthOpen:0.2+mashKick*0.5,brow:0.6},D.buyoBody);

    // カウント/合図
    if(state===S.COUNT){ ctx.save(); ctx.translate(W/2,H*0.42); ctx.font='900 46px sans-serif'; ctx.textAlign='center';
      ctx.lineWidth=8; ctx.strokeStyle=P.ink; const t=phaseT>0.7?"よーい":"…"; ctx.strokeText(t,0,0); ctx.fillStyle=P.pop; ctx.fillText(t,0,0); ctx.restore(); }
    if(state===S.RACE){ ctx.fillStyle=P.ink; ctx.font='900 20px sans-serif'; ctx.textAlign='center'; ctx.fillText("れんだ！れんだ！", W/2, H*0.9); }
  }

  for(const f of floats){ ctx.globalAlpha=Math.max(0,f.life); ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(-0.04);
    ctx.font=`900 ${f.big?58:30}px sans-serif`; ctx.textAlign='center'; ctx.lineWidth=8; ctx.strokeStyle=P.ink;
    ctx.strokeText(f.text,0,0); ctx.fillStyle=f.col; ctx.fillText(f.text,0,0); ctx.restore(); }
  ctx.globalAlpha=1;
  ctx.restore();
  if(flash>0){ ctx.fillStyle=`rgba(${flashCol},${flash*0.5})`; ctx.fillRect(0,0,W,H); }
}
function drawButton(x,y,s){ ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  ctx.beginPath(); ctx.ellipse(0,18,34,12,0,0,7); ctx.fillStyle="#7a1c12"; ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=4; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0,6,34,16,0,0,7); ctx.fillStyle="#e03b2a"; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0,-2,30,13,0,0,7); ctx.fillStyle="#ff5a45"; ctx.fill(); ctx.stroke();
  ctx.restore(); }

// 入力: れんだ(タップ)で走る
addEventListener('pointerdown',e=>{ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back'))) return;
  if(state===S.RACE){ e.preventDefault(); tapRun(); } },{passive:false});
document.getElementById('startBtn').addEventListener('click',e=>{e.stopPropagation();
  Y.audio.resume(); document.getElementById('title').classList.add('hidden'); document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden'); document.getElementById('hint').classList.remove('hidden'); reset(); });
document.getElementById('retryBtn').addEventListener('click',e=>{e.stopPropagation();
  document.getElementById('gameover').classList.add('hidden'); document.getElementById('hud').classList.remove('hidden');
  document.getElementById('hint').classList.remove('hidden'); reset(); });

let tPrev=performance.now();
function frame(now){ const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; update(dt); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// テスト用フック
window.__botan={ snap(){ return {state,round,life,pp,rp,dist}; }, tap(){ tapRun(); return this.snap(); },
  setRace(){ state=S.RACE; }, force(dt){ update(dt); return this.snap(); } };
})();
