"use strict";
(function(){
// 実機で万一エラーが出たら画面に出す(こちらで描画確認できないため)
addEventListener('error',e=>{ let d=document.getElementById('err'); if(!d){ d=document.createElement('div'); d.id='err';
  d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d);} d.textContent='ERR: '+(e.message||e); });

/* =====================================================================
   ビンタ ― 早撃ち見切り勝負(野田ゲーの緊張×意外)。
   「かまえ…」→ ランダムな間 → 「！」でどっちが先に叩くか。
   ・「！」の前に押す=お手つき(負け)  ・フェイントに釣られても負け
   ・相手より速ければ勝ち。相手は達人/新入りで速さがバラつく=意外。
   単一タップだけ。指がうずく緊張が芯。
   ===================================================================== */
const Y=window.Yokocho, D=Y.draw, P=Y.PALETTE;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){ DPR=Math.min(window.devicePixelRatio||1,2.5); W=innerWidth; H=innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
addEventListener('resize',resize); resize();

// 相手の格(連勝でだんだん強く=速く・フェイント多く)
const FOES=[
  {name:"にゅうもん君", spd:0.46, feint:0.15, cloth:"#6fae8f", body:D.noppoBody},
  {name:"あにでし",    spd:0.39, feint:0.45, cloth:"#4f86c6", body:D.buyoBody},
  {name:"しはんだい",  spd:0.33, feint:0.75, cloth:"#e0a24f", body:D.machoBody},
  {name:"しはん",      spd:0.28, feint:1.00, cloth:"#d94f4f", body:D.machoBody},
  {name:"おにしはん",  spd:0.23, feint:1.30, cloth:"#7a4fd9", body:D.machoBody},
];
function foeAt(streak){ return FOES[Math.min(FOES.length-1, Math.floor(streak/2))]; }

const S={TITLE:0,READY:1,GO:2,RESULT:3,OVER:4}; let state=S.TITLE;
let streak=0, best=0, life=3, round=0;
let waitT=0, goEl=0, foeRT=0, foe=FOES[0], special="", label="";
let feints=[], feintFlash=0, result="", pRT=0, resultT=0;
let shake=0, flash=0, flashCol='255,255,255', signalPulse=0;
let youRot=0, foeRot=0, youArm=0, foeArm=0, youDead=false, foeDead=false;
const floats=[];

function reset(){ streak=0; life=3; round=0; best=0; startRound(); }

function startRound(){
  round++; foe=foeAt(streak);
  // 間: 0.7〜2.4秒。連勝で気持ち短め(=待ちが読めない)
  waitT = 0.7 + Math.random()*1.7 - Math.min(0.5, round*0.02);
  if(waitT<0.45) waitT=0.45;
  // 相手の反応。ときどき達人(超速)/寝ぼけ(激遅)=意外な展開
  const roll=Math.random(); special="";
  if(roll<0.10){ foeRT=0.15; special="達人"; }
  else if(roll<0.20){ foeRT=0.62; special="スキ"; }
  else { foeRT = foe.spd + (Math.random()*0.06-0.03); }
  // フェイント時刻(間の中に0〜2回)。釣られてお手つきを誘う
  feints=[]; const nF=(Math.random()<foe.feint?1:0)+(Math.random()<foe.feint*0.5?1:0);
  for(let i=0;i<nF;i++){ const t=0.3+Math.random()*Math.max(0.05,waitT-0.55); feints.push(t); }
  feints.sort((a,b)=>a-b);
  goEl=0; result=""; feintFlash=0; youRot=0; foeRot=0; youArm=0; foeArm=0; youDead=false; foeDead=false;
  label="かまえ…"; signalPulse=0;
  state=S.READY;
  Y.say("かまえ", {char: streak>=6?'ossan':'narr', interrupt:true, rate:0.9});
  updHud();
}

function goSignal(){
  state=S.GO; goEl=0; label="！"; signalPulse=1;
  flash=0.25; flashCol='255,240,120'; Y.sfx.hit(); Y.audio.tone(880,0.06,'square',0.25);
}

// タップ処理(勝敗確定)
function tap(){
  if(state===S.READY){ resolve('foul'); return; }   // 「！」前 = お手つき
  if(state===S.GO){
    pRT=goEl;
    if(pRT < foeRT) resolve('win');                  // 相手より速い = 勝ち
    else resolve('lose');                            // 遅れた = やられる(通常はGOでfoe先着だがギリの押し込み用)
  }
}

function resolve(kind){
  result=kind; state=S.RESULT; resultT=1.7;
  if(kind==='win'){
    streak++; if(streak>best) best=streak;
    foeDead=true; foeRot=0.5; youArm=1; shake=12; flash=0.35; flashCol='255,240,120';
    Y.sfx.good(); Y.audio.noise(0.05,0.5,null,900); Y.audio.tone(300,0.05,'square',0.3);
    const q = pRT<0.16 ? "みきった！" : "パチーン！";
    addFloat(W*0.5,H*0.42,q,P.pop,true);
    Y.say(pRT<0.16?"みきったり！":["パチン！","はやい！","おみごと"][streak%3],{char:'niisan',interrupt:true});
  } else if(kind==='lose'){
    life--; youDead=true; youRot=-0.5; foeArm=1; shake=14; flash=0.35; flashCol='255,80,90';
    Y.sfx.bad(); Y.audio.noise(0.06,0.55,null,700);
    addFloat(W*0.5,H*0.42,"やられた…",'#ff6a6a',true);
    Y.say(["いてっ","やられた","おそーい"][life%3],{char:'ossan',interrupt:true});
  } else { // foul お手つき
    life--; youDead=true; youRot=0.35; foeArm=1; shake=16; flash=0.45; flashCol='255,60,80';
    Y.sfx.bad(); Y.audio.tone(120,0.25,'sawtooth',0.24);
    addFloat(W*0.5,H*0.4,"お手つき！",'#ff3355',true);
    Y.say("フライング！ はやい！",{char:'neesan',interrupt:true});
  }
  updHud();
}

function update(dt){
  // 減衰系
  shake*=Math.pow(0.0025,dt); if(shake<0.3)shake=0;
  flash=Math.max(0,flash-dt*2.2); feintFlash=Math.max(0,feintFlash-dt*3.5);
  signalPulse=Math.max(0,signalPulse-dt*3);
  youArm+= ((state===S.RESULT&&result==='win'?1:0)-youArm)*Math.min(1,dt*18);
  foeArm+= ((state===S.RESULT&&(result==='lose'||result==='foul')?1:0)-foeArm)*Math.min(1,dt*18);
  youRot+= (0-youRot)*Math.min(1,dt*4); foeRot+= (0-foeRot)*Math.min(1,dt*4);
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.y+=f.vy*dt; f.vy*=0.9; f.life-=dt*(f.big?0.9:1.6); if(f.life<=0) floats.splice(i,1); }

  if(state===S.READY){
    // フェイント発火(釣り)
    if(feints.length){ waitLeftFeints(dt); }
    waitT-=dt;
    if(waitT<=0) goSignal();
  } else if(state===S.GO){
    goEl+=dt;
    if(goEl>=foeRT && !result){ resolve('lose'); }   // 押さなければ相手が先に叩く
  } else if(state===S.RESULT){
    resultT-=dt;
    if(resultT<=0){ if(life<=0) over(); else startRound(); }
  }
}
// 経過に応じてフェイントを光らせる(READY内で消費)
let _elapsedInRound=0;
function waitLeftFeints(dt){
  _elapsedInRound+=dt;
  while(feints.length && _elapsedInRound>=feints[0]){ feints.shift(); feintFlash=0.22; Y.audio.tone(500,0.04,'sine',0.1); }
}

