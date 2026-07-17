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
  // 声のバリエーション: 端末の日本語音声を複数使い分け＋キャラごとに rate/pitch を変える。
  let _vlist=null;
  function jaVoices(){ if(!("speechSynthesis"in window)) return [];
    if(_vlist) return _vlist;
    const vs=speechSynthesis.getVoices();
    _vlist = vs.filter(v=>/^ja/i.test(v.lang)); return _vlist; }
  if("speechSynthesis"in window){ try{ speechSynthesis.onvoiceschanged=()=>{ _vlist=null; jaVoices(); }; }catch(e){} }
  // 男女で別の音声を選ぶ(名前で当たらない端末でも index を変えて必ず声色を変える)
  function pickVoice(male){
    const vs=jaVoices(); if(!vs.length) return null;
    if(male) return vs.find(v=>/ichiro|otoya|male|男|hattori|daichi/i.test(v.name)) || vs[1] || vs[0];
    return vs.find(v=>/ayumi|haruka|sayaka|kyoko|o-?ren|female|女|nanami|mizuki/i.test(v.name)) || vs[0];
  }
  // キャラ声プリセット。char を渡すと声色が変わる。
  const CHARV = {
    ossan:{rate:1.0,pitch:0.7,male:true},   // つき手のおっさん
    niisan:{rate:1.28,pitch:1.05,male:true},// 若い男
    neesan:{rate:1.2,pitch:1.45,male:false},// 女性
    baa:{rate:0.95,pitch:0.95,male:false},  // 年配
    chibi:{rate:1.5,pitch:1.7,male:false},  // 子供っぽい
    mochi:{rate:1.4,pitch:1.6,male:false},  // 化け物もち(甲高い)
    narr:{rate:1.15,pitch:1.0,male:false},  // ナレーション
  };
  // text を喋る。声はタイミングが甘いので「掛け声・反応」の飾りに使う(拍の芯は音で)。
  function say(text,opt){
    opt=opt||{}; if(!("speechSynthesis"in window)) return;
    const c = (opt.char && CHARV[opt.char]) ? CHARV[opt.char] : null;
    const male = opt.male!=null ? opt.male : (c ? c.male : false);
    try{
      if(opt.interrupt) speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      const v=pickVoice(male); if(v) u.voice=v; u.lang="ja-JP";
      u.rate = opt.rate!=null?opt.rate:(c?c.rate:1.15);
      u.pitch= opt.pitch!=null?opt.pitch:(c?c.pitch:1);
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

  // 横丁の住人(手描き)。動物でなく「人」。o:{x,y,scale,rot,mouthOpen,mouthCurve,brow,squash,dead,arm}
  function creature(c,color,o,drawBody){
    o=o||{}; const s=(o.scale||1), sq=o.squash||1;
    c.save(); c.translate(o.x||0,o.y||0); c.rotate(o.rot||0); c.scale(s*sq, s/sq);
    drawBody(c,color,o); c.restore();
  }
  // 手描きの人。頭+髪+顔・胴(服)・腕・足。cloth=服色, o.hair/o.skin/o.build/o.arm。
  function personBody(c, cloth, o){
    const hair=o.hair||"#3a2a1a", skin=o.skin||"#f0c29a", b=o.build||1, arm=o.arm||0;
    // 足
    c.strokeStyle=PALETTE.ink; c.lineWidth=13; c.lineCap="round";
    c.beginPath(); c.moveTo(-16*b,50); c.lineTo(-16*b,96); c.moveTo(16*b,50); c.lineTo(16*b,96); c.stroke();
    // 胴(服)
    c.beginPath(); c.moveTo(-34*b,54); c.quadraticCurveTo(-40*b,-6,0,-16);
    c.quadraticCurveTo(40*b,-6,34*b,54); c.quadraticCurveTo(0,68,-34*b,54); fillInk(c,cloth,6);
    // 腕(下ろす。arm>0で上げる)
    c.strokeStyle=PALETTE.ink; c.lineWidth=12; c.lineCap="round";
    c.beginPath(); c.moveTo(-30*b,6); c.lineTo(-42*b,42-arm*74);
    c.moveTo(30*b,6); c.lineTo(42*b,42-arm*74); c.stroke();
    // 頭
    c.save(); c.translate(0,-46);
    c.beginPath(); c.arc(0,0,27,0,7); fillInk(c,skin,5);
    // 髪(上半分をかぶせる)
    c.beginPath(); c.arc(0,-3,29,Math.PI*1.02,Math.PI*1.98); c.fillStyle=hair; c.fill();
    c.lineWidth=3; c.strokeStyle=PALETTE.ink; c.stroke();
    face(c,27,o);
    c.restore();
  }
  // 3人の住人。服色は引数(mochiが渡す)、体格/髪/肌で描き分け。
  function buyoBody(c,cloth,o){ personBody(c,cloth,Object.assign({hair:"#3a2a1a",skin:"#f0c29a",build:1.18},o)); } // ずんぐりおっさん
  function machoBody(c,cloth,o){ personBody(c,cloth,Object.assign({hair:"#1f1b18",skin:"#e3ae7e",build:1.4},o)); }  // がたい
  function noppoBody(c,cloth,o){ personBody(c,cloth,Object.assign({hair:"#6b4e2e",skin:"#f6d2b0",build:0.85},o)); }  // ひょろ

  return {
    PALETTE, audio:{ ctx, resume, now, tone, noise }, sfx, Rhythm,
    say, pickVoice, jaVoices, hasVoice:("speechSynthesis"in window),
    draw:{ ink, fillInk, face, creature, personBody, buyoBody, machoBody, noppoBody },
  };
})();
