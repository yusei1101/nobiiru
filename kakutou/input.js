/* =====================================================================
   ペタ拳: 入力係(KK.input)。
   どの入力も同じ形 {l,r,u,d,a,b,c,t}(押しっぱなし)を返す「コントローラ」にそろえる。
   l/r=左右 u=ジャンプ d=しゃがみ a=弱 b=強 c=必殺 t=投げ(弱+強の同時押しでも出る)。
   ガードは「相手と反対方向を押す」なので専用キーは無い。
   キーボード・タッチ・ゲームパッド・CPU を自由に組み合わせられる(merge)。

   遅延対策: キーを押した瞬間を「ラッチ」しておき、1フレーム(16ms)より短いタップでも
   次の更新で必ず1回は押されたことにする。ただし古い押下(メニューで押したENTER等)は拾わない。
   ===================================================================== */
window.KK = window.KK || {};
KK.input = (function(){
  "use strict";
  const down = new Set();
  const latch = new Map();               // code → 押した時刻
  const LATCH_MS = 60;
  const now = ()=> (window.performance && performance.now) ? performance.now() : Date.now();
  addEventListener("keydown", e=>{
    if(e.target && (e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")) return;
    if(!down.has(e.code)) latch.set(e.code, now());
    down.add(e.code);
    if(KK.input.capture && /^(Arrow|Space)/.test(e.code)) e.preventDefault();
  });
  addEventListener("keyup", e=>down.delete(e.code));
  addEventListener("blur", ()=>{ down.clear(); latch.clear(); });

  const MAPS = {
    // 1人であそぶ: どっちの手癖でもいけるよう2通り
    solo: { l:["KeyA","ArrowLeft"], r:["KeyD","ArrowRight"], u:["KeyW","ArrowUp","Space"], d:["KeyS","ArrowDown"],
            a:["KeyJ","KeyZ"], b:["KeyK","KeyX"], c:["KeyL","KeyC"], t:["KeyI","KeyV"] },
    // ふたりで: 1Pは左側、2Pは右側
    p1:   { l:["KeyA"], r:["KeyD"], u:["KeyW"], d:["KeyS"], a:["KeyF"], b:["KeyG"], c:["KeyH"], t:["KeyT"] },
    p2:   { l:["ArrowLeft"], r:["ArrowRight"], u:["ArrowUp"], d:["ArrowDown"],
            a:["Numpad1","Comma"], b:["Numpad2","Period"], c:["Numpad3","Slash"], t:["Numpad4","Semicolon"] },
  };
  function keyboard(mapName){
    const m=MAPS[mapName];
    return { read(){
      const o={}, tn=now();
      for(const k in m){ o[k]=false;
        for(const c of m[k]){ if(down.has(c)) o[k]=true;
          const lt=latch.get(c); if(lt!=null){ if(tn-lt<=LATCH_MS) o[k]=true; latch.delete(c); } } }
      return o; } };
  }

  // ゲームパッド(標準配置)。十字/左スティック=移動、A=弱 X=強 B=必殺 Y=投げ
  function gamepad(index){
    return { read(){
      const pads=navigator.getGamepads ? navigator.getGamepads() : [];
      const p=pads && pads[index]; if(!p) return {};
      const b=(i)=>!!(p.buttons[i] && p.buttons[i].pressed), ax=p.axes[0]||0, ay=p.axes[1]||0;
      return { l:b(14)||ax<-0.5, r:b(15)||ax>0.5, u:b(12)||ay<-0.6, d:b(13)||ay>0.6,
               a:b(0), b:b(2), c:b(1), t:b(3) };
    } };
  }

  // 画面ボタン(スマホ)。data-k="l" などの要素を押している間 true(短いタップもラッチ)
  function touch(root){
    const st={}, tap={};
    root.querySelectorAll("[data-k]").forEach(el=>{
      const k=el.dataset.k, ids=new Set();
      const on=(e)=>{ e.preventDefault(); ids.add(e.pointerId); st[k]=true; tap[k]=true; el.classList.add("on"); };
      const off=(e)=>{ ids.delete(e.pointerId); if(!ids.size){ st[k]=false; el.classList.remove("on"); } };
      el.addEventListener("pointerdown",on); el.addEventListener("pointerup",off);
      el.addEventListener("pointercancel",off); el.addEventListener("pointerleave",off);
    });
    return { read(){ const o={}; for(const k in st){ o[k]=st[k]||tap[k]; tap[k]=false; } return o; } };
  }

  /* スマホ用パッド。
     左半分: 触れた所にスティックが出る(フローティング)。引っぱった向きで l/r/u/d。ななめ(しゃがみガード=下+後ろ)もOK
     右側:   ボタン。指をすべらせて別のボタンへ移れる(弱→強 の ずらし押し)。2本指で同時押し(投げ=弱+強)もOK */
  function touchPad(root){
    const st={}, tap={}, zone=root.querySelector("[data-stick]"), base=root.querySelector(".stickBase"), knob=root.querySelector(".stickKnob");
    const btns=[...root.querySelectorAll("[data-k]")];
    let stickId=null, ox=0, oy=0;
    const DEAD=16, R=56;
    const setDir=(dx,dy)=>{ st.l=dx<-DEAD; st.r=dx>DEAD; st.u=dy<-R*0.55; st.d=dy>R*0.45;
      for(const k of ["l","r","u","d"]) if(st[k]) tap[k]=true;
      const L=Math.hypot(dx,dy), k=L>R?R/L:1; if(knob) knob.style.transform="translate("+(dx*k)+"px,"+(dy*k)+"px)"; };
    if(zone){
      zone.addEventListener("pointerdown",e=>{ if(stickId!==null) return; e.preventDefault(); stickId=e.pointerId; try{ zone.setPointerCapture(e.pointerId); }catch(_){}
        const r=root.getBoundingClientRect(); ox=e.clientX; oy=e.clientY;
        if(base){ base.style.left=(ox-r.left)+"px"; base.style.top=(oy-r.top)+"px"; base.classList.add("on"); } setDir(0,0); });
      zone.addEventListener("pointermove",e=>{ if(e.pointerId!==stickId) return; e.preventDefault(); setDir(e.clientX-ox, e.clientY-oy); });
      const end=e=>{ if(e.pointerId!==stickId) return; stickId=null; setDir(0,0); if(base) base.classList.remove("on"); };
      zone.addEventListener("pointerup",end); zone.addEventListener("pointercancel",end);
    }
    // ボタン: 指ごとに「いま乗っているボタン」を追う
    const fingers=new Map(); // pointerId → key
    const refresh=()=>{ const on=new Set(fingers.values()); for(const b of btns){ const k=b.dataset.k, v=on.has(k); if(v && !st[k]) tap[k]=true; st[k]=v; b.classList.toggle("on",v); } };
    const keyAt=(x,y)=>{ const el=document.elementFromPoint(x,y); const b=el && el.closest && el.closest("[data-k]"); return b && root.contains(b) ? b.dataset.k : null; };
    for(const b of btns){
      b.addEventListener("pointerdown",e=>{ e.preventDefault(); try{ b.releasePointerCapture(e.pointerId); }catch(_){} fingers.set(e.pointerId,b.dataset.k); refresh(); });
    }
    root.addEventListener("pointermove",e=>{ if(!fingers.has(e.pointerId)) return; const k=keyAt(e.clientX,e.clientY); if(k && k!==fingers.get(e.pointerId)){ fingers.set(e.pointerId,k); refresh(); } });
    const up=e=>{ if(fingers.delete(e.pointerId)) refresh(); };
    root.addEventListener("pointerup",up); root.addEventListener("pointercancel",up);
    addEventListener("pointerup",up); addEventListener("pointercancel",up);
    root.addEventListener("contextmenu",e=>e.preventDefault());
    return { read(){ const o={}; for(const k of ["l","r","u","d","a","b","c","t"]){ o[k]=!!(st[k]||tap[k]); tap[k]=false; } return o; },
      reset(){ fingers.clear(); stickId=null; for(const k in st) st[k]=false; refresh(); if(base) base.classList.remove("on"); } };
  }

  function merge(list){
    return { read(me,opp,battle){ const o={};
      for(const c of list){ const r=c.read(me,opp,battle)||{}; for(const k in r) o[k]=o[k]||r[k]; }
      return o; } };
  }
  return { keyboard, gamepad, touch, touchPad, merge, MAPS, capture:false };
})();
