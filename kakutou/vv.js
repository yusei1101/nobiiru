/* =====================================================================
   ペタ拳: VOICEVOX 連携(KK.vv)。VOICEVOX は無料の音声合成ソフト(https://voicevox.hiroshiba.jp/)。
   - PCで VOICEVOX アプリを起動すると エンジン(127.0.0.1:50021)が立ち上がる。
   - serve.py 経由(/__vv/...)で つなぐので、同じWi-Fiのスマホからも PC の VOICEVOX で声を作れる。
   - 作った声(wav)は キャラのデータに保存する → 以後は VOICEVOX が無くても鳴る。
   - 利用規約により「VOICEVOX:キャラ名」のクレジット表記が必要(credit() で文字列を返す)。
   ===================================================================== */
window.KK = window.KK || {};
KK.vv = (function(){
  "use strict";
  let base=null, speakersCache=null;
  // PCのサーバー(serve.py)経由 → 同じPCの VOICEVOX 直接、の順に探す。
  // 公開サイト(https)からは どちらも届かないので探さない(待ち時間を出さない)
  const local = typeof location!=="undefined" && location.protocol==="http:";
  const BASES = local ? ["/__vv", "http://127.0.0.1:50021"] : [];

  async function ping(b){
    try{ const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),1500);
      const r=await fetch(b+"/version",{signal:ctl.signal,cache:"no-store"}); clearTimeout(tm);
      return r.ok; }catch(e){ return false; }
  }
  // つながる VOICEVOX があるか(毎回 確認しなおす: 途中で起動/終了されても追従)
  async function available(){
    for(const b of BASES){ if(await ping(b)){ base=b; return true; } }
    base=null; return false;
  }
  // 声の一覧 [{id, name, style, label}]
  async function speakers(){
    if(!base && !(await available())) return [];
    if(speakersCache) return speakersCache;
    const r=await fetch(base+"/speakers"); const js=await r.json(); const out=[];
    for(const sp of js) for(const st of sp.styles) out.push({ id:st.id, name:sp.name, style:st.name, label:sp.name+(st.name==="ノーマル"?"":"("+st.name+")") });
    speakersCache=out; return out;
  }
  // text を speaker の声で wav(Blob)に。opt: speed/pitch/intonation/volume
  async function synth(text, speaker, opt){
    if(!base && !(await available())) throw new Error("VOICEVOX が起動していません");
    opt=opt||{};
    const q=await (await fetch(base+"/audio_query?text="+encodeURIComponent(text)+"&speaker="+speaker,{method:"POST"})).json();
    q.speedScale = opt.speed!=null?opt.speed:1.1;
    q.pitchScale = opt.pitch!=null?opt.pitch:0;
    q.intonationScale = opt.intonation!=null?opt.intonation:1.35;
    q.volumeScale = opt.volume!=null?opt.volume:1.2;
    q.prePhonemeLength=0.05; q.postPhonemeLength=0.08;
    const r=await fetch(base+"/synthesis?speaker="+speaker,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(q)});
    if(!r.ok) throw new Error("音声の生成に失敗しました");
    return await r.blob();
  }
  function blobToDataURL(b){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(b); }); }
  function credit(name){ return "VOICEVOX:"+name; }
  return { available, speakers, synth, blobToDataURL, credit, local, get base(){ return base; } };
})();
