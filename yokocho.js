/* =====================================================================
   ヘンゲー横丁 共通キット(世界観の芯)。window.Yokocho。
   - 音: WebAudio自動生成 + 拍の時計(音声クロック固定でズレない)
   - 声: SpeechSynthesis(端末の日本語音声。無料・オフライン・ファイル不要)
   - 絵: 手描きの横丁キャラを canvas に描くヘルパ。絵文字は使わない。
   各ゲームはこれを読み込み、機構(遊び方)だけを各自で書く。
   ===================================================================== */
window.Yokocho = (function(){
  "use strict";

  const PALETTE = {
    ink:"#1a1206", paper:"#f4efe2", pop:"#ffd23e", pop2:"#ff8a3d", red:"#d64b3a",
    buyo:"#e6803a", macho:"#e0603f", macho2:"#d94f4f", noppo:"#4fae8f",
    sky:"#4a8fb0", dirt:"#8a6a3a",
  };

  // ---------------- 音 ----------------
  let _ac=null;
  function ctx(){ if(!_ac){ try{ _ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return _ac; }
  function resume(){ const a=ctx(); if(a && a.state!=="running"){ try{ a.resume(); }catch(e){} } }
  function now(){ const a=ctx(); return a? a.currentTime : 0; }
  function tone(freq,dur,type,vol,at){
    const a=ctx(); if(!a) return;
    const o=a.createOscillator(), g=a.createGain();
    o.type=type||"square"; o.frequency.value=freq; o.connect(g); g.connect(a.destination);
    const t=at!=null?at:a.currentTime;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol||0.18,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+(dur||0.15));
    o.start(t); o.stop(t+(dur||0.15)+0.02);
  }
  function noise(dur,vol,at,hp){
    const a=ctx(); if(!a) return;
    const n=Math.max(1,Math.floor(a.sampleRate*dur)), b=a.createBuffer(1,n,a.sampleRate), d=b.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
    const s=a.createBufferSource(); s.buffer=b;
    const f=a.createBiquadFilter(); f.type="highpass"; f.frequency.value=hp||1000;
    const g=a.createGain(); const t=at!=null?at:a.currentTime;
    g.gain.setValueAtTime(vol||0.2,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t+dur+0.02);
  }
  // よく使う効果音(拍に厳密な音はこちら。声はズレるので飾り用)
  const sfx = {
    kick(at){ tone(150,0.18,"sine",0.5,at); },
    hat(at){ noise(0.03,0.12,at,7000); },
    hit(){ noise(0.06,0.5); tone(300,0.05,"square",0.3); },
    good(){ tone(560,0.09,"triangle",0.22); setTimeout(()=>tone(840,0.12,"triangle",0.2),70); },
    bad(){ tone(150,0.2,"sawtooth",0.22); setTimeout(()=>tone(90,0.28,"sawtooth",0.2),90); },
    whiff(){ tone(420,0.05,"sine",0.08); },
  };

  // ---------------- 拍の時計 ----------------
  // 発音時刻を setTimeout でなく AudioContext.currentTime に予約する。
  // だから位置も判定も音とズレない(旧rythmで実証済みの手法)。
  class Rhythm{
    constructor(bpm){ this.spb=60/bpm; this.t0=0; this.running=false; this._t=null; this._cb=null; this._nb=0; }
    start(onBeat, leadSec){ resume(); this.t0=now()+(leadSec==null?0.15:leadSec); this._nb=0; this._cb=onBeat; this.running=true;
      if(this._t) clearInterval(this._t); this._t=setInterval(()=>this._tick(),25); this._tick(); return this.t0; }
    stop(){ this.running=false; if(this._t){ clearInterval(this._t); this._t=null; } }
    songTime(){ return now()-this.t0; }
    beat(){ return this.songTime()/this.spb; }
    atBeat(b){ return this.t0 + b*this.spb; }
    _tick(){ if(!this.running) return; const horizon=this.songTime()+0.2;
      while(this._nb*this.spb < horizon){ const at=this.atBeat(this._nb);
        if(at>=now()-0.0001 && this._cb) this._cb(this._nb,at); this._nb++; } }
  }

  // ---------------- 声(SpeechSynthesis) ----------------
  let _voice=null;
  function pickVoice(){
    if(!("speechSynthesis"in window)) return null;
    if(_voice) return _voice;
    const vs=speechSynthesis.getVoices();
    _voice = vs.find(v=>/ja[-_]?JP/i.test(v.lang)) || vs.find(v=>/^ja/i.test(v.lang)) || null;
    return _voice;
  }
  if("speechSynthesis"in window){ try{ speechSynthesis.onvoiceschanged=()=>{ _voice=null; pickVoice(); }; }catch(e){} }
  // text を喋る。声はタイミングが甘いので「掛け声・反応」の飾りに使う(拍の芯は音で)。
  function say(text,opt){
    opt=opt||{}; if(!("speechSynthesis"in window)) return;
    try{
      if(opt.interrupt) speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      const v=pickVoice(); if(v) u.voice=v; u.lang="ja-JP";
      u.rate = opt.rate!=null?opt.rate:1.15;
      u.pitch= opt.pitch!=null?opt.pitch:1;
      u.volume=opt.volume!=null?opt.volume:1;
      if(opt.onend) u.onend=opt.onend;
      speechSynthesis.speak(u);
    }catch(e){}
  }

  // ---------------- 手描きヘルパ ----------------
  function ink(c,w){ c.lineJoin="round"; c.lineCap="round"; c.strokeStyle=PALETTE.ink; c.lineWidth=w||6; c.stroke(); }
  function fillInk(c,color,w){ c.fillStyle=color; c.fill(); ink(c,w); }
  // 点目＋眉＋口。表情は数値で。
  function face(c,r,o){
    o=o||{}; const open=o.mouthOpen||0, curve=o.mouthCurve||0, dead=o.dead;
    const ex=r*0.34, ey=-r*0.12, er=r*0.13;
    c.fillStyle=PALETTE.ink;
    if(dead){ // ぐるぐる目
      c.lineWidth=r*0.05; c.strokeStyle=PALETTE.ink;
      for(const sx of [-ex,ex]){ c.beginPath(); for(let a=0;a<12;a++){ const rr=er*(1-a/16), an=a*0.9; c.lineTo(sx+Math.cos(an)*rr, ey+Math.sin(an)*rr);} c.stroke(); }
    } else {
      c.beginPath(); c.arc(-ex,ey,er,0,7); c.arc(ex,ey,er,0,7); c.fill();
    }
    // ほっぺ
    c.fillStyle=PALETTE.red; c.beginPath(); c.arc(-ex*1.5,r*0.06,r*0.1,0,7); c.arc(ex*1.5,r*0.06,r*0.1,0,7); c.fill();
    // 眉
    const bt=(o.brow||0)*r*0.12;
    c.strokeStyle=PALETTE.ink; c.lineWidth=r*0.06; c.lineCap="round";
    c.beginPath(); c.moveTo(-ex-er,ey-r*0.3+bt); c.lineTo(-ex+er,ey-r*0.3-bt);
    c.moveTo(ex-er,ey-r*0.3-bt); c.lineTo(ex+er,ey-r*0.3+bt); c.stroke();
    // 口
    const mw=r*(0.28+curve*0.06)+open*r*0.05, mh=r*0.05+open*r*0.4, my=r*0.32;
    c.beginPath(); c.moveTo(-mw,my); c.quadraticCurveTo(0,my-curve*mw*0.6,mw,my);
    c.quadraticCurveTo(0,my+mh+curve*mw*0.2,-mw,my); c.closePath();
    c.fillStyle="#5a1810"; c.fill(); ink(c,r*0.055);
  }

  // 横丁の住人(手描き)。o:{x,y,scale,rot,mouthOpen,mouthCurve,brow,squash,dead}
  function creature(c,color,o,drawBody){
    o=o||{}; const s=(o.scale||1), sq=o.squash||1;
    c.save(); c.translate(o.x||0,o.y||0); c.rotate(o.rot||0); c.scale(s*sq, s/sq);
    drawBody(c,color,o); c.restore();
  }
  function buyoBody(c,color,o){ // ブヨ: ずんぐり
    c.beginPath(); c.moveTo(-46,90); c.quadraticCurveTo(-70,30,-40,-14);
    c.quadraticCurveTo(-10,-54,34,-22); c.quadraticCurveTo(62,18,42,94);
    c.quadraticCurveTo(-4,114,-46,90); fillInk(c,color,6);
    // 一本毛
    c.beginPath(); c.moveTo(0,-44); c.quadraticCurveTo(4,-66,18,-54); ink(c,6);
    face(c,44,o);
  }
  function machoBody(c,color,o){ // マッチョ: ちび頭でかい腕
    c.beginPath(); c.ellipse(-64,26,26,30,0,0,7); fillInk(c,PALETTE.macho2,6);
    c.beginPath(); c.ellipse(64,26,26,30,0,0,7); fillInk(c,PALETTE.macho2,6);
    c.beginPath(); c.moveTo(-52,96); c.quadraticCurveTo(-66,20,2,16);
    c.quadraticCurveTo(70,20,54,96); c.quadraticCurveTo(0,116,-52,96); fillInk(c,color,6);
    c.beginPath(); c.moveTo(0,24); c.lineTo(0,88); c.moveTo(-24,40); c.quadraticCurveTo(0,54,24,40); ink(c,4);
    c.beginPath(); c.arc(0,-18,26,0,7); fillInk(c,color,6);
    face(c,26,o);
  }
  function noppoBody(c,color,o){ // ノッポ: 首がのびる
    c.beginPath(); c.moveTo(-30,96); c.quadraticCurveTo(-46,40,-6,20);
    c.quadraticCurveTo(30,4,30,60); c.quadraticCurveTo(20,96,-30,96); fillInk(c,color,6);
    const neck=o.neck!=null?o.neck:40;
    c.fillStyle=color; c.fillRect(-9,-neck+18,18,neck); ink(c,0);
    c.beginPath(); c.moveTo(-9,20); c.lineTo(-9,-neck+18); c.moveTo(9,20); c.lineTo(9,-neck+18); ink(c,6);
    c.save(); c.translate(0,-neck+8);
    c.beginPath(); c.ellipse(0,0,22,19,0,0,7); fillInk(c,color,6);
    face(c,20,o); c.restore();
  }

  return {
    PALETTE, audio:{ ctx, resume, now, tone, noise }, sfx, Rhythm,
    say, pickVoice, hasVoice:("speechSynthesis"in window),
    draw:{ ink, fillInk, face, creature, buyoBody, machoBody, noppoBody },
  };
})();