function over(){ state=S.OVER;
  document.getElementById('goTitle').textContent = best>=8?"名人！":best>=4?"なかなか やる":"ビンタ まけ";
  document.getElementById('goSub').textContent = "さいこう "+best+" れんしょう";
  document.getElementById('goMsg').textContent = best>=6?"見切りの達人。こわい。":"指が うずいたら まけ。";
  Y.say(best>=6?"あっぱれ":"おーわりっ",{char:'ossan',interrupt:true});
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('gameover').classList.remove('hidden'); }

function addFloat(x,y,text,col,big){ floats.push({x,y,text,col,big:!!big,life:1,vy:-42}); }
function updHud(){ document.getElementById('streak').textContent=streak; document.getElementById('life').textContent=life; }

// ── 描画 ──
const groundY=()=>H*0.70;
function draw(){
  ctx.save(); let sx=0,sy=0; if(shake>0){ sx=(Math.random()*2-1)*shake; sy=(Math.random()*2-1)*shake; } ctx.translate(sx,sy);
  // 道場(壁+床)
  ctx.fillStyle="#e9ddc2"; ctx.fillRect(-20,-20,W+40,groundY()+2);
  ctx.fillStyle="#c79a5b"; ctx.fillRect(-20,groundY(),W+40,H-groundY()+20);
  ctx.strokeStyle=P.ink; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(-10,groundY()); ctx.lineTo(W+10,groundY()); ctx.stroke();
  // 床の板目
  ctx.strokeStyle="rgba(0,0,0,.12)"; ctx.lineWidth=3;
  for(let i=1;i<5;i++){ const y=groundY()+ (H-groundY())*i/5; ctx.beginPath(); ctx.moveTo(-10,y); ctx.lineTo(W+10,y); ctx.stroke(); }
  // 掛け軸(奥・雰囲気)
  ctx.save(); ctx.translate(W*0.5,groundY()*0.44); ctx.fillStyle="#f4efe2"; ctx.strokeStyle=P.ink; ctx.lineWidth=4;
  ctx.beginPath(); ctx.rect(-26,-46,52,92); ctx.fill(); ctx.stroke();
  ctx.fillStyle=P.ink; ctx.font='900 26px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText("拳",0,-20); ctx.fillText("魂",0,18); ctx.textBaseline='alphabetic'; ctx.restore();

  if(state!==S.TITLE){
    const gy=groundY();
    // あなた(左・ピンク)
    D.creature(ctx,"#ff5c9d",{x:W*0.28,y:gy,scale:1.05,rot:youRot,arm:youArm,
      mouthOpen:state===S.GO?0.4:0.1, brow:state===S.READY?0.5:0, dead:youDead});
    // 相手(右・格に応じた体)
    D.creature(ctx,foe.cloth,{x:W*0.72,y:gy,scale:1.08,rot:foeRot,arm:foeArm,
      mouthOpen:state===S.GO?0.4:0.1, brow:0.4, dead:foeDead}, foe.body);

    // 相手の名札
    ctx.fillStyle=P.ink; ctx.font='900 15px sans-serif'; ctx.textAlign='center';
    ctx.fillText(foe.name+(special?"("+special+")":""), W*0.72, gy-150);

    // 中央シグナル
    if(state===S.READY){
      ctx.fillStyle=P.ink; ctx.font='900 30px sans-serif'; ctx.textAlign='center';
      ctx.fillText("かまえ…", W*0.5, H*0.5);
      if(feintFlash>0){ ctx.save(); ctx.globalAlpha=Math.min(1,feintFlash*3); ctx.translate(W*0.5,H*0.36);
        ctx.rotate((Math.random()*2-1)*0.08); ctx.font='900 40px sans-serif'; ctx.lineWidth=7; ctx.strokeStyle=P.ink;
        ctx.strokeText("ん？",0,0); ctx.fillStyle="#fff"; ctx.fillText("ん？",0,0); ctx.restore(); }
    } else if(state===S.GO && !result){
      const s=1+signalPulse*0.8; ctx.save(); ctx.translate(W*0.5,H*0.36); ctx.scale(s,s);
      ctx.font='900 96px sans-serif'; ctx.textAlign='center'; ctx.lineWidth=12; ctx.strokeStyle=P.ink;
      ctx.strokeText("！",0,0); ctx.fillStyle="#ff2d3a"; ctx.fillText("！",0,0); ctx.restore();
      ctx.fillStyle=P.ink; ctx.font='900 22px sans-serif'; ctx.textAlign='center'; ctx.fillText("いま！", W*0.5, H*0.9);
    } else if(state===S.RESULT){
      ctx.fillStyle=P.ink; ctx.font='900 20px sans-serif'; ctx.textAlign='center';
      const t = result==='win' ? (pRT<0.16?"見切った！":"ビンタ 成立！") : result==='foul' ? "はやすぎ！お手つき" : "先に やられた…";
      ctx.fillText(t, W*0.5, H*0.9);
    }
  }

  // 飛び文字
  for(const f of floats){ ctx.globalAlpha=Math.max(0,f.life); ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(-0.04);
    ctx.font=`900 ${f.big?54:28}px sans-serif`; ctx.textAlign='center'; ctx.lineWidth=8; ctx.strokeStyle=P.ink;
    ctx.strokeText(f.text,0,0); ctx.fillStyle=f.col; ctx.fillText(f.text,0,0); ctx.restore(); }
  ctx.globalAlpha=1;
  ctx.restore();
  if(flash>0){ ctx.fillStyle=`rgba(${flashCol},${flash*0.55})`; ctx.fillRect(0,0,W,H); }
}

