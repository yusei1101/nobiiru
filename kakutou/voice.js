/* =====================================================================
   ペタ拳: 声(KK.voice)。
   mode:
     "vv"     … VOICEVOX で作った音声(アナウンス=同梱ファイル、キャラ=保存した音声)。無いセリフはペチャクチャ声
     "babble" … ペチャクチャ声。文字を音節に分け、母音(あいうえお)ごとに声っぽい音色の
                「ピョ」「ポ」を鳴らす。レトロゲームの会話音のような声。WebAudioだけで作るので
                インストール不要・オフライン・どのスマホでも同じ声。
     "tts"    … 端末の読み上げ(SpeechSynthesis)。端末ごとに声が違う
     "off"    … 声なし(効果音だけ)
   将来 VOICEVOX 等の録音音声を使うときは play() の分岐を1つ足すだけ。
   ===================================================================== */
window.KK = window.KK || {};
KK.voice = (function(){
  "use strict";
  let mode="babble";
  // 声の高さなど(キャラの「こえ」設定と アナウンス)
  const PRESET = {
    high:{ pitch:470, rate:1.25, wave:"square",   bright:1.15 },
    mid: { pitch:280, rate:1.05, wave:"sawtooth", bright:1.0 },
    low: { pitch:135, rate:0.9,  wave:"sawtooth", bright:0.85 },
    narr:{ pitch:105, rate:0.78, wave:"sawtooth", bright:0.9, echo:true, big:true },
  };
  // 母音ごとのフォルマント(声の「あ・い・う・え・お」らしさを決める2つの山)
  const FORMANT = { a:[800,1250], i:[300,2300], u:[360,1150], e:[520,1900], o:[480,820], n:[280,1500] };
  const ROWS = { a:"あかさたなはまやらわがざだばぱぁゃ", i:"いきしちにひみりぎじぢびぴぃ", u:"うくすつぬふむゆるぐずづぶぷぅゅっゔ", e:"えけせてねへめれげぜでべぺぇ", o:"おこそとのほもよろをごぞどぼぽぉょ", n:"ん" };
  const V={}; for(const k in ROWS) for(const ch of ROWS[k]) V[ch]=k;
  const SMALL="ぁぃぅぇぉゃゅょ";

  // 文字列 → 音節の列 [{v:"a", len:1, accent:bool}]
  function toMora(text){
    const out=[]; let prevV="a";
    for(const raw of String(text)){
      let ch=raw; const code=ch.charCodeAt(0);
      if(code>=0x30a1 && code<=0x30f6) ch=String.fromCharCode(code-0x60);   // カタカナ→ひらがな
      if(ch==="ー"||ch==="〜"||ch==="~"){ if(out.length) out[out.length-1].len+=0.8; continue; }
      if(ch==="っ"||ch==="ッ"){ out.push({v:"pause",len:0.5}); continue; }
      if(SMALL.includes(ch) && out.length){ out[out.length-1].v=V[ch]||out[out.length-1].v; continue; } // きゃ→1音節
      if(V[ch]){ out.push({v:V[ch],len:1}); prevV=V[ch]; continue; }
      if(/[!！]/.test(ch)){ if(out.length) out[out.length-1].accent=true; continue; }
      if(/[?？]/.test(ch)){ if(out.length) out[out.length-1].rise=true; continue; }
      if(/[、。,.・\s]/.test(ch)){ out.push({v:"pause",len:0.7}); continue; }
      if(/[a-zA-Z]/.test(ch)){ const lv="aiueo".includes(ch.toLowerCase())?ch.toLowerCase():null; if(lv) out.push({v:lv,len:0.8}); else if(Math.random()<0.4) out.push({v:prevV,len:0.6}); continue; }
      if(/[0-9]/.test(ch)){ out.push({v:"i",len:0.8},{v:"o",len:0.8}); continue; }
      if(/[一-鿿]/.test(ch)){ const vs="aiueo"; out.push({v:vs[code%5],len:1},{v:vs[(code>>3)%5],len:1}); continue; } // 漢字=2音節(読みは分からないので形から)
    }
    return out.slice(0,40);
  }

  let echoNode=null;
  function bus(ac, echo){
    if(!echo) return ac.destination;
    if(!echoNode){ // 会場っぽい やまびこ
      const inp=ac.createGain(), dl=ac.createDelay(1), fb=ac.createGain(), wet=ac.createGain();
      dl.delayTime.value=0.16; fb.gain.value=0.32; wet.gain.value=0.45;
      inp.connect(ac.destination); inp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(ac.destination);
      echoNode=inp; }
    return echoNode;
  }
  // 1音節: 声帯(のこぎり波)→ 2つの山(F1,F2)を強調 → 音量の山
  function syllable(ac, out, t, dur, f0, v, P, accent){
    const F=FORMANT[v]||FORMANT.a;
    const src=ac.createOscillator(); src.type=P.wave;
    const jitter=1+(Math.random()-0.5)*0.06;
    src.frequency.setValueAtTime(f0*jitter*(accent?1.25:1), t);
    src.frequency.linearRampToValueAtTime(f0*jitter*(accent?1.05:0.94), t+dur);
    const g=ac.createGain(), mix=ac.createGain(); mix.gain.value=1;
    const vol=P.big?0.5:0.32;
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+0.012);
    g.gain.setValueAtTime(vol,t+dur*0.6); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    for(const [fr,q,amp] of [[F[0]*P.bright,6,1],[F[1]*P.bright,9,0.55]]){
      const bp=ac.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=fr; bp.Q.value=q;
      const a=ac.createGain(); a.gain.value=amp*3; src.connect(bp); bp.connect(a); a.connect(mix);
    }
    mix.connect(g); g.connect(out);
    src.start(t); src.stop(t+dur+0.03);
  }
  let busyUntil=0;
  function babble(text, presetKey, opt){
    const A=window.Yokocho && Yokocho.audio; const ac=A && A.ctx(); if(!ac) return;
    const P=Object.assign({}, PRESET[presetKey]||PRESET.mid);
    if(opt && opt.pitch) P.pitch*=opt.pitch;
    const mora=toMora(text); if(!mora.length) return;
    let t=Math.max(ac.currentTime+0.02, (opt&&opt.interrupt)?ac.currentTime+0.02:busyUntil);
    const out=bus(ac, P.echo), unit=0.085/P.rate;
    mora.forEach((m,i)=>{
      const dur=unit*m.len;
      if(m.v==="pause"){ t+=dur; return; }
      // 抑揚: 文の頭で高く、だんだん下がる(日本語っぽい)。最後に「！」なら上げる
      const fall=1-0.18*(i/Math.max(1,mora.length-1)), rise=m.rise?1.3:1;
      syllable(ac, out, t, dur*0.92, P.pitch*fall*rise, m.v, P, m.accent);
      t+=dur;
    });
    busyUntil=t;
  }

  function tts(text, presetKey){
    if(!("speechSynthesis" in window) || !window.Yokocho) return;
    if(presetKey==="narr"){ Yokocho.say(text,{char:"narr",interrupt:true}); return; }
    const v=(KK.chars && KK.chars.VOICES[presetKey]) || {rate:1.15,pitch:1,male:false};
    Yokocho.say(text,{rate:v.rate,pitch:v.pitch,male:v.male,interrupt:true});
  }

  // text を presetKey("high"|"mid"|"low"|"narr")の声で(録音なしの声)
  function play(text, presetKey, opt){
    if(mode==="off") return;
    if(mode==="tts") return tts(text, presetKey);
    babble(text, presetKey, Object.assign({interrupt:true},opt||{}));
  }

  // ---------------- VOICEVOX で作った音声(wav)を鳴らす ----------------
  // アナウンス: kakutou/voice/manifest.json に一覧(tools/make_announcer.py で作る)
  // キャラ: ch.voiceClips = { shout, super, name, win }(保存時に作って キャラと一緒に保存)
  let manifest=null; const bufCache=new Map(); const playing={};
  async function loadManifest(){
    try{ const r=await fetch("kakutou/voice/manifest.json",{cache:"no-store"}); if(r.ok) manifest=await r.json(); }catch(e){}
    return manifest;
  }
  async function decode(src){
    const A=window.Yokocho && Yokocho.audio; const ac=A && A.ctx(); if(!ac) return null;
    if(bufCache.has(src)) return bufCache.get(src);
    const pr=(async()=>{ const ab=await (await fetch(src)).arrayBuffer(); return await new Promise((res,rej)=>ac.decodeAudioData(ab,res,rej)); })();
    bufCache.set(src,pr); try{ return await pr; }catch(e){ bufCache.delete(src); return null; }
  }
  async function playClip(src, channel, echo){
    const A=window.Yokocho && Yokocho.audio; const ac=A && A.ctx(); if(!ac) return false;
    const buf=await decode(src); if(!buf) return false;
    if(playing[channel]){ try{ playing[channel].stop(); }catch(e){} }
    const s=ac.createBufferSource(); s.buffer=buf; const g=ac.createGain(); g.gain.value=1.0;
    s.connect(g); g.connect(bus(ac, echo)); s.start(); playing[channel]=s; return true;
  }
  // アナウンス(key: round1/final/fight/ko/timeup/perfect/draw/win/vs/title)
  function announce(key, text, ch){
    if(mode==="off") return;
    if(mode==="vv"){
      const own = ch && ch.voiceClips && ch.voiceClips[key];          // 「○○の かち」等 キャラ名入り
      if(own){ playClip(own,"narr",false); return; }
      const f = manifest && manifest.files && manifest.files[key];
      if(f){ playClip("kakutou/voice/"+f,"narr",false); return; }
    }
    play(text,"narr");
  }
  // キャラのセリフ(which: shout/super)
  function line(ch, which, text, presetKey){
    if(mode==="off") return;
    const clip = ch && ch.voiceClips && ch.voiceClips[which];
    if(mode==="vv" && clip){ playClip(clip,"char"+((ch&&ch.id)||""),false); return; }
    play(text, presetKey||"mid");
  }
  const MODES={ vv:"VOICEVOX", babble:"ペチャクチャ", tts:"よみあげ", off:"なし" };
  return { play, announce, line, playClip, loadManifest, get manifest(){ return manifest; },
    setMode(m){ if(MODES[m]) mode=m; }, get mode(){ return mode; }, MODES, toMora };
})();
