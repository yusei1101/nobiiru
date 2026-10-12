/* =====================================================================
   ペタ拳: 格闘の芯(KK.Fighter / KK.RULES / KK.MOVES)。
   - 画面は論理 960x540 固定。x=キャラ中心, y=足元。
   - 1フレーム=1/60秒の固定ステップ。技は 発生(startup)/持続(active)/硬直(recovery) のフレームで定義。
   - 当たり判定(やられ判定)は画像の形に関係なく全員同じ箱＝どんな画像でも公平。しゃがむと低くなる。
   - ガードは「相手と反対方向を押す」。立ちガード=上段/中段/空中攻撃、しゃがみガード=上段/中段/下段。
   - 打撃 > 投げの出かかり、投げ > ガード、ガード > 打撃 の三すくみ。
   ===================================================================== */
window.KK = window.KK || {};
(function(){
  "use strict";

  const RULES = {
    W:960, H:540, GROUND:470, WALL_L:72, WALL_R:888,
    GRAV:0.78, JUMP_V:16.4, JUMP_VX:4.6, WALK_F:4.1, WALK_B:3.3,
    HURT_W:36, HURT_H:200, HURT_H_CROUCH:128, PUSH_W:32,
    BUFFER:7,            // 先行入力の猶予(フレーム)
    GUARD_MAX:100, GUARD_REGEN:0.45, GUARD_BREAK_STUN:55,
    METER_MAX:100,
    THROW_TECH:10,       // 投げられてから この フレーム以内に投げボタンで「投げぬけ」
    THROW_INV:6,         // 硬直が とけた直後は投げられない(重ね投げ防止)
    HITSTUN_DECAY:3,     // 4段目以降、コンボが1段のびるごとに 相手の硬直が これだけ短くなる(永久コンボ防止)
    HITSTUN_MIN:8,
  };
  const R=RULES;

  /* ===== 技表(すべての攻撃のパラメータ) =====
     startup 発生F / active 持続F / recovery 硬直F / dmg ダメージ
     chip      ガードされた時に通るダメージの割合(通常技の削りではKOしない。canChipKO の技だけ削りKOあり)
     hitstun   当てた相手の硬直F    blockstun ガードさせた相手の硬直F
     push      ノックバック(吹き飛ばし)の強さ   hitstop 当たった瞬間に止まるF   guard ガード耐久を削る量
     box       攻撃判定(向いている方向基準。x=前方, y=足元から上)。攻撃できる距離 = box.x+box.w
     level     high=上段(しゃがみで空振り) / mid=中段 / low=下段(しゃがみガードのみ) / overhead=空中技(立ちガードのみ)
     cancel    ヒット or ガードさせた時に キャンセルして出せる技(=コンボの接続条件)。弱どうしは chain 回まで
     knockdown ダウンさせる   meter ゲージ増加   cooldown 次に出せるまでのF                                   */
  const MOVES = {
    light:   { name:"立ち弱", startup:4,  active:3, recovery:9,  dmg:50,  chip:0.12, hitstun:14, blockstun:10, push:5,  hitstop:5, guard:12, level:"high",
               box:{x:18,y:-162,w:88,h:32}, meter:5, words:["ペチ","パシッ","ペシ"], cancel:["light","crLight","heavy","crHeavy","special","super"] },
    heavy:   { name:"立ち強", startup:9,  active:4, recovery:19, dmg:110, chip:0.18, hitstun:21, blockstun:14, push:10, hitstop:8, guard:26, level:"mid",
               box:{x:22,y:-96,w:110,h:46}, meter:9, words:["ドカッ","バキッ","ボコッ"], cancel:["special","super"] },
    crLight: { name:"しゃがみ弱", startup:4, active:3, recovery:8, dmg:40, chip:0.10, hitstun:13, blockstun:9, push:4, hitstop:5, guard:10, level:"low", crouch:true,
               box:{x:16,y:-48,w:90,h:32}, meter:4, words:["チョン","ペシ"], cancel:["light","crLight","heavy","crHeavy","special","super"] },
    crHeavy: { name:"足払い", startup:10, active:4, recovery:24, dmg:90, chip:0.18, hitstun:20, blockstun:13, push:6, hitstop:8, guard:22, level:"low", crouch:true,
               knockdown:true, sweep:true, box:{x:20,y:-32,w:120,h:30}, meter:9, words:["ズザッ","スパーン"] },
    airLight:{ name:"空中弱", startup:3,  active:7, recovery:6,  dmg:45,  chip:0.12, hitstun:14, blockstun:9,  push:4,  hitstop:5, guard:10, level:"overhead", air:true,
               box:{x:2,y:-112,w:80,h:58},  meter:5, words:["ペチ","ピシ"] },
    airHeavy:{ name:"空中強", startup:6,  active:6, recovery:8,  dmg:90,  chip:0.15, hitstun:19, blockstun:12, push:7,  hitstop:7, guard:22, level:"overhead", air:true,
               box:{x:6,y:-92,w:98,h:70},  meter:8, words:["ドスッ","ゴン"] },
    throw:   { name:"投げ",   startup:5,  active:2, recovery:22, dmg:120, throw:true, range:88, meter:10 },
    special: { name:"必殺",   startup:13, active:0, recovery:24, projectile:true, cooldown:60 },   // 撃ったあと 約1.6秒は撃てない
    super:   { name:"超必殺", startup:8,  active:0, recovery:40, isSuper:true },
  };
  // 飛び道具・超必殺・投げの「当たり方」
  const PROJ_HIT  = { name:"飛び道具", dmg:90,  chip:0.16, canChipKO:true, hitstun:18, blockstun:14, push:7,  hitstop:7,  guard:20, meter:8, level:"mid", words:["ドーン","ボン"] };
  const SUPER_HIT = { name:"超必殺",   dmg:300, chip:0.18, canChipKO:true, hitstun:30, blockstun:24, push:12, hitstop:16, guard:60, meter:0, level:"mid", knockdown:true, words:["ズドォォン","ぺちゃんこ"] };
  const THROW_HIT = { name:"投げ",     dmg:120, hitstun:0, push:8, hitstop:10, meter:10, knockdown:true, unblockable:true, words:["ポイッ","どりゃっ"] };

  const ACTIONABLE = { idle:1, walk:1, crouch:1, guard:1, cguard:1 };
  const P = KK.pixel, INK = P ? P.INK : "#000";

  class Fighter{
    constructor(idx, asset){
      this.idx=idx; this.a=asset; this.m=asset.mods;
      this.maxHp=this.m.hp; this.meter=0; this.wins=0;
      this.glove = idx===0 ? "#e8443a" : "#3a7be8";
      this.layoutPhoto();
      this.reset();
    }
    reset(){
      this.x = this.idx===0 ? 300 : 660; this.y=R.GROUND; this.vx=0; this.vy=0;
      this.facing = this.idx===0 ? 1 : -1;
      this.hp=this.maxHp; this.state="idle"; this.t=0;
      this.move=null; this.moveKey=null; this.mt=0; this.hasHit=false; this.chain=0; this.airUsed=false;
      this.stun=0; this.inv=0; this.flash=0; this.combo=0; this.comboDmg=0; this.comboDone=true;
      this.guardMax=Math.round(R.GUARD_MAX*(this.m.guard||1)); this.guardHp=this.guardMax; this.jumpDir=0;
      this.cd={}; this.vf=this.facing; this.lowStance=false; this.throwInv=0; this.thrower=null; this.victim=null;
      this.held={}; this.prev={}; this.press={}; this.lf=0; this.anim=Math.random()*10; this.trailHp=this.hp;
      this.shakeX=0; this.lastHitBy=null; this.trail=[];
    }
    get grounded(){ return this.y>=R.GROUND-0.01 && this.state!=="air" && this.state!=="knock"; }
    get actionable(){ return !!ACTIONABLE[this.state]; }
    get guarding(){ return this.state==="guard"||this.state==="cguard"||this.state==="blockstun"; }
    get crouching(){
      const s=this.state;
      return s==="crouch"||s==="cguard"||((s==="blockstun"||s==="hitstun")&&this.lowStance)||(s==="attack"&&this.move&&this.move.crouch);
    }
    get alive(){ return this.hp>0; }
    // その技を今 出せるか(クールダウン中・飛び道具が画面にある間は ×)
    canUse(key, battle){ if((this.cd[key]||0)>0) return false; if(key==="special" && battle && battle.hasProjectile(this)) return false; return true; }
    hurtbox(){ const h=this.crouching?R.HURT_H_CROUCH:R.HURT_H; return { x:this.x-R.HURT_W, y:this.y-h, w:R.HURT_W*2, h }; }
    // attacker の攻撃(level)を いまガードできるか。相手と反対方向を押していて、立ち/しゃがみが合っていること
    canBlock(att, level){
      if(level==null) level="mid";
      if(!(ACTIONABLE[this.state] || this.state==="blockstun")) return false;
      if(this.y<R.GROUND-1) return false;
      const away = att.x>this.x ? this.held.l : (att.x<this.x ? this.held.r : (this.facing>0?this.held.l:this.held.r));
      if(!away) return false;
      const low=!!this.held.d;
      if(level==="low" && !low) return false;
      if(level==="overhead" && low) return false;
      return true;
    }

    // 入力: held(押しっぱなし) から「押した瞬間」を作り、先行入力として覚えておく
    // 先行入力の時計は「自分が動いたフレーム」で数える(ヒットストップ中に押した入力が腐らない)
    feed(held){
      this.prev=this.held; this.held=held||{};
      for(const k of ["a","b","c","u","t"]){ if(this.held[k] && !this.prev[k]) this.press[k]=this.lf; }
    }
    buffered(k){ const f=this.press[k]; return f!=null && this.lf-f<=R.BUFFER; }
    consume(k){ this.press[k]=null; }
    wantsThrow(){ return this.buffered("t") || (this.buffered("a") && this.buffered("b")); }

    setState(s){ this.state=s; this.t=0; }
    startMove(key, battle){
      // mt = その技の何フレーム目か。押したフレームが 1F目 → 発生4F の技は 4F目に判定が出る
      this.move=MOVES[key]; this.moveKey=key; this.moveId=(this.moveId||0)+1; this.mt=1; this.hasHit=false; this.setState("attack");
      if(this.move.air) this.airUsed=true;
      if(this.move.cooldown) this.cd[key]=this.move.startup+this.move.active+this.move.recovery+this.move.cooldown;
      if(key==="special") battle.sfx("special", this);
      if(key==="super"){ this.meter=0; battle.startSuper(this); }
    }
    // キャンセル先として出せるか
    cancelInto(key, battle){
      const mv=this.move; if(!mv || !mv.cancel || !mv.cancel.includes(key)) return false;
      if((key==="light"||key==="crLight") && this.chain>=2) return false;
      if(key==="special" && !this.canUse("special",battle)) return false;
      if(key==="super" && this.meter<R.METER_MAX) return false;
      return true;
    }

    update(battle, opp, frame){
      this.lf++; this.anim+=1; if(this.flash>0) this.flash--; if(this.inv>0) this.inv--; if(this.throwInv>0) this.throwInv--;
      const h=this.held, fwd = this.facing>0 ? h.r : h.l, back = this.facing>0 ? h.l : h.r;
      if(!this.guarding) this.guardHp=Math.min(this.guardMax, this.guardHp+R.GUARD_REGEN);
      for(const k in this.cd) if(this.cd[k]>0) this.cd[k]--;
      // 見た目の向きは なめらかに追いかける(反転するキャラは紙がめくれるように振り向く)
      this.vf += Math.max(-0.34, Math.min(0.34, this.facing-this.vf));
      const faceOpp=()=>{ if(Math.abs(opp.x-this.x)>4) this.facing = opp.x>this.x ? 1 : -1; };

      switch(this.state){
        case "idle": case "walk": case "crouch": case "guard": case "cguard": {
          faceOpp(); this.combo=0; this.comboDmg=0; this.chain=0;
          if(this.wantsThrow()){ this.consume("t"); this.consume("a"); this.consume("b"); this.startMove("throw",battle); break; }
          if(this.buffered("c")){
            this.consume("c");
            if(h.d && this.meter>=R.METER_MAX){ this.startMove("super",battle); break; }
            if(this.canUse("special",battle)){ this.startMove("special",battle); break; }
          }
          if(this.buffered("b")){ this.consume("b"); this.startMove(h.d?"crHeavy":"heavy",battle); break; }
          if(this.buffered("a")){ this.consume("a"); this.startMove(h.d?"crLight":"light",battle); break; }
          if(this.buffered("u") && !h.d){ this.consume("u"); this.jumpDir = h.r?1:(h.l?-1:0); this.setState("prejump"); this.vx=0; break; }
          // 後ろを押していて、相手の攻撃が来そうなら ガードの構え(実際にガードできるかは当たる瞬間に判定)
          if(back && battle.threatened(this)){ const s=h.d?"cguard":"guard"; if(this.state!==s) this.setState(s); this.vx=0; break; }
          if(h.d){ if(this.state!=="crouch") this.setState("crouch"); this.vx=0; break; }
          if(fwd){ this.vx=this.facing*R.WALK_F*this.m.walk; if(this.state!=="walk") this.setState("walk"); }
          else if(back){ this.vx=-this.facing*R.WALK_B*this.m.walk; if(this.state!=="walk") this.setState("walk"); }
          else { this.vx=0; if(this.state!=="idle") this.setState("idle"); }
          break;
        }
        case "prejump":
          if(++this.t>=3){ this.vy=-R.JUMP_V*this.m.jump; this.vx=this.jumpDir*R.JUMP_VX*this.m.walk; this.airUsed=false; this.setState("air"); battle.sfx("jump",this); }
          break;
        case "air":
          if(!this.airUsed){
            if(this.buffered("b")){ this.consume("b"); this.startMove("airHeavy",battle); break; }
            if(this.buffered("a")){ this.consume("a"); this.startMove("airLight",battle); break; }
          }
          break;
        case "attack": {
          this.mt++;
          const mv=this.move, total=mv.startup+mv.active+mv.recovery;
          // 弱/強を押した直後(2F以内)にもう片方 → 投げに化ける(同時押しの猶予)
          if(!mv.air && !mv.throw && (this.moveKey==="light"||this.moveKey==="heavy"||this.moveKey==="crLight") && this.mt<=3 && this.wantsThrow() && !this.hasHit){
            this.consume("t"); this.consume("a"); this.consume("b"); this.startMove("throw",battle); break; }
          if(mv.projectile && this.mt===mv.startup) battle.spawnProjectile(this);
          if(mv.isSuper && this.mt===mv.startup) battle.dropGiant(this, opp);
          if(mv.throw && this.mt===mv.startup){ if(battle.tryThrow(this, opp)) break; }
          // キャンセル(当てた/ガードさせた技を 次の技で つなげる = コンボの接続)
          if(this.hasHit && mv.cancel && this.mt>=mv.startup){
            if(this.buffered("c")){
              if(h.d && this.cancelInto("super",battle)){ this.consume("c"); this.startMove("super",battle); break; }
              if(this.cancelInto("special",battle)){ this.consume("c"); this.startMove("special",battle); break; }
            }
            if(this.buffered("b")){ const k=h.d?"crHeavy":"heavy"; if(this.cancelInto(k,battle)){ this.consume("b"); this.startMove(k,battle); break; } }
            if(this.buffered("a")){ const k=h.d?"crLight":"light"; if(this.cancelInto(k,battle)){ this.consume("a"); this.chain++; this.startMove(k,battle); break; } }
          }
          if(mv.air){ if(this.y>=R.GROUND){ this.setState("land"); } }
          else if(this.mt>=total){ this.setState(mv.crouch && h.d ? "crouch" : "idle"); }
          if(!mv.air) this.vx*=0.7;
          break;
        }
        case "land": this.vx=0; if(++this.t>=4) this.setState("idle"); break;
        case "hitstun": case "blockstun":
          this.vx*=0.86; if(--this.stun<=0){ this.setState("idle"); this.throwInv=R.THROW_INV; } break;
        case "gbreak": this.vx*=0.86; if(--this.stun<=0) this.setState("idle"); break;
        case "knock": break; // 空中できりもみ。着地で down
        case "down": this.vx*=0.8; if(++this.t>=34){ if(this.alive){ this.setState("getup"); this.inv=20; } } break;
        case "getup": if(++this.t>=12){ this.setState("idle"); this.throwInv=R.THROW_INV; } break;
        case "throwing": this.vx=0; this.t++; if(this.t===22) battle.finishThrow(this); if(this.t>=36) this.setState("idle"); break;
        case "thrown": this.t++; break; // 位置は投げた側が決める
        case "ko": case "win": case "lose": this.vx*=0.85; break;
        case "enter": break; // 空から登場(着地で pose)
        case "pose": if(++this.t>=36) this.setState("idle"); break;
      }
      this.physics(battle);
      this.recordTrail();
    }

    physics(battle){
      if(this.state==="thrown") return;
      const airborne = this.state==="air" || this.state==="knock" || this.state==="enter" || (this.state==="attack" && this.move && this.move.air) || this.y<R.GROUND;
      if(airborne){
        this.vy+=R.GRAV; this.y+=this.vy;
        if(this.y>=R.GROUND){ this.y=R.GROUND; this.vy=0;
          if(this.state==="air"){ this.setState("land"); this.t=2; battle.sfx("land",this); }
          else if(this.state==="enter"){ this.setState("pose"); battle.onEnterLand(this); }
          else if(this.state==="knock"){ this.setState(this.alive?"down":"ko"); this.vx*=0.5; battle.onGroundBounce(this); }
        }
      }
      this.x+=this.vx;
      this.x=Math.max(R.WALL_L, Math.min(R.WALL_R, this.x));
    }

    // ================= 見た目 =================
    // 写真の大きさを見せ方ごとに決める。縦横比はそのまま・見切れないよう箱に収める。
    layoutPhoto(){
      const st=this.a.sticker, w=st.width, h=st.height, d=this.a.display;
      const box = d==="head" ? [100,98] : d==="body" ? [176,150] : [170,244];
      const s=Math.min(box[0]/w, box[1]/h);
      this.pw=w*s; this.ph=h*s;
      if(d==="head"){ this.hipY=-98; this.shY=-180; this.shW=30; this.hipW=20; }
      else if(d==="body"){ this.hipY=-48; this.shY=this.hipY-this.ph*0.62; this.shW=Math.max(18,this.pw*0.38); this.hipW=Math.min(22,this.pw*0.25); }
      else { this.hipY=0; this.shY=-this.ph*0.55; this.shW=this.pw*0.42; this.hipW=12; }
    }
    // 状態から「関節の位置」を決める(向き=右 として計算。描くときに左右反転)
    rig(){
      const s=this.state, t=this.anim, shW=this.shW, mk=this.moveKey;
      const lerp=(a,b,k)=>[a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k];
      let hipDy=0, rot=0, headRot=0, headDx=0, atk=0;
      let bF=[-30,0], fF=[26,0], kB=-14, kF=-14;
      let bH=[shW+2,8], fH=[shW+18,-6], eB=18, eF=18;           // 手は「肩の高さ」基準。こぶしは あごの前
      const absH=(x,y)=>[x, y-(this.shY+hipDy)];                // 足元基準の座標 → 肩基準
      switch(s){
        case "idle": hipDy=6+Math.sin(t*0.12)*2.5; rot=0.03; headRot=Math.sin(t*0.06)*0.03; fH=[shW+18,-6+Math.sin(t*0.12)*2]; break;
        case "walk": {
          const back = this.vx*this.facing<0, p = back ? -t*0.22 : t*0.28;   // 後退は ゆっくり逆向きに足を運ぶ
          fF=[22+Math.sin(p)*16,-Math.max(0,Math.sin(p))*9]; bF=[-24-Math.sin(p)*16,-Math.max(0,-Math.sin(p))*9];
          hipDy=-Math.abs(Math.sin(p))*3;
          if(back){ rot=-0.07; headRot=-0.06; fH=[shW+16,-6]; bH=[shW+8,14]; }   // 後退: のけぞって 手は顔の前
          else { rot=0.06; headRot=Math.sin(p)*0.05; fH=[shW+26+Math.sin(p)*4,18]; } // 前進: 前のめり
          break; }
        case "prejump": case "land": hipDy=14; kB=kF=-24; fF=[24,0]; bF=[-26,0]; break;
        case "air": fF=[18,-40]; bF=[-18,-34]; kB=kF=-20; fH=[shW+24,6]; bH=[shW,14]; rot=Math.max(-0.15,Math.min(0.15,this.vy*0.012)); break;
        case "enter": fF=[18,-40]; bF=[-18,-34]; kB=kF=-20; fH=[shW+8,-58]; bH=[-shW-8,-52]; break;
        case "pose": fH=[shW+6,-62]; bH=[shW,30]; headRot=-0.1; break;
        case "crouch": hipDy=40; kB=kF=-34; fF=[26,0]; bF=[-28,0]; fH=[shW+22,22]; bH=[shW+4,34]; headRot=Math.sin(t*0.06)*0.03; break;
        case "cguard": hipDy=42; kB=kF=-34; fF=[26,0]; bF=[-28,0]; fH=[shW+14,-6]; bH=[shW+10,18]; rot=-0.06; headRot=-0.08; break;
        case "guard": hipDy=8; fH=[shW+18,-22]; bH=[shW+12,4]; rot=-0.06; headRot=-0.08; kB=kF=-18; break;
        case "blockstun":
          if(this.lowStance){ hipDy=42; kB=kF=-34; fF=[26,0]; bF=[-28,0]; fH=[shW+14,-6]; bH=[shW+10,18]; }
          else { hipDy=8; fH=[shW+18,-22]; bH=[shW+12,4]; kB=kF=-18; }
          rot=-0.1; headRot=-0.12; break;
        case "hitstun": rot=-0.2+Math.sin(t*0.9)*0.05; headRot=-0.35; headDx=Math.sin(t*1.7)*3; fH=[shW-2,-38]; bH=[-shW-12,-30]; fF=[30,0]; bF=[-30,0];
          if(this.lowStance){ hipDy=34; kB=kF=-30; } break;
        case "throwing": { const k=Math.min(1,this.t/22);
          if(this.t<22){ fH=[shW+46,6]; bH=[shW+40,22]; rot=-0.12*k; hipDy=4; }
          else { fH=[shW+30,-60]; bH=[shW+20,-50]; rot=0.22; fF=[34,0]; bF=[-30,0]; }
          break; }
        case "thrown": rot=-0.35+Math.sin(t*0.8)*0.08; headRot=-0.4; headDx=Math.sin(t*1.9)*3; fH=[shW-4,-44]; bH=[-shW-10,-36]; fF=[24,-14]; bF=[-20,-8]; break;
        case "gbreak": rot=Math.sin(t*0.15)*0.14; headRot=Math.sin(t*0.15+1)*0.3; fH=[shW+2,66]; bH=[-shW-2,66]; eF=eB=-2; break;
        case "knock": rot=-this.anim*0.3; fH=[shW+22,-26]; bH=[-shW-22,-30]; fF=[34,-26]; bF=[-30,-18]; headRot=-0.4; break;
        case "down": case "ko": rot=-Math.PI/2*0.94; fH=[shW+20,10]; bH=[-shW-10,14]; fF=[26,0]; bF=[-4,0]; break;
        case "getup": rot=-Math.PI/2*0.94*(1-this.t/12); break;
        case "lose": hipDy=44; rot=0.12; headRot=0.45; fF=[30,0]; bF=[-34,-2]; kF=-34; kB=-30; fH=[shW+10,74]; bH=[-shW-4,70]; eF=eB=-4; break; // ひざをついて うなだれる
        case "win": hipDy=-Math.abs(Math.sin(t*0.15))*18; fH=[shW+2,-72]; bH=[-shW-10,30]; headRot=Math.sin(t*0.15)*0.08; break;
        case "attack": {
          const mv=this.move;
          if(this.mt<mv.startup) atk=this.mt/mv.startup;
          else if(this.mt<mv.startup+mv.active) atk=1;
          else atk=Math.max(0,1-(this.mt-mv.startup-mv.active)/Math.max(1,mv.recovery*0.7));
          if(mv.projectile && this.mt>=mv.startup && this.mt<mv.startup+10) atk=1;
          if(mk==="light"){ fF=[28,0]; fH=lerp([shW+28,18],absH(104,-146),atk); bH=[shW-6,30]; rot=0.08*atk; eF=12*(1-atk); }
          else if(mk==="crLight"){ hipDy=40; kB=kF=-34; fF=[26,0]; bF=[-28,0]; fH=lerp([shW+22,22],absH(102,-34),atk); bH=[shW+4,34]; rot=0.06*atk; eF=10*(1-atk); }
          else if(mk==="crHeavy"){ hipDy=50; rot=-0.1*atk; fF=lerp([26,0],[136,-14],atk); kF=-34*(1-atk)-4; bF=[-30,0]; kB=-40; fH=[-shW-4,40]; bH=[shW+8,44]; }
          else if(mk==="throw"){ fF=[30,0]; fH=lerp([shW+28,18],[shW+56,8],atk); bH=lerp([shW+4,32],[shW+50,22],atk); rot=0.08*atk; }
          else if(mk==="heavy"){ hipDy=-4*atk; fF=lerp([22,0],[126,-74],atk); kF=-12*(1-atk); bF=[-22,0]; rot=-0.16*atk; fH=[shW+12,-8]; bH=[-shW-10,0]; }
          else if(mk==="airLight"){ fF=lerp([18,-40],[66,-86],atk); bF=[-18,-36]; kF=-10; kB=-20; fH=[shW+20,4]; bH=[shW,16]; }
          else if(mk==="airHeavy"){ rot=0.22*atk; fF=lerp([18,-40],[94,-58],atk); kF=-4; bF=[-12,-44]; kB=-20; fH=[-shW-10,-20]; bH=[-shW-18,-6]; }
          else if(mk==="special"){ fF=[30,0]; bF=[-28,0]; fH=lerp([shW+28,18],[shW+52,6],atk); bH=lerp([shW+4,32],[shW+46,16],atk); rot=0.06*atk; }
          else if(mk==="super"){ fH=[shW+8,-64*atk]; bH=[-shW-8,-60*atk]; hipDy=-8*atk; }
          break;
        }
      }
      const shYa=this.shY+hipDy, d=this.a.display;
      let py;
      if(d==="head") py = shYa - this.ph/2 + this.ph*0.14;
      else if(d==="body") py = this.hipY + hipDy - this.ph/2 + 10;
      else py = -this.ph/2 + hipDy*(this.crouching?0.9:0.6);
      return { rot, hipDy, headRot, atk, mk, bF, fF, kB, kF, eB, eF, px:headDx, py,
        bH:[bH[0], shYa+bH[1]], fH:[fH[0], shYa+fH[1]], shYa, top: py-this.ph/2 };
    }

    // ---- 体(低解像度レイヤー)。pass = "back"(写真の後ろ) / "front"(写真の前) ----
    // 90年代アーケード風: 細めのフチ＋本体色＋光の当たる側にハイライト・反対側にかげ(ドット絵の塗り)
    drawPass(c, R, pass){
      const f=this.facing, d=this.a.display, O=this.a.outfit, white=this.flash>6;
      const col=(v,k)=> white ? "#ffffff" : (k ? P.shade(v,k) : v);
      c.save(); c.translate(this.x+this.shakeX, this.y); c.scale(f,1); c.rotate(R.rot);
      const hipY=this.hipY+R.hipDy, hipW=this.hipW, head=d==="head";
      // 2関節の手足: 付け根→関節→先 を 太さを変えて(付け根が太い)、かげ・ハイライトつきで
      const seg=(a,b,w,base)=>{
        c.lineCap="round"; c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]);
        c.strokeStyle=INK; c.lineWidth=w+5; c.stroke(); c.strokeStyle=base; c.lineWidth=w; c.stroke();
        if(white) return;
        const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L;
        const sgn = ny<0 ? 1 : -1;  // 上側(光が来る側)にハイライト
        c.lineWidth=Math.max(3,w*0.3);
        c.strokeStyle=P.shade(base,1.28);
        c.beginPath(); c.moveTo(a[0]+nx*w*0.28*sgn, a[1]+ny*w*0.28*sgn); c.lineTo(b[0]+nx*w*0.28*sgn, b[1]+ny*w*0.28*sgn); c.stroke();
        c.strokeStyle=P.shade(base,0.68);
        c.beginPath(); c.moveTo(a[0]-nx*w*0.3*sgn, a[1]-ny*w*0.3*sgn); c.lineTo(b[0]-nx*w*0.3*sgn, b[1]-ny*w*0.3*sgn); c.stroke();
      };
      const limb2=(a,j,b,w1,w2,base)=>{ seg(a,j,w1,base); seg(j,b,w2,base); };
      const fist=(p,cl)=>{ c.fillStyle=INK; c.fillRect(p[0]-10,p[1]-9,20,18); c.fillStyle=cl; c.fillRect(p[0]-7,p[1]-6,14,12);
        if(!white){ c.fillStyle=P.shade(cl,0.72); c.fillRect(p[0]-7,p[1]+2,14,4); c.fillStyle=P.shade(cl,1.25); c.fillRect(p[0]-5,p[1]-6,8,3); } };
      const glove=(p,back)=>{ c.beginPath(); c.arc(p[0],p[1],12,0,7); c.fillStyle=col(this.glove,back?0.7:0); c.fill(); c.lineWidth=4; c.strokeStyle=INK; c.stroke();
        c.fillStyle=white?"#fff":P.shade(this.glove,1.5); c.fillRect(p[0]-4,p[1]-7,5,4); };
      const shoe=(p,back,cl)=>{ const x=p[0], y=p[1];
        c.fillStyle=INK; c.fillRect(x-9,y-12,28,14);
        c.fillStyle=col(cl,back?0.75:0); c.fillRect(x-6,y-10,22,8);
        if(!white){ c.fillStyle=P.shade(cl,1.35); c.fillRect(x-4,y-10,10,3); c.fillStyle="#2a2222"; c.fillRect(x-6,y-3,22,3); } };
      const spring=(a,b)=>{ const n=8, dx=(b[0]-a[0])/n, dy=(b[1]-a[1])/n, L=Math.hypot(dx,dy)||1;
        c.beginPath(); c.moveTo(a[0],a[1]); for(let i=1;i<n;i++){ const s=i%2?7:-7; c.lineTo(a[0]+dx*i - dy/L*s, a[1]+dy*i + dx/L*s); } c.lineTo(b[0],b[1]);
        c.strokeStyle=INK; c.lineWidth=6; c.stroke(); c.strokeStyle="#c9c9c9"; c.lineWidth=2.5; c.stroke(); };
      const leg=(foot,bend,back)=>{
        const hip=[back?-hipW*0.55:hipW*0.55, hipY], knee=P.joint(hip,foot,bend);
        if(head){ limb2(hip,knee,[foot[0],foot[1]-6],20,15,col(O.pants,back?0.78:0)); shoe(foot,back,O.shoe); }
        else { limb2(hip,knee,foot,5,4,INK); P.ellipseRows(c, foot[0]+6, foot[1]-4, 13, 7, INK, 3); }
      };
      const arm=(hand,bend,back)=>{
        if(d==="whole"){ // 手が宙に浮いてる。攻撃中はバネでびよーん
          if(!back && R.atk>0.2 && (R.mk==="light"||R.mk==="special"||R.mk==="super"||R.mk==="crLight"||R.mk==="throw")) spring([this.pw*0.3, R.shYa], hand);
          glove(hand, back); return;
        }
        const sh = head ? [back?-this.shW*0.55:this.shW*0.6, R.shYa+9] : [back?-this.shW:this.shW, R.shYa+6];
        const el=P.joint(sh,hand,bend);
        if(head){
          const sl=col(O.sleeve,back?0.78:0);
          limb2(sh,el,hand,15,12,sl);
          if(O.stripe && !white){ c.strokeStyle=O.stripe; c.lineWidth=3; c.beginPath(); c.moveTo(sh[0],sh[1]-4); c.lineTo(el[0],el[1]-4); c.stroke(); }
          fist(hand, col(O.hand,back?0.8:0));
        } else { limb2(sh,el,hand,5,4,INK); glove(hand,back); }
      };

      if(pass==="back"){
        if(d==="whole"){
          if(R.atk>0.2 && (R.mk==="heavy"||R.mk==="airHeavy"||R.mk==="airLight"||R.mk==="crHeavy")) spring([this.pw*0.15,-this.ph*0.12],R.fF);
          for(const ft of [R.bF,R.fF]){ P.ellipseRows(c, ft[0]+6, ft[1]-5, 14, 8, INK, 3); P.ellipseRows(c, ft[0]+6, ft[1]-6, 10, 4, white?"#fff":"#6b5545", 3); }
          arm(R.bH,R.eB,true);
        } else {
          arm(R.bH,R.eB,true);
          leg(R.bF,R.kB,true);
          if(head){ // 股(左右の足のすき間を埋める)
            c.fillStyle=INK; c.fillRect(-hipW-3,hipY-6,hipW*2+6,18); c.fillStyle=col(O.pants,0.9); c.fillRect(-hipW,hipY-4,hipW*2,13); }
          leg(R.fF,R.kF,false);
          if(head) this.drawTorso(c,R,col,O);
        }
      } else {
        arm(R.fH,R.eF,false);
      }
      c.restore();
      // 目を回す星・頭上の目印(回転させない)
      if(pass==="front"){
        const hx=this.x+this.shakeX, hy=this.y+R.top;
        if(this.state==="gbreak"||this.state==="ko"||this.state==="down"||this.state==="lose"){
          const lying=this.state==="ko"||this.state==="down", sy = lying ? this.y-40 : hy-6;
          for(let i=0;i<3;i++){ const a=this.anim*0.12+i*2.1; P.star(c, hx+Math.cos(a)*40-(lying?f*120:0), sy+Math.sin(a)*8, 10, "#ffd23e"); }
        } else if(this.state!=="knock" && this.state!=="thrown"){
          const my=hy-16+Math.sin(this.anim*0.15)*3;
          c.beginPath(); c.moveTo(hx-10,my-10); c.lineTo(hx+10,my-10); c.lineTo(hx,my+2); c.closePath();
          c.fillStyle=this.glove; c.fill(); c.lineWidth=4; c.strokeStyle=INK; c.stroke();
        }
      }
    }
    // 胴体(顔ハメ)。肩・わき・腰のある人の形。服ごとの柄・しわ・かげ
    drawTorso(c,R,col,O){
      const sy=R.shYa, hy=this.hipY+R.hipDy, sw=this.shW, hw=this.hipW, plain=this.flash<=6, H=hy-sy;
      const poly=(pts)=>{ c.beginPath(); c.moveTo(pts[0][0],pts[0][1]); for(const p of pts.slice(1)) c.lineTo(p[0],p[1]); c.closePath(); };
      // 首
      c.fillStyle=INK; c.fillRect(-9,sy-16,18,22); c.fillStyle=col(O.hand===O.top?"#e9b48c":O.hand); c.fillRect(-6,sy-14,12,18);
      if(plain){ c.fillStyle=P.shade(O.hand===O.top?"#e9b48c":O.hand,0.75); c.fillRect(-6,sy-2,12,5); }
      const body=[[-9,sy-3],[-sw,sy+3],[-sw+1,sy+H*0.38],[-hw-1,sy+H*0.72],[-hw-5,hy+6],[hw+5,hy+6],[hw+1,sy+H*0.72],[sw-1,sy+H*0.38],[sw,sy+3],[9,sy-3]];
      poly(body); c.fillStyle=col(O.top); c.fill();
      if(plain){
        // かげ(奥側)とハイライト(手前の胸)
        poly([[-9,sy-3],[-sw,sy+3],[-sw+1,sy+H*0.38],[-hw-1,sy+H*0.72],[-hw-5,hy+6],[-hw*0.2,hy+6],[-sw*0.25,sy+H*0.4],[-3,sy]]);
        c.fillStyle=P.shade(O.top,0.78); c.fill();
        c.fillStyle=P.shade(O.top,1.22); c.fillRect(sw*0.25,sy+8,5,H*0.42); c.fillRect(sw*0.25+5,sy+8,4,8);
        // しわ
        c.fillStyle=P.shade(O.top,0.7); c.fillRect(-sw*0.1,sy+H*0.55,8,3); c.fillRect(sw*0.15,sy+H*0.7,9,3);
        if(O.tie){ // 白シャツ＋ネクタイ＋ベルト
          poly([[-9,sy-3],[0,sy+10],[9,sy-3],[5,sy+2],[0,sy+6],[-5,sy+2]]); c.fillStyle="#ffffff"; c.fill();
          poly([[-3,sy+4],[3,sy+4],[6,sy+H*0.62],[0,sy+H*0.74],[-6,sy+H*0.62]]); c.fillStyle=O.tie; c.fill(); c.lineWidth=2.5; c.strokeStyle=INK; c.stroke();
          c.fillStyle=P.shade(O.tie,1.35); c.fillRect(-1,sy+8,3,H*0.4);
          c.fillStyle="#2a2222"; c.fillRect(-hw-5,hy-5,hw*2+10,8); c.fillStyle="#c9a640"; c.fillRect(-4,hy-5,8,8);
        }
        if(O.belt){ // 道着: えりの合わせ＋黒帯
          c.strokeStyle=P.shade(O.top,0.6); c.lineWidth=4; c.beginPath(); c.moveTo(-sw*0.6,sy+2); c.lineTo(hw*0.5,sy+H*0.75); c.stroke();
          poly([[-8,sy-2],[8,sy-2],[0,sy+18]]); c.fillStyle=O.hand; c.fill();
          c.fillStyle=O.belt; c.fillRect(-hw-6,hy-12,hw*2+12,9); c.fillRect(hw-8,hy-5,7,16); c.fillRect(hw-1,hy-5,6,13);
        }
        if(O.stripe){ // ジャージ: ファスナー＋えり
          c.fillStyle=INK; c.fillRect(-1,sy+2,3,H); c.fillStyle=O.stripe; c.fillRect(-8,sy-3,16,4);
          c.fillStyle=P.shade(O.top,0.6); c.fillRect(-hw-5,hy-3,hw*2+10,7);
        }
        if(!O.tie && !O.belt && !O.stripe){ // タイツ: 体のライン
          c.fillStyle=P.shade(O.top,0.68); c.fillRect(-2,sy+H*0.35,3,H*0.5); c.fillRect(-hw,hy-4,hw*2,3);
        }
      }
      poly(body); c.lineWidth=4; c.strokeStyle=INK; c.stroke();
    }

    // ---- 写真(高解像度)。縦横比は絶対にいじらない ----
    // 反転: flip="none" なら写真は絶対に反転しない(文字・ロゴを守る)。"mirror" なら相手の方を向くよう反転し、
    // 振り向く瞬間は vf(見た目の向き)が 0 を通る＝紙をめくるように くるっと回る。
    mirrorX(){
      if(this.a.flip!=="mirror") return 1;
      const v = Math.abs(this.vf)<0.12 ? 0.12*Math.sign(this.vf||1) : this.vf;
      return v*(this.a.faceDir==="left"?-1:1);
    }
    drawPhoto(ctx, R, x, y, ghost){
      const f=this.facing, st=this.pickPose(), img=st.sticker, w=this.pw, h=this.ph, s=this.state;
      ctx.save(); ctx.translate(x,y); ctx.scale(f,1); ctx.rotate(R.rot); ctx.translate(R.px,R.py); ctx.scale(f,1); ctx.rotate(R.headRot*f);
      ctx.scale(this.mirrorX(),1);
      if(ghost){ ctx.drawImage(st.flash,-w/2,-h/2,w,h); }
      else {
        if(s==="ko"||s==="lose") ctx.filter="grayscale(0.75) brightness(0.9)";   // 負けたら色があせる
        ctx.drawImage(img,-w/2,-h/2,w,h); ctx.filter="none";
        if(this.flash>6){ ctx.globalAlpha=0.9; ctx.drawImage(st.flash,-w/2,-h/2,w,h); }              // 当たった瞬間: 白く光る
        else if(this.flash>0 && this.a.hurt){ ctx.globalAlpha=this.flash/6*0.5; ctx.drawImage(this.a.hurt,-w/2,-h/2,w,h); } // その後: 赤くにじむ
      }
      ctx.restore();
    }
    // 1体まるごと描く: 後ろの体 → (残像) → 写真 → 前の腕
    render(ctx, layer){
      const R=this.rig(), x=this.x+this.shakeX, lying=this.state==="down"||this.state==="ko"||this.state==="knock"||this.state==="getup";
      const bx=x-(lying?300:170), bw=lying?600:340, by=this.y+Math.min(R.top,this.shY)-(lying?160:60), bh=this.y+24-by;
      let c=layer.begin(); this.drawPass(c,R,"back"); layer.crisp(bx,by,bw,bh); layer.blit(ctx);
      for(let i=0;i<this.trail.length;i++){ const tr=this.trail[i]; ctx.globalAlpha=0.08+0.07*i; this.drawPhoto(ctx,tr.R,tr.x,tr.y,true); }
      ctx.globalAlpha=1;
      this.drawPhoto(ctx,R,this.x+this.shakeX,this.y,false);
      c=layer.begin(); this.drawPass(c,R,"front"); layer.crisp(bx,by,bw,bh); layer.blit(ctx);
    }
    // 残像の記録(勢いのある動きのときだけ)
    recordTrail(){
      const s=this.state, mk=this.moveKey;
      const fast = s==="knock" || s==="enter" || (s==="attack" && (mk==="heavy"||mk==="crHeavy"||mk==="airHeavy"||mk==="special"||mk==="super")) || s==="throwing";
      if(fast && this.anim%2<1){ this.trail.push({R:this.rig(),x:this.x,y:this.y}); if(this.trail.length>4) this.trail.shift(); }
      else if(!fast && this.trail.length) this.trail.shift();
    }
    shadow(c){
      if(this.state==="thrown") return;
      const k=Math.max(0.35,1-(R.GROUND-this.y)/360), w = this.a.display==="whole" ? Math.max(50,this.pw*0.45) : 58;
      P.ellipseRows(c,this.x,R.GROUND+4,w*k,11*k,"rgba(0,0,0,.38)",3);
    }
    pickPose(){
      const s=this.state, a=this.a;
      if(s==="attack") return a.pose("attack");
      if(s==="hitstun"||s==="knock"||s==="gbreak") return a.pose("hit");
      if(s==="ko"||s==="down"||s==="lose") return a.pose("ko");
      if(s==="win") return a.pose("win");
      return a.pose("idle");
    }
  }

  KK.RULES=RULES; KK.MOVES=MOVES; KK.PROJ_HIT=PROJ_HIT; KK.SUPER_HIT=SUPER_HIT; KK.THROW_HIT=THROW_HIT; KK.Fighter=Fighter;
})();
