"use strict";
(function(){
addEventListener('error',e=>{ let d=document.getElementById('err'); if(!d){ d=document.createElement('div'); d.id='err';
  d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#a00;color:#fff;font:12px monospace;padding:8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d);} d.textContent='ERR: '+(e.message||e); });

/* =====================================================================
   もちつき ― リズムが主役。拍(ドン)に合わせて つく＝ぺったん。
   あいだの「うら」に相方の手が入る→そこで打つと つぶす(緊張)。
   のる(コンボ)ほど お囃子が増えて 気持ちいい(グルーヴ)。
   ★曲を選べる: 曲ごとに メロディ・テンポ・リズム構成が ちがう。
   メロディは WebAudio で自作(実在曲は使わない)。
   ===================================================================== */
const Y=window.Yokocho, D=Y.draw, P=Y.PALETTE;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,DPR=1;
function resize(){ DPR=Math.min(window.devicePixelRatio||1,2.5); W=innerWidth; H=innerHeight;
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
addEventListener('resize',resize); resize();

// 音名→周波数(自作メロディ用)。0 は休符。
const NOTE={ C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196.00,A3:220.00,B3:246.94,
  C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392.00,A4:440.00,B4:493.88,
  C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99,A5:880.00, 0:0 };

// リズム譜(不規則)。1小節=8個の8分。P=つく / H=手が入る(打つな) / .=休み
const PAT={
  reg:   "PHPHPHPH",   // きほん(4つ打ち)
  rest:  "PHP.PHP.",   // 休みが入る
  sync:  "PHPPHPH.",   // 食う(8分シンコペ)
  funk:  "P.HPPHP.",   // ファンク
  sparse:"PH..PH..",   // すかすか
  off:   ".PHP.PHP",   // うら起点
  busy:  "PHPPHPPH",   // つめこみ
};
// 曲(テンポ・メロディ・ベース・リズム構成 が別)。mel=つく所で鳴る旋律。
const SONGS=[
  { name:"おまつり", bpm:104, color:"#ff8a3d",
    mel:['E4','G4','A4','G4','E4','D4','E4','G4','A4','G4','E4','D4','C4','D4','E4','G4'],
    bass:['C3','C3','G3','G3','A3','A3','G3','G3'],
    sections:[{name:"よいしょ",beats:12,pat:PAT.reg},{name:"のってきた",beats:12,pat:PAT.rest},{name:"はねる",beats:8,pat:PAT.sync},{name:"フィナーレ",beats:12,pat:PAT.reg}] },
  { name:"はやうち", bpm:134, color:"#e0603f",
    mel:['C5','G4','A4','G4','E4','G4','C5','A4','G4','E4','G4','A4','C5','A4','G4','E4'],
    bass:['A3','A3','F3','F3','G3','G3','C4','C4'],
    sections:[{name:"よーい",beats:12,pat:PAT.reg},{name:"かっとび",beats:12,pat:PAT.busy},{name:"きざむ",beats:10,pat:PAT.sync},{name:"ラスト",beats:14,pat:PAT.busy}] },
  { name:"のんびり", bpm:86, color:"#4fae8f",
    mel:['G4','E4','D4','E4','G4','A4','G4','E4','D4','E4','G4','A4','C5','A4','G4','E4'],
    bass:['C3','C3','G3','G3','A3','A3','F3','F3'],
    sections:[{name:"ゆるり",beats:10,pat:PAT.rest},{name:"すきま",beats:10,pat:PAT.sparse},{name:"うらり",beats:10,pat:PAT.off},{name:"しめ",beats:12,pat:PAT.rest}] },
  { name:"わっしょい", bpm:120, color:"#ffcf3f",
    mel:['G4','A4','G4','E4','D4','E4','G4','A4','C5','A4','G4','A4','G4','E4','D4','E4'],
    bass:['G3','G3','G3','G3','C3','C3','C3','C3'],
    sections:[{name:"わっ",beats:12,pat:PAT.reg},{name:"しょい",beats:8,pat:PAT.sync},{name:"おおいり",beats:12,pat:PAT.funk},{name:"どっと",beats:12,pat:PAT.busy}] },
  { name:"うらファンク", bpm:112, color:"#9b6dd6",
    mel:['E4','G4','A4','G4','E4','D4','C4','D4','E4','G4','A4','C5','A4','G4','E4','D4'],
    bass:['E3','E3','G3','G3','A3','A3','G3','G3'],
    sections:[{name:"のり",beats:10,pat:PAT.off},{name:"ずらし",beats:12,pat:PAT.funk},{name:"うらへ",beats:10,pat:PAT.off},{name:"きめ",beats:12,pat:PAT.sync}] },
];

const S={TITLE:0,SONGS:1,PLAY:2,OVER:3}; let state=S.TITLE;
let curSong=0, song=SONGS[0], secList=SONGS[0].sections, START=[], END_BEAT=0, R=new Y.Rhythm(SONGS[0].bpm);
let secIdx=-1, pcount=0, good=0, smash=0, whiff=0, combo=0, bestCombo=0, nori=0, grow=0, anger=0;
let poundAnim=0, poundKind='', mochiSquish=0, mochiMouth=0, handHurt=0, flash=0, flashCol='255,255,255';
let bannerT="", bannerUntil=-9;
const floats=[];

const STORE="mochi.best";
function bests(){ try{ return JSON.parse(localStorage.getItem(STORE)||"{}")||{}; }catch(e){ return {}; } }
function saveBest(i,c){ try{ const b=bests(); if(c>(b[i]||0)){ b[i]=c; localStorage.setItem(STORE,JSON.stringify(b)); } }catch(e){} }

function loadSong(i){ curSong=i; song=SONGS[i]; secList=song.sections;
  START=[]; let a=0; for(const s of secList){ START.push(a); a+=s.beats; } START.push(a); END_BEAT=a;
  R=new Y.Rhythm(song.bpm); }

const usuY=()=>H*0.6, cxc=()=>W*0.5;
function section(){ return secList[Math.max(0,Math.min(secList.length-1,secIdx))]; }
function curInten(){ return Math.min(4, Math.max(0,secIdx) + (nori>0.7?1:0)); }

// 譜面判定(純粋関数)。b=拍位置→8分スロット。最寄りスロットの種類で判定。
function slotType(pat,k){ const L=pat.length; return pat[((k%L)+L)%L]; }
function pIndexAt(pat,k){ const L=pat.length; let per=0; for(const c of pat) if(c==='P')per++;
  const full=Math.floor(k/L), rem=((k%L)+L)%L; let cnt=full*per; for(let i=0;i<rem;i++) if(pat[i]==='P')cnt++; return cnt; }
function judge(b, pat){ const e=b*2, nearest=Math.round(e), dE=Math.abs(e-nearest);
  if(dE>0.30) return 'whiff';                 // スロットの間＝すかっ(安全)
  const t=slotType(pat,nearest);
  if(t==='H') return 'smash';                 // 手のスロットで打った＝つぶす
  if(t==='.') return 'whiff';                 // 休みで打った
  return dE<0.12?'perfect':'good';            // P=つく
}
function handIn(b,pat){ const e=b*2, L=pat.length; let minD=99;   // 最寄りHスロットへの近さ→手の出具合
  for(let i=0;i<L;i++){ if(pat[i]==='H'){ let d=Math.abs(((e-i)%L+L)%L); d=Math.min(d,L-d); if(d<minD)minD=d; } }
  return minD===99?0:Math.max(0,1-minD/1.0); }
// 出力遅延の補正(スマホは鳴った音が currentTime より遅れて聞こえる)
function audioLat(){ const ac=Y.audio.ctx&&Y.audio.ctx(); if(!ac) return 0;
  let l=(ac.outputLatency||0)+(ac.baseLatency||0); return (l>0)?Math.min(0.25,l):0; }

// お囃子＋メロディ(拍の音を audio時刻に予約=ズレない)。曲ごとに旋律が変わる。
function playNote(name,at,type,vol,dur){ const f=NOTE[name]; if(!f) return; Y.audio.tone(f,dur||0.18,type,vol,at); }
function onBeat(n,at){ const spb=R.spb, bib=((n%4)+4)%4;
  Y.audio.tone(150,0.16,'sine',0.42,at);                // ドン=拍の芯(常時の脈)
  Y.audio.noise(0.03,0.07,at+spb/2,7000);               // うすいハット
  const pat=section().pat, mel=song.mel, bass=song.bass, inten=curInten();
  // つく所(P)にメロディ＋木魚ガイド＝「叩くリズム」を耳で示す(不規則でも取れる)
  for(const p of [[2*n,0],[2*n+1,0.5]]){ const k=p[0];
    if(slotType(pat,k)==='P'){ const t=at+p[1]*spb;
      playNote(mel[pIndexAt(pat,k)%mel.length], t, 'triangle', 0.16, spb*0.55);
      Y.audio.noise(0.015,0.10, t, 5000); } }
  playNote(bass[n%bass.length], at, 'sine', 0.22, spb*1.1);
  if(inten>=1 && (bib===1||bib===3)) Y.audio.noise(0.05,0.20,at,2500);      // 手拍子 2・4
  if(inten>=2){ Y.audio.noise(0.02,0.05,at+spb/4,9000); Y.audio.noise(0.02,0.05,at+spb*3/4,9000); }
  if(inten>=4 && n%8===0) Y.audio.tone(220,0.12,'square',0.14,at);          // 賑やかし
  if(bib===2 && state===S.PLAY) setTimeout(()=>{ if(state===S.PLAY) Y.say("あいよ",{char:'niisan',volume:0.6}); }, spb*500);
}

function startSong(i){ Y.audio.resume(); loadSong(i);
  secIdx=-1; pcount=good=smash=whiff=combo=bestCombo=0; nori=grow=anger=0;
  poundAnim=mochiSquish=mochiMouth=handHurt=flash=0; bannerT=""; bannerUntil=-9; floats.length=0;
  document.getElementById('title').classList.add('hidden'); document.getElementById('songs').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden'); document.getElementById('hint').classList.remove('hidden');
  document.getElementById('sect').textContent=song.name;
  state=S.PLAY; R.start(onBeat); }

function finish(){ state=S.OVER; R.stop(); saveBest(curSong,bestCombo);
  let title,deki,msg;
  if(smash>=8){ title="て が いたい"; deki="ぐちゃぐちゃ もち"; msg="手を つぶしすぎ。いてて…。"; }
  else if(bestCombo>=24 && smash<=2){ title="もちつき 名人！"; deki="つやつや もち"; msg=song.name+" を のりこなした！"; }
  else if(grow>0.8){ title="でかい もち"; deki="ごきげん もち"; msg="よく のびた。うまそう。"; }
  else { title="できた"; deki="ふつうの もち"; msg="まあまあ。ほかの 曲も どうぞ。"; }
  document.getElementById('goTitle').textContent=title;
  document.getElementById('goDeki').textContent=deki;
  document.getElementById('goMsg').textContent=msg;
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('gameover').classList.remove('hidden'); }

function tap(){
  if(state!==S.PLAY) return; const raw=R.beat(); if(raw<0) return;
  const b=raw - audioLat()/R.spb;                 // 出力遅延ぶん 戻して判定(聞こえた拍で合う)
  const sec=section(); const kind=judge(b,sec.pat); poundAnim=1;
  if(kind==='smash'){ poundKind='smash'; smash++; combo=0; nori=Math.max(0,nori-0.4); handHurt=1; anger=Math.min(1,anger+0.25);
    Y.sfx.bad(); Y.say(["いたっ","あいたっ","ちょっ"][smash%3],{char:'niisan',interrupt:true,pitch:1.4});
    addFloat(cxc()+90,usuY()-40,"ｸﾞｼｬ",'#ff5566',true); flash=0.4; flashCol='255,60,80'; return; }
  if(kind==='whiff'){ poundKind='whiff'; whiff++; combo=0; nori=Math.max(0,nori-0.12);
    Y.sfx.whiff(); addFloat(cxc(),usuY()-80,"すかっ",'#c9b98a',false); return; }
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
  anger=Math.max(0,anger-dt*0.2); flash=Math.max(0,flash-dt*2.4); nori=Math.max(0,nori-dt*0.03);
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; if(f.dot){ f.vy+=1000*dt; f.x+=f.vx*dt; f.y+=f.vy*dt; } else { f.y+=f.vy*dt; f.vy*=0.9; }
    f.life-=dt*(f.dot?2:1.3); if(f.life<=0) floats.splice(i,1); }

  if(state===S.PLAY){ const b=R.beat();
    if(b>=0){ let idx=0; while(idx<secList.length && b>=START[idx+1]) idx++;
      if(idx!==secIdx && idx<secList.length){ secIdx=idx; const s=secList[idx];
        bannerT=s.name; bannerUntil=b+2.2; document.getElementById('sect').textContent=s.name;
        Y.say(s.name,{char:'narr',interrupt:true}); } }
    document.getElementById('deki').textContent = nori>0.8?"ノリノリ":nori>0.5?"のってきた":nori>0.2?"ふつう":"…";
    if(b>=END_BEAT) finish();
  }
}

// ── 描画 ──
function draw(){
  ctx.save();   // 画面ゆれは廃止
  const b=state===S.PLAY?R.beat():END_BEAT, ph=((b%1)+1)%1;
  const pulse=Math.max(0,1-(ph<0.5?ph:1-ph)/0.5);
  ctx.fillStyle=P.sky; ctx.fillRect(-20,-20,W+40,H*0.66);
  ctx.fillStyle=P.dirt; ctx.fillRect(-20,H*0.64,W+40,H);
  ctx.strokeStyle=P.ink; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(-10,H*0.64); ctx.lineTo(W+10,H*0.64-4); ctx.stroke();
  drawLanterns(b, pulse);

  if(state===S.PLAY||state===S.OVER){
    const hin=state===S.PLAY?handIn(b,section().pat):0;
    drawUsu();
    drawMochi(b, ph, pulse);
    D.creature(ctx,P.buyo,{x:W*0.22,y:usuY()+6,scale:1,rot:-0.05,mouthOpen:0.3+poundAnim*0.6,brow:0.5},D.buyoBody);
    drawKine();
    const hurt=handHurt>0, panic=Math.min(1,(smash)/6);
    D.creature(ctx,P.noppo,{x:W*0.82,y:usuY()+8,scale:0.95,rot:0.05,
      mouthOpen:hurt?0.9:(0.15+panic*0.5),brow:hurt?-0.9:0.4,dead:hurt&&handHurt>0.5},D.noppoBody);
    drawHand(hin,hurt);
  }

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
function drawLanterns(b,pulse){ const y=H*0.12, sway=Math.sin(b*Math.PI)*(6+nori*10);
  for(let i=0;i<5;i++){ const x=W*(0.12+i*0.19); ctx.save(); ctx.translate(x,y+(i%2?sway:-sway)*0.5);
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
  ctx.beginPath(); const n=16; for(let i=0;i<=n;i++){ const a=i/n*Math.PI*2, rr=base*(1+Math.sin(a*3+b)*0.05);
    const px=Math.cos(a)*rr, py=Math.sin(a)*rr*0.82 - base*0.15; i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
  ctx.closePath();
  const g=ctx.createRadialGradient(-base*0.3,-base*0.4,base*0.1,0,0,base*1.3);
  g.addColorStop(0,'#ffffff'); g.addColorStop(0.6, nori>0.5?'#fff4fa':'#f4efe2'); g.addColorStop(1,'#e6dcc8');
  ctx.fillStyle=g; ctx.fill(); D.ink(ctx,Math.max(5,base*0.08));
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
function drawNori(){ const w=Math.min(W*0.6,260), x=W/2-w/2, y=H-30, h=14;
  ctx.fillStyle='rgba(0,0,0,.15)'; ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.fill();
  const g=ctx.createLinearGradient(x,0,x+w,0); g.addColorStop(0,'#ffcf3f'); g.addColorStop(1,'#ff6a3d');
  ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(x,y,w*nori,h,7); ctx.fill();
  ctx.strokeStyle=P.ink; ctx.lineWidth=3; ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.stroke();
  ctx.fillStyle=P.ink; ctx.font='900 12px sans-serif'; ctx.textAlign='center'; ctx.fillText('ノリ',W/2,y-6); }
function drawCombo(){ if(combo<2) return; ctx.save(); ctx.translate(W-16,H-30);
  ctx.font='900 26px sans-serif'; ctx.textAlign='right'; ctx.fillStyle='#c85a1a';
  ctx.fillText(combo+' れんぞく',0,0); ctx.restore(); }
function drawBeatDots(ph){ const b=R.beat(); const bib=((Math.floor(b)%4)+4)%4; const y=H*0.5;
  for(let i=0;i<4;i++){ const x=W/2+(i-1.5)*30; const on=(i===bib);
    ctx.beginPath(); ctx.arc(x,y,on?9*(1+(1-ph)*0.3):6,0,7);
    ctx.fillStyle=on?'#ffcf3f':'rgba(255,255,255,.35)'; ctx.fill(); ctx.strokeStyle=P.ink; ctx.lineWidth=2; ctx.stroke(); } }

// ── 曲えらび(すみません方式) ──
function buildSongs(){ const g=document.getElementById('sngrid'); g.innerHTML="";
  const b=bests();
  SONGS.forEach((s,i)=>{ const el=document.createElement('div'); el.className="sng"; el.style.background=s.color;
    el.innerHTML=s.name+'<small>'+s.bpm+' BPM</small>'+(b[i]?'<div class="bw">さいこう '+b[i]+'コンボ</div>':'<small>&nbsp;</small>');
    el.addEventListener('click',()=>startSong(i)); g.appendChild(el); });
}
function showSongs(){ buildSongs();
  document.getElementById('title').classList.add('hidden'); document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden'); document.getElementById('hint').classList.add('hidden');
  document.getElementById('songs').classList.remove('hidden'); state=S.SONGS; }

document.getElementById('toSongs').addEventListener('click',e=>{e.stopPropagation(); Y.audio.resume(); showSongs();});
document.getElementById('backSongs').addEventListener('click',e=>{e.stopPropagation(); showSongs();});
document.getElementById('retryBtn').addEventListener('click',e=>{e.stopPropagation(); startSong(curSong);});
addEventListener('pointerdown',e=>{ const t=e.target; if(t&&t.closest&&(t.closest('.btn')||t.closest('.back')||t.closest('.sng'))) return;
  if(state===S.PLAY){ e.preventDefault(); tap(); } },{passive:false});

let tPrev=performance.now();
function frame(now){ const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; update(dt); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// テスト用フック
window.__mochi={
  songs:SONGS.length, songBpm(i){ return SONGS[i].bpm; }, songName(i){ return SONGS[i].name; },
  judge(ph,pat){ return judge(ph,pat); }, handIn(ph,pat){ return +handIn(ph,pat).toFixed(2); },
  load(i){ loadSong(i); return {name:song.name,bpm:R.spb?Math.round(60/R.spb):0,endBeat:END_BEAT,sections:secList.length}; },
  sectionAtBeat(b){ let idx=0; while(idx<secList.length && b>=START[idx+1]) idx++; return {idx,name:secList[Math.min(idx,secList.length-1)].name,pat:secList[Math.min(idx,secList.length-1)].pat}; },
  setSection(i){ secIdx=i; return section().name; },
  showSongs(){ showSongs(); return {state, buttons:document.querySelectorAll('#sngrid .sng').length}; },
  playHidden(){ state=S.PLAY; }, draw(){ draw(); return true; },
  noteOk(){ return Object.keys(NOTE).every(k=> k==='0' || NOTE[k]>0); },
  melodyValid(){ return SONGS.every(s=> s.mel.every(x=>x===0||NOTE[x]) && s.bass.every(x=>x===0||NOTE[x])); },
  patternsValid(){ return SONGS.every(s=> s.sections.every(sec=> /^[PH.]+$/.test(sec.pat))); },
  // 譜面: P=つく, H=手(打つな) の位置で判定/手が一致するか
  slotAt(pat,k){ return slotType(pat,k); },
  snap(){ return {state,curSong,secIdx,combo,bestCombo,nori:+nori.toFixed(2),smash}; },
};
})();
