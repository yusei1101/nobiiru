/* =====================================================================
   ペタ拳: キャラのデータ係(KK.chars)。
   - キャラ1体のデータ形(下の SCHEMA コメント)
   - タイプ → 強さ(合計9ポイント固定) → 実際の倍率
   - 見せ方(display): 顔ハメ / 胴体 / まるごと。画像の形で おまかせ 判定
   - 「みほん」キャラ…画像をまだ登録してなくてもすぐ遊べる
   - 画像の読み込み＆ステッカー化(assets)。ポーズ画像は poses から引く(将来用)
   ===================================================================== */
window.KK = window.KK || {};
KK.chars = (function(){
  "use strict";
  const C = KK.cutout;

  /* SCHEMA(保存されるキャラ1体)
     { id, name, createdAt, updatedAt,
       image:  切り抜き済みPNG(dataURL)  ← ゲームはこれだけ見れば動く
       src:    { original:元画像(縮小), mask:マスクPNG|null, mode:"auto"|"circle"|"none", tol }  ← 再編集用
       type:   "auto"|"balance"|"power"|"speed"|"tank"|"custom"
       stats:  { hp, atk, def, spd }   体力/攻撃力/防御力/移動速度。各1〜5・合計12(BUDGET)
       diag:   画像しんだんの一言
       display:"auto"|"head"|"body"|"whole"   見せ方
       outfit: "suit"|"tights"|"gi"|"jersey"  顔ハメのときの服
       flip:   "none"|"mirror"   none=写真は反転しない(文字・ロゴ向け) / mirror=相手の方へ反転
       faceDir:"right"|"left"    元の写真が向いている方向(mirror のとき使う)
       voice:  "high"|"mid"|"low"
       shout:  必殺技の掛け声 / superName: 必殺技(超必殺)の名前
       poses:  { attack?, hit?, ko?, win? }  ← 将来: 状態ごとに差し替える画像(dataURL)。無ければ image を使う
     } */

  // ---- 能力値: 4つ × 1〜5、合計は必ず12。どれかを上げたら どれかを下げる＝極端なキャラでも総合力は同じ ----
  const STAT_KEYS=["hp","atk","def","spd"], STAT_MIN=1, STAT_MAX=5, BUDGET=12;
  const STAT_LABEL={ hp:"体力", atk:"攻撃力", def:"防御力", spd:"移動速度" };
  const TYPES = {
    auto:    { label:"画像しんだん", stats:null },
    balance: { label:"バランス", stats:{hp:3,atk:3,def:3,spd:3} },
    power:   { label:"パワー",   stats:{hp:3,atk:5,def:2,spd:2} },
    speed:   { label:"スピード", stats:{hp:2,atk:3,def:2,spd:5} },
    tank:    { label:"かたい",   stats:{hp:4,atk:2,def:4,spd:2} },
    custom:  { label:"じぶんで", stats:null },
  };
  const TYPE_TAG = { hp:"タフ型", atk:"パワー型", def:"かたい型", spd:"スピード型", balance:"バランス型" };
  const VOICES = {
    high:{ label:"たかい", rate:1.35, pitch:1.7, male:false },
    mid: { label:"ふつう", rate:1.15, pitch:1.0, male:false },
    low: { label:"ひくい", rate:0.95, pitch:0.55, male:true },
  };
  const DISPLAYS = {
    auto: { label:"おまかせ" },
    head: { label:"顔ハメ" },     // 写真を頭にして、ドットの体をつける
    body: { label:"胴体" },       // 写真を胴体にして、手足をつける
    whole:{ label:"まるごと" },   // 写真そのものが体。パンチはバネで飛び出す
  };
  const FLIPS = { none:{label:"反転しない(文字向け)"}, mirror:{label:"相手の方へ反転"} };
  // 顔ハメの服。色はドット絵らしく「本体色＋かげ色」
  const OUTFITS = {
    suit:   { label:"スーツ",   top:"#f1f0ea", sleeve:"#f1f0ea", pants:"#3c4a3a", shoe:"#1a1414", hand:"#e9b48c", tie:"#2b5bd8" },
    tights: { label:"赤タイツ", top:"#d9262c", sleeve:"#d9262c", pants:"#d9262c", shoe:"#d9262c", hand:"#d9262c" },
    gi:     { label:"道着",     top:"#f3efe2", sleeve:"#f3efe2", pants:"#f3efe2", shoe:"#e9b48c", hand:"#e9b48c", belt:"#1a1414" },
    jersey: { label:"ジャージ", top:"#2b54c9", sleeve:"#2b54c9", pants:"#2b54c9", shoe:"#f1f0ea", hand:"#e9b48c", stripe:"#f1f0ea" },
  };

  // 範囲外・合計ずれを直す。古い保存データ {power,speed,defense} もここで新形式へ
  function normalizeStats(st){
    let s = st || {};
    if(s.atk==null && s.power!=null) s={ hp:3, atk:s.power, def:s.defense, spd:s.speed };
    const o={}; for(const k of STAT_KEYS) o[k]=Math.max(STAT_MIN,Math.min(STAT_MAX,Math.round(+s[k]||3)));
    let sum=STAT_KEYS.reduce((a,k)=>a+o[k],0), guard=0;
    while(sum!==BUDGET && guard++<40){
      if(sum>BUDGET){ const k=STAT_KEYS.reduce((a,b)=>o[b]>o[a]?b:a); if(o[k]<=STAT_MIN) break; o[k]--; sum--; }
      else { const k=STAT_KEYS.reduce((a,b)=>o[b]<o[a]?b:a); if(o[k]>=STAT_MAX) break; o[k]++; sum++; }
    }
    return o;
  }
  function statSum(s){ return STAT_KEYS.reduce((a,k)=>a+(s[k]||0),0); }
  // 能力値(1〜5) → 戦闘用の倍率。3が基準(=1.0)。1段階の差は小さめ(±6〜8%)にしてあるので、
  // 極端に振っても「攻撃5・体力1」で 火力+14% / 体力−16% 程度に収まる。
  function mods(stats){
    const s=normalizeStats(stats);
    return {
      hp:    Math.round(1000*(1+0.08*(s.hp-3))),    // 840 〜 1160
      dmg:   1+0.07*(s.atk-3),                       // 0.86 〜 1.14 倍(与えるダメージ)
      taken: 1-0.06*(s.def-3),                       // 1.12 〜 0.88 倍(受けるダメージ)
      guard: 1+0.10*(s.def-3),                       // ガード耐久 0.8 〜 1.2 倍
      walk:  1+0.07*(s.spd-3),                       // 歩き 0.86 〜 1.14 倍
      jump:  1+0.04*(s.spd-3),
      push:  1+0.05*(s.atk-3),                       // ふっとばし力
    };
  }
  function statsFor(type, diagStats){
    const t=TYPES[type];
    if(t && t.stats) return Object.assign({},t.stats);
    return normalizeStats(diagStats || {hp:3,atk:3,def:3,spd:3});
  }
  function typeTag(stats){
    const s=normalizeStats(stats), v=STAT_KEYS.map(k=>s[k]), mx=Math.max(...v);
    if(mx-Math.min(...v)<=1) return TYPE_TAG.balance;
    return TYPE_TAG[STAT_KEYS[v.indexOf(mx)]];
  }
  // 見せ方の おまかせ判定: 丸く切った・正方形に近い → 顔ハメ / とても縦長 → まるごと / それ以外 → 胴体
  function resolveDisplay(ch, w, h){
    if(ch.display && ch.display!=="auto") return ch.display;
    const a=h/w;
    if(ch.src && ch.src.mode==="circle") return "head";
    if(a>=0.62 && a<=1.45) return "head";
    if(a>1.75) return "whole";
    return "body";
  }

  // ---------------- 名前・技名のおまかせ(野田ゲー的なしょうもなさ) ----------------
  const PICK=(a)=>a[Math.floor(Math.random()*a.length)];
  const NAME_A=["ペタペタ","ド根性","ハイパー","しょっぱい","まっすぐ","ゆるふわ","鋼鉄","寝起き","通りすがりの","元祖","にせ","ぬるぬる"];
  const NAME_B=["太郎","丸","マン","番長","大王","さん","くん","ちゃん","山","パイセン","1号","将軍"];
  const SHOUT=["くらえっ","どりゃー","ほいっ","いけー","そりゃっ","おりゃおりゃ","ぺたーん","ちぇすとー"];
  const SUPER_A=["超","真","ギガ","ド","極","大","メガ"];
  const SUPER_B=["ペタ落とし","おしつぶし","上からドーン","巨大化アタック","ぺちゃんこ","天からのおくりもの"];
  function randomName(){ return PICK(NAME_A)+PICK(NAME_B); }
  function randomShout(){ return PICK(SHOUT); }
  function randomSuper(){ return PICK(SUPER_A)+"・"+PICK(SUPER_B); }
  function randomOutfit(){ return PICK(Object.keys(OUTFITS)); }

  // ---------------- みほんキャラ(横丁の住人の「顔」を手描き) ----------------
  function drawSampleHead(o){
    const Y=window.Yokocho, D=Y.draw, cv=C.mkCanvas(220,230), c=cv.getContext("2d");
    c.translate(110,124);
    c.scale(o.sx||1, o.sy||1);
    c.beginPath(); c.arc(0,0,86,0,7); D.fillInk(c,o.skin,8);
    // 髪
    c.beginPath();
    if(o.hair==="bowl"){ c.arc(0,-6,92,Math.PI*1.0,Math.PI*2.0); c.lineTo(92,-10); c.quadraticCurveTo(0,-40,-92,-10); }
    else if(o.hair==="spike"){ c.moveTo(-88,-20); for(let i=0;i<=8;i++){ const a=Math.PI*(1+i/8); c.lineTo(Math.cos(a)*(i%2?118:88), Math.sin(a)*(i%2?118:88)-10); } c.lineTo(88,-20); c.quadraticCurveTo(0,-56,-88,-20); }
    else { c.arc(0,-10,90,Math.PI*1.08,Math.PI*1.92); c.quadraticCurveTo(30,-50,-80,-40); }
    c.closePath(); c.fillStyle=o.hairCol; c.fill(); c.lineWidth=6; c.strokeStyle="#1a1206"; c.stroke();
    D.face(c,80,{ mouthOpen:o.mouth||0.15, mouthCurve:o.curve==null?1:o.curve, brow:o.brow||0 });
    if(o.stache){ c.fillStyle="#1a1206"; c.beginPath(); c.ellipse(-20,22,22,8,0.2,0,7); c.ellipse(20,22,22,8,-0.2,0,7); c.fill(); }
    return cv;
  }
  const SAMPLES = [
    { id:"sample-buyo",  name:"ぶよ山",     type:"tank",  voice:"low",  outfit:"tights", shout:"どすこい", superName:"真・おなかプレス",
      head:{ skin:"#f0c29a", hairCol:"#2a1d14", hair:"bowl", sx:1.08, sy:0.95, mouth:0.3 } },
    { id:"sample-macho", name:"マッチョ田",   type:"power", voice:"low",  outfit:"suit",   shout:"ふんっ",   superName:"ギガ・筋肉落とし",
      head:{ skin:"#e3ae7e", hairCol:"#151110", hair:"spike", brow:1, curve:0.4, stache:true } },
    { id:"sample-noppo", name:"ひょろ川",   type:"speed", voice:"high", outfit:"jersey", shout:"ひょえー", superName:"超・のっぽ倒れ",
      head:{ skin:"#f6d2b0", hairCol:"#6b4e2e", hair:"side", sx:0.86, sy:1.08, mouth:0.6 } },
  ];
  let _samples=null;
  function samples(){
    if(_samples) return _samples;
    _samples = SAMPLES.map(s=>({ id:s.id, name:s.name, builtin:true, image:drawSampleHead(s.head).toDataURL("image/png"), type:s.type,
      stats:statsFor(s.type), diag:"横丁の じゅうにん", display:"head", outfit:s.outfit, flip:"mirror", faceDir:"right", voice:s.voice, shout:s.shout, superName:s.superName, poses:{} }));
    return _samples;
  }

  // ---------------- 画像 → 戦闘用アセット ----------------
  const cache = new Map(); // id+updatedAt → assets
  function build(ch, img){
    const base=C.scaled(img, 360);
    const st=C.makeSticker(base, 2, false);          // ドットの世界になじむ細い黒フチだけ
    const mini=C.makeSticker(C.scaled(img, 72), 3, false);
    const a={ ch, sticker:st.sticker, flash:st.flash, hurt:C.silhouette(st.sticker,"#ff2a2a"), mini:mini.sticker, thumb:C.scaled(img,160), poses:{},
      stats:normalizeStats(ch.stats) };
    a.flip = ch.flip==="mirror" ? "mirror" : "none";
    a.faceDir = ch.faceDir==="left" ? "left" : "right";
    a.mods=mods(a.stats);
    a.display=resolveDisplay(ch, base.width, base.height);
    a.outfit=OUTFITS[ch.outfit] || OUTFITS.suit;
    a.tag=typeTag(a.stats);
    // 状態に合う画像を返す。ポーズ画像が無ければ基本画像
    a.pose=(state)=>a.poses[state] || st;
    return a;
  }
  async function assets(ch){
    const key=ch.id+":"+(ch.updatedAt||0)+":"+(ch.display||"")+":"+(ch.outfit||"")+":"+(ch.flip||"");
    if(cache.has(key)) return cache.get(key);
    const img=await C.loadImage(ch.image);
    const a=build(ch,img);
    for(const k of Object.keys(ch.poses||{})){ // 将来: 状態ごとの差し替え画像
      try{ const pi=await C.loadImage(ch.poses[k]); a.poses[k]=C.makeSticker(C.scaled(pi,360),3,false); }catch(e){}
    }
    cache.set(key,a); return a;
  }

  return { TYPES, VOICES, DISPLAYS, OUTFITS, FLIPS, STAT_KEYS, STAT_LABEL, STAT_MIN, STAT_MAX, BUDGET,
    normalizeStats, statSum, mods, statsFor, typeTag, resolveDisplay, samples, assets, build,
    randomName, randomShout, randomSuper, randomOutfit };
})();
