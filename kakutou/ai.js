/* =====================================================================
   ペタ拳: CPU(KK.cpu)。人間と同じ {l,r,u,d,a,b,c,t} を返すだけ＝ズルはしない。
   ルールベース。2段構え:
     A) 反応(毎フレーム): ガード(技の段に合わせて立ち/しゃがみ)・スキに反撃・対空・投げぬけ・飛び道具よけ
        → 相手の行動を「見てから」反応するまでの遅れ(react)をレベルで変える
     B) 作戦(数十フレームごと): 間合い(近/中/遠)と状況で 行動を重みづけ抽選
        接近 / 距離をとる / 弱 / 強 / 下段 / 投げ / ガードで待つ / 飛び込み / 必殺 / 超必殺
        同じ行動ばかりにならないよう、直前の行動は選ばれにくくする
   ===================================================================== */
window.KK = window.KK || {};
KK.cpu = function(level){
  "use strict";
  const LV = [
    { react:16, think:26, guard:0.35, punish:0.25, antiAir:0.20, tech:0.10, combo:0.25, aggro:0.45 }, // よわい
    { react:10, think:16, guard:0.62, punish:0.60, antiAir:0.50, tech:0.35, combo:0.65, aggro:0.55 }, // ふつう
    { react:6,  think:10, guard:0.85, punish:0.90, antiAir:0.80, tech:0.60, combo:0.90, aggro:0.60 }, // つよい
  ][Math.max(0,Math.min(2,level))];
  const R=KK.RULES;
  let plan=null, planT=0, taps=[], seenMove=-1, seenProj=null, seenJump=false, punished=-1, techTried=false, comboDone=-1;
  const history=[];            // 直前の作戦(くり返し防止)
  let blockedCount=0, lastOppBlock=-1;
  const dbg={ action:"", reason:"", log:[] };

  function want(keys, hold){ taps=[].concat(keys).map(k=>({k, n:hold||2})); }
  function setPlan(p, frames, why){ plan=p; planT=frames; dbg.action=p.name||"?"; dbg.reason=why||""; dbg.log.push(dbg.action); if(dbg.log.length>400) dbg.log.shift(); }

  function pickWeighted(opts){
    const tot=opts.reduce((a,o)=>a+Math.max(0,o.w),0); let r=Math.random()*tot;
    for(const o of opts){ r-=Math.max(0,o.w); if(r<=0) return o; } return opts[opts.length-1];
  }

  // ---- B) 作戦 ----
  function strategy(me, opp, battle){
    const d=Math.abs(opp.x-me.x), fwd=opp.x>me.x?"r":"l", back=fwd==="r"?"l":"r";
    const lowHp = me.hp/me.maxHp < 0.3, oppGuardy = blockedCount>=2;
    const canSp = me.canUse("special",battle), superOK = me.meter>=R.METER_MAX;
    const opts=[];
    const add=(name,w,p,frames)=>{ const rep=history.filter(h=>h===name).length; opts.push({name,w:w/(1+rep*1.2),p,frames}); };
    if(superOK && d<520) add("super", 2.5, {name:"super", hold:["d"], tap:"c"}, 30);
    if(opp.state==="down"||opp.state==="getup"){ // ダウン中は 間合いを整えて待つ
      add("wait", 3, {name:"wait"}, 20); add("approach", d>140?3:0.5, {name:"approach", hold:[fwd]}, 14);
    } else if(d<105){            // 近距離
      add("jab",      2.4*LV.aggro, {name:"jab", tap:"a", combo:true}, 18);
      add("lowJab",   1.6*LV.aggro, {name:"lowJab", hold:["d"], tap:"a", combo:true}, 18);
      add("heavy",    1.2*LV.aggro, {name:"heavy", tap:"b", combo:true}, 26);
      add("sweep",    0.9*LV.aggro, {name:"sweep", hold:["d"], tap:"b"}, 34);
      add("throw",    oppGuardy?3.2:0.9, {name:"throw", tap:"t"}, 30);
      add("block",    lowHp?2.6:1.3, {name:"block", hold:[back]}, 24);
      add("backoff",  lowHp?2.2:1.0, {name:"backoff", hold:[back]}, 16);
      add("crBlock",  1.0, {name:"crBlock", hold:[back,"d"]}, 22);
    } else if(d<250){            // 中距離: さし合い
      add("approach", 2.2*LV.aggro, {name:"approach", hold:[fwd]}, 12);
      add("poke",     (d<140?2.2:0.3), {name:"poke", tap:"b", combo:true}, 26);
      add("jumpIn",   0.9, {name:"jumpIn", hold:[fwd], tap:"u", airAtk:true}, 40);
      add("special",  canSp && d>170 ? 0.8 : 0, {name:"special", tap:"c"}, 26);
      add("spacing",  lowHp?2.0:1.0, {name:"spacing", hold:[back]}, 14);
      add("wait",     0.8, {name:"wait", hold:[back]}, 14);
    } else {                     // 遠距離
      add("special",  canSp ? 1.3 : 0, {name:"special", tap:"c"}, 26);
      add("approach", 2.8, {name:"approach", hold:[fwd]}, 18);
      add("jumpIn",   0.5, {name:"jumpIn", hold:[fwd], tap:"u", airAtk:true}, 40);
      add("wait",     lowHp?1.5:0.4, {name:"wait"}, 16);
    }
    const o=pickWeighted(opts);
    history.push(o.name); if(history.length>3) history.shift();
    setPlan(o.p, o.frames + Math.floor(Math.random()*LV.think), "距離"+Math.round(d));
    if(o.p.tap) want(o.p.tap, 2);
    if(o.name==="throw"||o.name==="sweep") blockedCount=0;
  }

  // ---- A) 反応 ----
  function react(me, opp, battle){
    const d=Math.abs(opp.x-me.x), fwd=opp.x>me.x?"r":"l", back=fwd==="r"?"l":"r";
    // 相手の打撃: 発生を「見てから」 ガード(段に合わせる)
    if(opp.state==="attack" && opp.move && !opp.move.throw && opp.moveId!==seenMove){
      const mv=opp.move, reach = mv.box ? mv.box.x+mv.box.w : 9999;
      const seenAt = Math.min(LV.react, Math.max(1, mv.startup-1));
      // 本当に届く技だけガードする(届かない空振りは見送って反撃を狙う)
      if(opp.mt>=seenAt && opp.mt<mv.startup+mv.active && d<reach+R.HURT_W+14){
        seenMove=opp.moveId;
        if(Math.random()<LV.guard*(LV.react<=mv.startup?1:0.6)){
          const low = mv.level==="low";
          setPlan({name:"guard", hold: low?[back,"d"]:[back], guard:true}, mv.startup+mv.active-opp.mt+4, "相手の"+(mv.name||"攻撃"));
          taps=[]; return true;
        }
      }
    }
    // 相手のスキ(大きい硬直)に反撃
    if(opp.state==="attack" && opp.move && opp.moveId!==punished){
      const mv=opp.move, rec=mv.startup+mv.active+mv.recovery-opp.mt;
      if(opp.mt>=mv.startup+mv.active+Math.min(4,LV.react) && rec>=10 && d<210 && me.actionable){
        punished=opp.moveId;
        if(Math.random()<LV.punish){
          if(d<150){ setPlan({name:"punish", combo:true}, 24, "スキに反撃"); want(d<95?"a":"b",2); }
          else { setPlan({name:"punish", hold:[fwd], punishAt:150, combo:true}, Math.min(rec,24), "踏み込んで反撃"); taps=[]; }
          return true;
        }
      }
    }
    // 対空
    if(opp.state==="air" || (opp.state==="attack" && opp.move && opp.move.air)){
      if(!seenJump && opp.vy>0 && d<170 && opp.y>R.GROUND-200 && me.actionable){
        seenJump=true;
        if(Math.random()<LV.antiAir){ setPlan({name:"antiAir"}, 20, "対空"); want("b",2); }
        else { setPlan({name:"guardAir", hold:[back], guard:true}, 26, "飛び込みをガード"); taps=[]; }
        return true;
      }
    } else seenJump=false;
    // 飛び道具: とぶか ガード
    const proj=battle.projectiles.find(p=>p.owner!==me && Math.abs(p.x-me.x)<300 && Math.sign(me.x-p.x)===Math.sign(p.vx));
    if(proj && proj!==seenProj && (me.actionable || me.state==="land")){
      seenProj=proj;
      if(Math.random()<0.25+0.15*level && d<430){ setPlan({name:"jumpProj", hold:[fwd], airAtk:true}, 40, "飛び道具をとびこえる"); want("u",2); }
      else { setPlan({name:"guardProj", hold:[back], guard:true}, 30, "飛び道具をガード"); taps=[]; }
      return true;
    }
    return false;
  }

  const cpu = { debug:dbg, level:LV,
    // 指定フレームだけ「様子見」させる(テストや練習用。反応(ガード・反撃)はそのまま働く)
    idle(frames){ setPlan({name:"wait"}, frames, "様子見"); taps=[]; },
    read(me, opp, battle){
    if(!opp || !battle || battle.phase!=="fight") return {};
    const o={}, fwd=opp.x>me.x?"r":"l", back=fwd==="r"?"l":"r";
    // つかまれた → 投げぬけを狙う
    if(me.state==="thrown"){ if(!techTried && me.t>=2){ techTried=true; if(Math.random()<LV.tech) return {t:true}; } return {}; }
    techTried=false;
    // ガード硬直中は そのまま ガードを続ける
    if(me.state==="blockstun"){ o[back]=true; if(me.lowStance) o.d=true; return o; }
    // 相手にガードされた回数(多ければ投げを増やす)
    if(opp.state==="blockstun"){ const id=opp.lf-opp.t; if(id!==lastOppBlock){ lastOppBlock=id; blockedCount++; } }
    if(opp.state==="hitstun") blockedCount=0;

    if(!(plan && plan.guard && planT>0)) react(me, opp, battle);
    if(--planT<=0 && me.actionable) strategy(me, opp, battle);

    // 踏み込み反撃: 届く距離まで来たら強
    if(plan && plan.punishAt && Math.abs(opp.x-me.x)<plan.punishAt && me.actionable){ plan={name:"punish", combo:true}; want("b",2); }
    if(plan && plan.hold) for(const k of plan.hold) o[k]=true;
    // 空中攻撃: 落ちてきて相手に近ければ強
    if(plan && plan.airAtk && me.state==="air" && me.vy>2 && Math.abs(opp.x-me.x)<150) want("b",2);
    // コンボ: 当たったら(ガードされたら やめる)次を押す
    if(plan && plan.combo && me.state==="attack" && me.hasHit && comboDone!==me.moveId && opp.state==="hitstun"){
      comboDone=me.moveId;
      if(Math.random()<LV.combo){
        if(me.moveKey==="light"||me.moveKey==="crLight") want(me.chain<1?"a":"b",2);
        else if(me.moveKey==="heavy" && me.canUse("special",battle)) want("c",2);
      }
    }
    for(const t of taps){ if(t.n>0){ o[t.k]=true; t.n--; } }
    taps=taps.filter(t=>t.n>0);
    return o;
  } };
  return cpu;
};