// 入力: どこでもタップで勝負
addEventListener('pointerdown',e=>{ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back'))) return;
  if(state===S.READY||state===S.GO){ e.preventDefault(); tap(); } },{passive:false});
document.getElementById('startBtn').addEventListener('click',e=>{e.stopPropagation();
  Y.audio.resume(); document.getElementById('title').classList.add('hidden'); document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden'); document.getElementById('hint').classList.remove('hidden'); reset(); });
document.getElementById('retryBtn').addEventListener('click',e=>{e.stopPropagation();
  document.getElementById('gameover').classList.add('hidden'); document.getElementById('hud').classList.remove('hidden');
  document.getElementById('hint').classList.remove('hidden'); reset(); });

let tPrev=performance.now();
function frame(now){ const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; update(dt); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// テスト用フック(タイミングを固定して勝敗ロジックを検証)
window.__binta={
  snap(){ return {state,streak,life,result,pRT:Math.round(pRT*1000)/1000,foeRT:Math.round(foeRT*1000)/1000,waitT:Math.round(waitT*1000)/1000}; },
  // 固定値でラウンドを差し込む
  force(o){ state=S.READY; result=""; life=(o&&o.life!=null)?o.life:3; streak=(o&&o.streak!=null)?o.streak:0;
    waitT=(o&&o.waitT!=null)?o.waitT:1.0; foeRT=(o&&o.foeRT!=null)?o.foeRT:0.4; feints=[]; _elapsedInRound=0; goEl=0; foe=FOES[0]; special=""; return this.snap(); },
  step(dt){ update(dt); return this.snap(); },
  tap(){ tap(); return this.snap(); },
};
})();
