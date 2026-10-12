/* =====================================================================
   ペタ拳: 試合(KK.Battle)。
   進行: VS画面 → 登場(空から降ってくる) → ROUND/FIGHT → 対戦 → K.O.(カメラ寄り＋スロー) → 勝利画面
   当たり判定 / ヒットストップ・画面ゆれ・フラッシュ・衝撃波・残像 / 飛び道具 / 超必殺 / アーケード風HUD / 効果音。
   描画: 背景・体・エフェクト・HUD は低解像度(ドット)、ユーザーの写真だけ高解像度。
   ループは 60fps 固定ステップ。opt.attract=true でタイトル裏のデモ(CPU同士・HUDなし・無音)。
   ===================================================================== */
window.KK = window.KK || {};
(function(){
  "use strict";
  const R=KK.RULES, P=KK.pixel, INK=P.INK;
  const ROUND_FRAMES=60*60, WIN_ROUNDS=2;
  const GUARD_RATE=0.15;
  const STEP_MS=1000/60;
  const COMBO_SCALE=[1,1,0.85,0.72,0.62,0.55,0.5];   // コンボ補正: 3段目から減っていく   // ガードしたときに通るダメージの割合(削り)。通常技の削りではKOしない
  const WIN_LINES=["顔の 勝ち。","解像度が ちがうのだよ","トリミングが 甘かったな","背景ごと 出なおしてこい","画像映えで 勝った","まだ 本気の画像じゃない","いい角度で 撮れてた","圧縮されてる 場合か"];
  const DRAW_LINES=["どっちも いい画像","引き分け。写真うつりは 互角"];

  class Battle{
    /* opt: { cv, assets:[a1,a2], ctrls:[c1,c2], stage, sound, onEnd(result), attract, cover, tags:["1P","CPU"] } */
    constructor(opt){
      this.o=opt; this.cv=opt.cv; this.headless=!!opt.headless; this.ctx=this.headless?null:this.cv.getContext("2d");
      this.f=[ new KK.Fighter(0,opt.assets[0]), new KK.Fighter(1,opt.assets[1]) ];
      this.stage=opt.stage; this.round=0; this.frame=0; this.paused=false;
      this.projectiles=[]; this.giants=[]; this.fx=[]; this.words=[];
      this.hitstop=0; this.shake=0; this.slow=0; this.dark=0; this.excite=0; this.flash=0;
      this.cam={z:1,x:R.W/2,y:R.H/2,tz:1,tx:R.W/2,ty:R.H/2};
      this.banner=null; this.superCut=null; this.comboShow=null;
      this.stat=[0,1].map(()=>({dmg:0,maxCombo:0,score:0,perfect:0}));
      this._raf=null; this._acc=0; this._last=0;
      this.port=false; this.TOP=0; this.BOT=0; this.VH=R.H;
      if(!this.headless){
        this.L={ bg:new P.Layer(R.W,R.H,3), actor:new P.Layer(R.W,R.H,3), fx:new P.Layer(R.W,R.H,3), hud:new P.Layer(R.W,R.H,2) };
        this.resize=this.resize.bind(this); addEventListener("resize",this.resize);
        this.setLayout(!!opt.portrait);
      }
      if(opt.attract){ this.nextRound(); } else { this.phase="vs"; this.phaseT=0; this.sfx("vs"); setTimeout(()=>this.say("バトル スタート","narr","vs"),500); }
    }
    start(){ this._last=performance.now(); const loop=(ts)=>{ this._raf=requestAnimationFrame(loop); this.tick(ts); }; this._raf=requestAnimationFrame(loop); }
    destroy(){ if(this.headless) return; cancelAnimationFrame(this._raf); removeEventListener("resize",this.resize); if(this.o.sound){ try{ speechSynthesis.cancel(); }catch(e){} } }
    setPaused(p){ this.paused=p; this._last=performance.now(); }
    skip(){ if(this.phase==="vs" && this.phaseT<130) this.phaseT=130; }

    /* 縦持ち(portrait)では、試合の上に「体力・タイム」の帯、下に「ゲージ」の帯をつける。
       試合そのもの(960x540)は同じ。帯のぶん描く範囲が縦に長くなる(VH)。 */
    setLayout(port){
      this.port=!!port; this.TOP=this.port?150:0; this.BOT=this.port?96:0; this.VH=R.H+this.TOP+this.BOT;
      if(this.L) this.L.hud=new P.Layer(R.W,this.VH,2);
      this._hudSig=null; this.resize();
    }
    resize(){
      const box=this.cv.parentElement.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1, this.lowQ?1.25:(navigator.maxTouchPoints>0?1.6:2));
      const VH=this.VH||R.H;
      const s=(this.o.cover?Math.max:Math.min)(box.width/R.W, box.height/VH), w=R.W*s, h=VH*s;
      this.cv.style.width=w+"px"; this.cv.style.height=h+"px";
      this.cv.style.left=(box.width-w)/2+"px"; this.cv.style.top=(box.height-h)/2+"px";
      this.cv.width=Math.round(w*dpr); this.cv.height=Math.round(h*dpr);
      this.scale=w*dpr/R.W;
    }
    // 更新と描画の分離: 経過時間ぶん 1/60秒の固定ステップを回してから 1回だけ描く。
    // 画面のリフレッシュレート(30/60/144Hz)やブラウザが違っても ゲームの速さは同じ。
    tick(ts){
      const dt=Math.min(100, Math.max(0, ts-this._last)); this._last=ts;
      if(!this.paused){ this._acc+=dt; let n=0; while(this._acc>=STEP_MS && n<8){ this._acc-=STEP_MS; this.step(); n++; } }
      if(!this.headless){
        const t0=performance.now(); this.render(); const dtR=performance.now()-t0;
        // 描画が重い端末では 自動で軽くする(ゲームの速さは固定ステップなので変わらない)
        this._rAvg = this._rAvg==null ? dtR : this._rAvg*0.95+dtR*0.05;
        if(!this.lowQ && this.frame>120 && this._rAvg>11){ this.lowQ=true; P.Layer.fast=true; this.resize(); }
      }
    }

    // ================= 進行 =================
    nextRound(){
      this.round++; this.timer=ROUND_FRAMES; this.projectiles=[]; this.giants=[];
      for(const f of this.f){ const m=f.meter, w=f.wins; f.reset(); f.meter=m; f.wins=w; }
      this.phase="intro"; this.phaseT=0; this.banner=null;
      this.cam.tz=1; this.cam.tx=R.W/2; this.cam.ty=R.H/2;
      // 1ラウンド目は空から降ってくる(登場演出)
      this.entrance = this.round===1;
      if(this.entrance){ this.f[0].y=-280; this.f[1].y=-420; for(const f of this.f) f.setState("enter"); }
      this.introLen = this.entrance ? (this.o.attract?90:160) : 110;
    }
    step(){
      this.frame++; this.phaseT++;
      if(this.banner) this.banner.t++;
      if(this.phase==="vs"){ if(this.phaseT>=150) this.nextRound(); return; }
      if(this.phase==="result"){ this.stepFx(); for(const f of this.f) f.anim++; return; }
      if(this.superCut){ if(++this.superCut.t>=46){ this.superCut=null; } else { this.stepFx(); return; } }
      const live = this.phase==="fight";
      for(let i=0;i<2;i++){ const me=this.f[i], op=this.f[1-i]; me.feed(live ? this.o.ctrls[i].read(me,op,this) : {}); }

      if(this.phase==="intro"){
        const L=this.introLen;
        // ROUND の声 → 約1.2秒あけて FIGHT(声が途中で切れないように)
        if(this.phaseT===L-100){ const fin=this.f[0].wins===WIN_ROUNDS-1 && this.f[1].wins===WIN_ROUNDS-1;
          this.banner={text: fin?"FINAL ROUND":("ROUND "+this.round), t:0, kind:"round"}; this.say(fin?"ファイナルラウンド":("ラウンド"+this.round),"narr", fin?"final":("round"+Math.min(5,this.round))); this.sfx("round"); }
        if(this.phaseT===L-30){ this.banner={text:"FIGHT!",t:0,kind:"fight"}; this.say("ファイッ","narr","fight"); this.sfx("fight"); this.flash=4; this.shake=6; }
        if(this.phaseT>=L){ this.phase="fight"; this.phaseT=0; }
      }
      if(this.phase==="fight" && this.banner && this.banner.t>40) this.banner=null;
      if(this.hitstop>0){ this.hitstop--; for(const f of this.f) f.shakeX = (f.state==="hitstun"||f.state==="blockstun"||f.state==="knock") ? (Math.random()-0.5)*10 : 0; this.stepFx(); return; }
      for(const f of this.f) f.shakeX=0;
      if(this.slow>0){ this.slow--; if(this.slow%3!==0){ this.stepFx(); return; } }

      const [a,b]=this.f;
      a.update(this,b,this.frame); b.update(this,a,this.frame);
      this.stepThrows();
      if(a.state!=="thrown" && b.state!=="thrown") this.pushApart(a,b);
      this.checkHits(a,b); this.checkHits(b,a);
      for(const f of this.f){ // コンボが途切れたら「何段・何ダメージ」を出す
        if(!f.comboDone && f.state!=="hitstun" && f.state!=="knock"){ f.comboDone=true;
          if(f.combo>=2){ this.comboShow={ who:1-f.idx, n:f.combo, dmg:f.comboDmg, t:0, done:true }; this.stat[1-f.idx].combos=(this.stat[1-f.idx].combos||0)+1; } } }
      this.stepProjectiles(); this.stepGiants(); this.stepFx();
      for(const f of this.f){ f.trailHp += (f.hp-f.trailHp)*(f.state==="hitstun"||f.state==="knock"?0.015:0.07); }
      this.excite=Math.max(0,this.excite-0.01);

      if(this.phase==="fight"){
        if(--this.timer<=0) this.endRound("time");
        else if(!a.alive||!b.alive) this.endRound("ko");
      } else if(this.phase==="ko"){
        if(this.phaseT===120) this.decideRound();
        if(this.phaseT>=250) this.afterRound();
      }
    }
    endRound(why){
      this.phase="ko"; this.phaseT=0; this.projectiles=[];
      const [a,b]=this.f;
      this.roundWinner = (a.hp/a.maxHp===b.hp/b.maxHp) ? -1 : (a.hp/a.maxHp>b.hp/b.maxHp ? 0 : 1);
      if(why==="ko"){
        this.hitstop=20; this.slow=70; this.flash=8; this.shake=16; this.excite=1;
        this.banner={text:"K.O.",t:0,kind:"ko"}; this.say("ケーオー","narr","ko"); this.sfx("ko");
        const loser=this.f.find(f=>!f.alive)||this.f[1];
        this.cam.tz=1.35; this.cam.tx=loser.x; this.cam.ty=loser.y-150;
        this.ring(loser.x,loser.y-100,"#fff",12);
      } else { this.banner={text:"TIME UP",t:0,kind:"round"}; this.say("タイムアップ","narr","timeup"); }
    }
    decideRound(){
      const w=this.roundWinner;
      this.cam.tz=1; this.cam.tx=R.W/2; this.cam.ty=R.H/2;
      if(w<0){ this.f[0].wins++; this.f[1].wins++; this.banner={text:"DRAW",t:0,kind:"round"}; this.say("ひきわけ","narr","draw"); return; }
      const wf=this.f[w]; wf.wins++; if(wf.alive) wf.setState("win");
      const st=this.stat[w]; st.score+=Math.ceil(this.timer/60)*100 + (wf.hp>=wf.maxHp?30000:0) + 10000;
      if(wf.hp>=wf.maxHp){ st.perfect++; this.banner={text:"PERFECT!!",t:0,kind:"ko"}; this.say("パーフェクト","narr","perfect"); }
      else { this.banner={text:wf.a.ch.name+" WIN",t:0,kind:"win"}; this.say(wf.a.ch.name+"のかち","narr","win",wf.a.ch); }
    }
    afterRound(){
      const [a,b]=this.f;
      if(a.wins>=WIN_ROUNDS||b.wins>=WIN_ROUNDS){
        this.phase="result"; this.phaseT=0; this.banner=null; this.fx=[]; this.words=[];
        this.winner = a.wins===b.wins ? -1 : (a.wins>b.wins?0:1);
        this.winLine = this.winner<0 ? pick(DRAW_LINES) : pick(WIN_LINES);
        if(this.winner>=0){ const W=this.f[this.winner], Lf=this.f[1-this.winner];
          W.setState("win"); Lf.setState("lose"); Lf.y=R.GROUND; Lf.vx=0; this.sfx("win"); }
        if(this.o.onEnd) this.o.onEnd({ winner:this.winner, wins:[a.wins,b.wins], stat:this.stat });
        return;
      }
      this.nextRound();
    }

    // ================= 当たり =================
    pushApart(a,b){
      if(Math.abs(a.y-b.y)>140) return;
      const min=R.PUSH_W*2, d=b.x-a.x;
      if(Math.abs(d)<min){
        const over=(min-Math.abs(d))/2, s=d===0?(a.facing>0?1:-1):Math.sign(d);
        a.x-=s*over; b.x+=s*over;
        if(a.x<R.WALL_L){ b.x+=R.WALL_L-a.x; a.x=R.WALL_L; } if(b.x>R.WALL_R){ a.x-=b.x-R.WALL_R; b.x=R.WALL_R; }
        if(b.x<R.WALL_L){ a.x+=R.WALL_L-b.x; b.x=R.WALL_L; } if(a.x>R.WALL_R){ b.x-=a.x-R.WALL_R; a.x=R.WALL_R; }
      }
    }
    checkHits(att, def){
      if(att.state!=="attack" || att.hasHit) return;
      const mv=att.move; if(!mv.box) return;
      if(att.mt<mv.startup || att.mt>=mv.startup+mv.active) return;
      const bx = att.facing>0 ? att.x+mv.box.x : att.x-mv.box.x-mv.box.w;
      const hb={x:bx, y:att.y+mv.box.y, w:mv.box.w, h:mv.box.h};
      if(def.inv>0 || def.state==="down" || def.state==="ko" || def.state==="getup" || def.state==="knock" || def.state==="enter" || def.state==="thrown" || def.state==="throwing") return; // 浮いた相手は追撃できない(永久コンボ防止)
      if(!overlap(hb, def.hurtbox())) return;
      att.hasHit=true;
      this.resolve(att, def, mv, { x:hb.x+(att.facing>0?hb.w:0), y:hb.y+hb.h/2 }, att.moveKey);
    }
    /* ダメージ計算:
       基本ダメージ(技ごと) × 攻撃側の攻撃力倍率 × 守備側の防御力倍率 × コンボ補正(連続で当てるほど減る)
       ガード中なら 15%(飛び道具・超必殺は技ごとの削り量)。通常技の削りでは体力1で止まる。 */
    resolve(att, def, mv, at, kind){
      const blocked = !mv.unblockable && def.canBlock(att, mv.level);
      const dir = att.x<def.x ? 1 : (att.x>def.x ? -1 : att.facing);
      const base = mv.dmg*att.m.dmg*(def.m.taken||1);
      if(blocked){
        const chip = Math.round(base*(mv.chip!=null?mv.chip:GUARD_RATE));
        def.hp = mv.canChipKO ? Math.max(0, def.hp-chip) : Math.max(Math.min(def.hp,1), def.hp-chip);
        def.guardHp-=mv.guard||10;
        def.lowStance=!!def.held.d;
        def.vx=dir*mv.push*0.9; def.stun=mv.blockstun; def.setState("blockstun");
        att.meter=Math.min(R.METER_MAX, att.meter+2); def.meter=Math.min(R.METER_MAX, def.meter+3);
        this.stat[att.idx].dmg+=chip;
        this.hitstop=Math.max(3,mv.hitstop-3);
        this.spark(at.x,at.y,"#8fd0ff",6); this.ring(at.x,at.y,"#8fd0ff",4); this.word("GUARD",at.x,at.y-24,"#8fd0ff",0.8,true); this.sfx("block");
        if(chip>0) this.word("-"+chip,def.x,def.y-200,"#8fd0ff",0.6,true);
        if(def.guardHp<=0){ // ガードブレイク: 固めすぎ防止
          def.guardHp=def.guardMax*0.6; def.setState("gbreak"); def.stun=R.GUARD_BREAK_STUN;
          this.word("ガードブレイク！",def.x,def.y-240,"#ffd23e",1.1); this.sfx("break"); this.shake=12; this.flash=3;
        }
        if(def.hp<=0){ def.hp=0; this.knock(def,dir,att); }
        this.pushback(att,def,dir,mv.push*0.6);
        return;
      }
      const wasLow=def.crouching;
      def.combo++; def.comboDone=false;
      const scale=COMBO_SCALE[Math.min(COMBO_SCALE.length-1,def.combo-1)];
      const dmg=Math.max(1,Math.round(base*scale));
      def.hp=Math.max(0, def.hp-dmg); def.flash=10; def.lastHitBy=att; def.comboDmg=(def.comboDmg||0)+dmg;
      att.meter=Math.min(R.METER_MAX, att.meter+(mv.meter||0)); def.meter=Math.min(R.METER_MAX, def.meter+Math.round(dmg/22));
      const st=this.stat[att.idx]; st.dmg+=dmg; st.maxCombo=Math.max(st.maxCombo,def.combo); st.score+=dmg*10+(def.combo-1)*200;
      this.hitstop=mv.hitstop; this.shake=Math.max(this.shake, Math.round(mv.hitstop*1.1));
      this.excite=Math.min(1,this.excite+dmg/300);
      const airborne = def.y<R.GROUND-1;
      if(def.hp<=0 || mv.knockdown || airborne){ this.knock(def,dir,att, mv.sweep?0.55:(mv.knockdown?1.4:1)); }
      else { def.setState("hitstun"); def.lowStance=wasLow;
        // 基本コンボ(3段目まで)はそのまま。それより長いコンボほど のけぞりが短くなる＝どこかで必ず途切れる
        def.stun=Math.max(R.HITSTUN_MIN, mv.hitstun - R.HITSTUN_DECAY*Math.max(0,def.combo-3));
        def.vx=dir*mv.push*att.m.push; }
      this.pushback(att,def,dir,mv.push*0.5);
      const big = dmg>=85;
      this.hitStar(at.x,at.y,big);
      this.spark(at.x,at.y, big?"#ffd23e":"#fff", big?16:8);
      if(big){ this.ring(at.x,at.y,"#fff",10); this.flash=Math.max(this.flash,2); }
      this.word(mv.words?pick(mv.words):"バシ", at.x+dir*20, at.y-36, big?"#ff6d3a":"#fff", big?1.25:0.95);
      this.word("-"+dmg, def.x-dir*30, def.y-215, big?"#ffd23e":"#ffffff", 0.65, true);
      if(def.combo>=2){ this.comboShow={ who:att.idx, n:def.combo, t:0 }; if(def.combo>=3){ this.shake=Math.max(this.shake,6+def.combo); } }
      this.sfx(big?"heavyhit":"hit");
    }
    knock(def,dir,att,mul){ mul=mul||1; def.setState("knock"); def.vy=-9*mul; def.vx=dir*5.5*mul; def.y=Math.min(def.y,R.GROUND-1); def.stun=0; }
    pushback(att,def,dir,amt){ if((def.x<=R.WALL_L+2 && dir<0) || (def.x>=R.WALL_R-2 && dir>0)) att.vx=-dir*amt*1.2; }
    onGroundBounce(f){ this.shake=Math.max(this.shake,7); this.sfx("land2"); this.puff(f.x,R.GROUND); }
    onEnterLand(f){ this.shake=Math.max(this.shake,10); this.sfx("land2"); this.puff(f.x-30,R.GROUND); this.puff(f.x+30,R.GROUND); this.ring(f.x,R.GROUND,"#fff",6,0.3);
      this.word("ドスン",f.x,R.GROUND-40,"#ffd23e",1); }

    threatened(f){
      const o=this.f[1-f.idx];
      if(o.state==="attack" && o.move && !o.move.throw){
        const mv=o.move, reach = mv.box ? mv.box.x+mv.box.w : (mv.projectile||mv.isSuper ? 9999 : 0);
        if(o.mt < mv.startup+mv.active+2 && Math.abs(o.x-f.x) < reach+90) return true;
      }
      if(this.projectiles.some(p=>p.owner===o && Math.abs(p.x-f.x)<340 && Math.sign(f.x-p.x)===Math.sign(p.vx))) return true;
      if(this.giants.some(g=>!g.landed && g.owner===o)) return true;
      return false;
    }

    // ---- 投げ: 近距離・地上・硬直中でない相手をつかむ。つかまれて10F以内に投げボタンで「投げぬけ」 ----
    tryThrow(att, def){
      const ok = Math.abs(def.x-att.x) <= KK.MOVES.throw.range && def.y>=R.GROUND-1 && att.y>=R.GROUND-1
        && (def.actionable || (def.state==="attack" && !def.move.air)) && def.throwInv<=0 && def.inv<=0;
      if(!ok) return false;
      att.setState("throwing"); att.victim=def; att.vx=0; att.inv=40;
      def.setState("thrown"); def.thrower=att; def.vx=0; def.vy=0; def.techT=0;
      this.hitstop=4; this.sfx("block"); this.word("つかみ！",(att.x+def.x)/2,def.y-230,"#ffd23e",0.9);
      return true;
    }
    finishThrow(att){
      const def=att.victim; if(!def || def.state!=="thrown") return;
      def.y=R.GROUND-1;
      this.resolve(att, def, KK.THROW_HIT, {x:def.x, y:def.y-100}, "throw");
      att.victim=null; def.thrower=null;
    }
    stepThrows(){
      for(const def of this.f){
        if(def.state!=="thrown" || !def.thrower) continue;
        const att=def.thrower;
        def.x=Math.max(R.WALL_L,Math.min(R.WALL_R, att.x+att.facing*64)); def.facing=-att.facing;
        def.y=R.GROUND-Math.min(34, def.t*3);
        // 投げぬけ(つかまれた直後だけ)
        if(def.t<=R.THROW_TECH && def.wantsThrow()){
          def.consume("t"); def.consume("a"); def.consume("b");
          const dir=Math.sign(def.x-att.x)||1;
          for(const f of [att,def]){ f.setState("blockstun"); f.stun=16; f.lowStance=false; f.y=R.GROUND; }
          att.vx=-dir*7; def.vx=dir*7; att.victim=null; def.thrower=null; att.inv=0;
          this.word("なげぬけ！",(att.x+def.x)/2,R.GROUND-230,"#8fd0ff",1); this.spark((att.x+def.x)/2,R.GROUND-120,"#8fd0ff",10); this.sfx("block");
        }
      }
    }

    // ---- 飛び道具(ちいさい自分を投げる) ----
    hasProjectile(f){ return this.projectiles.some(p=>p.owner===f); }
    spawnProjectile(f){
      this.projectiles.push({ owner:f, x:f.x+f.facing*80, y:f.y-140, vx:f.facing*8.5, rot:0, life:200, w:56, h:56 });
      this.say(f.a.ch.shout||"くらえ", f.a.ch.voice, "shout", f.a.ch);
    }
    stepProjectiles(){
      const ps=this.projectiles;
      for(const p of ps){ p.x+=p.vx; p.rot+=0.35*Math.sign(p.vx); p.life--; if(p.x<-60||p.x>R.W+60) p.life=0;
        if(this.frame%2===0) this.fx.push({k:"spark",x:p.x-p.vx*3,y:p.y+(Math.random()-0.5)*30,vx:-p.vx*0.2,vy:0,t:0,life:12,col:p.owner.glove}); }
      for(let i=0;i<ps.length;i++) for(let j=i+1;j<ps.length;j++){ const a=ps[i], b=ps[j];
        if(a.owner!==b.owner && a.life>0 && b.life>0 && Math.abs(a.x-b.x)<56 && Math.abs(a.y-b.y)<56){
          a.life=b.life=0; const mx=(a.x+b.x)/2; this.hitStar(mx,a.y,true); this.ring(mx,a.y,"#ffd23e",10); this.word("そうさい",mx,a.y-40,"#fff"); this.sfx("block"); } }
      for(const p of ps){ if(p.life<=0) continue; const def=this.f[1-p.owner.idx];
        if(def.inv>0||def.state==="down"||def.state==="ko"||def.state==="getup"||def.state==="knock"||def.state==="thrown"||def.state==="throwing") continue;
        if(overlap({x:p.x-p.w/2,y:p.y-p.h/2,w:p.w,h:p.h},def.hurtbox())){ p.life=0; this.resolve(p.owner, def, KK.PROJ_HIT, {x:p.x,y:p.y}, "proj"); } }
      this.projectiles=ps.filter(p=>p.life>0);
    }
    // ---- 超必殺(巨大な自分が空から落ちてくる) ----
    startSuper(f){
      this.superCut={ who:f, t:0 }; this.dark=1; this.sfx("super"); this.flash=5;
      this.stat[f.idx].score+=5000;
      this.say(f.a.ch.superName||"超ひっさつ", f.a.ch.voice, "super", f.a.ch);
    }
    dropGiant(f, opp){
      this.giants.push({ owner:f, x:opp.x, y:-300, vy:6, size:320, hit:false, t:0, landed:false });
      this.word("うえ！",opp.x,130,"#ffd23e",1.2);
    }
    stepGiants(){
      for(const g of this.giants){ g.t++;
        if(!g.landed){ g.vy+=1.3; g.y+=g.vy;
          const def=this.f[1-g.owner.idx];
          const hb={x:g.x-g.size*0.42, y:g.y-g.size/2, w:g.size*0.84, h:g.size};
          if(!g.hit && def.inv<=0 && def.state!=="down" && def.state!=="ko" && overlap(hb,def.hurtbox())){
            g.hit=true; this.resolve(g.owner, def, KK.SUPER_HIT, {x:def.x,y:def.y-100}, "giant"); }
          if(g.y+g.size/2>=R.GROUND){ g.y=R.GROUND-g.size/2; g.landed=true; g.t=0; this.shake=22; this.flash=4; this.sfx("land2");
            this.ring(g.x,R.GROUND,"#fff",16,0.28); this.puff(g.x-110,R.GROUND); this.puff(g.x+110,R.GROUND); this.spark(g.x,R.GROUND-20,"#c9b08a",20); }
        }
      }
      this.giants=this.giants.filter(g=>!(g.landed && g.t>50));
    }

    // ================= 演出 =================
    spark(x,y,col,n){ for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, s=3+Math.random()*8;
      this.fx.push({k:"spark",x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1,t:0,life:14+Math.random()*12,col}); } }
    ring(x,y,col,v,flat){ this.fx.push({k:"ring",x,y,r:8,vr:v||8,t:0,life:16,col,flat:flat||1}); }
    hitStar(x,y,big){ this.fx.push({k:"star",x,y,t:0,life:big?7:5,r:big?62:38,rot:Math.random()*Math.PI}); }
    puff(x,y){ for(let i=0;i<7;i++) this.fx.push({k:"puff",x:x+(Math.random()-0.5)*50,y:y-6,vx:(Math.random()-0.5)*4,vy:-Math.random()*1.6,t:0,life:28,r:10+Math.random()*12}); }
    word(text,x,y,col,sz,latin){ this.words.push({text,x,y,col,sz:sz||1,t:0,rot:(Math.random()-0.5)*0.35,latin}); }
    stepFx(){
      for(const p of this.fx){ p.t++; if(p.k==="ring"){ p.r+=p.vr; continue; } if(p.vx!=null){ p.x+=p.vx; p.y+=p.vy; } if(p.k==="spark"){ p.vx*=0.88; p.vy=p.vy*0.88+0.25; } }
      this.fx=this.fx.filter(p=>p.t<p.life);
      for(const w of this.words) w.t++; this.words=this.words.filter(w=>w.t<44);
      if(this.shake>0) this.shake--; if(this.flash>0) this.flash--;
      if(this.dark>0 && !this.superCut) this.dark=Math.max(0,this.dark-0.05);
      if(this.comboShow){ this.comboShow.t++; if(this.comboShow.t>80) this.comboShow=null; }
      const c=this.cam; c.z+=(c.tz-c.z)*0.12; c.x+=(c.tx-c.x)*0.12; c.y+=(c.ty-c.y)*0.12;
    }

    // ================= 音・声 =================
    sfx(kind){
      if(!this.o.sound) return; const Y=window.Yokocho; if(!Y) return; const A=Y.audio;
      switch(kind){
        case "hit": A.noise(0.07,0.45,null,900); A.tone(260,0.06,"square",0.22); break;
        case "heavyhit": A.noise(0.16,0.6,null,300); A.tone(120,0.16,"sawtooth",0.3); A.tone(60,0.24,"sine",0.55); break;
        case "block": A.tone(1300,0.04,"square",0.12); A.noise(0.03,0.2,null,4000); break;
        case "break": A.tone(200,0.3,"sawtooth",0.25); setTimeout(()=>A.tone(100,0.3,"sawtooth",0.25),120); break;
        case "jump": A.tone(500,0.06,"sine",0.08); break;
        case "land": break;
        case "land2": A.tone(80,0.18,"sine",0.5); A.noise(0.1,0.3,null,200); break;
        case "special": A.tone(700,0.08,"triangle",0.15); setTimeout(()=>A.tone(1050,0.1,"triangle",0.15),60); break;
        case "super": { const a=A.ctx(); if(!a) break; for(let i=0;i<10;i++) A.tone(300+i*90,0.08,"square",0.1,a.currentTime+i*0.035); break; }
        case "ko": A.noise(0.4,0.5,null,150); A.tone(160,0.5,"sawtooth",0.25); setTimeout(()=>A.tone(80,0.8,"sawtooth",0.25),200); break;
        case "fight": A.tone(880,0.12,"square",0.15); setTimeout(()=>A.tone(1320,0.2,"square",0.15),100); break;
        case "round": A.tone(440,0.1,"square",0.12); break;
        case "vs": { const a=A.ctx(); if(!a) break; A.tone(110,0.4,"sawtooth",0.2,a.currentTime+0.6); A.noise(0.3,0.4,a.currentTime+0.6,300); break; }
        case "win": { const a=A.ctx(); if(!a) break; [523,659,784,1047].forEach((f,i)=>A.tone(f,0.18,"square",0.12,a.currentTime+i*0.12)); break; }
      }
    }
    // narr=アナウンス(key で録音を探す) / それ以外=キャラのセリフ(key=shout|super)
    say(text, voice, key, ch){
      if(!this.o.sound || !KK.voice) return;
      if(voice==="narr") KK.voice.announce(key, text, ch);
      else KK.voice.line(ch, key, text, voice||"mid");
    }

    // ================= 描画 =================
    render(){
      const c=this.ctx; c.setTransform(this.scale,0,0,this.scale,0,0); c.imageSmoothingEnabled=true;
      if(this.port){ c.fillStyle="#120a1c"; c.fillRect(0,0,R.W,this.VH); }
      c.save(); if(this.port){ c.translate(0,this.TOP); c.beginPath(); c.rect(0,0,R.W,R.H); c.clip(); }
      const full = this.phase==="vs" || (this.phase==="result" && !this.o.attract);
      if(this.phase==="vs") this.renderVs(c);
      else if(full) this.renderResult(c);
      else this.renderWorld(c);
      c.restore();
      if(full){ if(this.port) this.drawBandsIdle(c); return; }
      if(!this.o.attract) this.drawHUD(c);
      if(this.superCut){ c.save(); if(this.port) c.translate(0,this.TOP); this.drawSuperCut(c); c.restore(); }
    }
    renderWorld(c){
      c.save();
      const cm=this.cam, z=cm.z, cx=Math.max(R.W/2/z, Math.min(R.W-R.W/2/z, cm.x)), cy=Math.max(R.H/2/z, Math.min(R.H-R.H/2/z, cm.y));
      c.translate(R.W/2,R.H/2); c.scale(z,z); c.translate(-cx,-cy);
      if(this.shake>0) c.translate(Math.round((Math.random()-0.5)*this.shake*1.6/3)*3, Math.round((Math.random()-0.5)*this.shake*1.2/3)*3);
      // 背景＋かげ
      const bg=KK.stage.draw(this.L.bg,this.stage,this.frame,this.excite);
      for(const f of this.f) f.shadow(bg);
      for(const g of this.giants){ const k=Math.min(1,Math.max(0.2,(g.y+300)/700)); P.ellipseRows(bg,g.x,R.GROUND+4,150*k,22*k,"rgba(0,0,0,.4)",3); }
      this.L.bg.blit(c);
      if(this.dark>0){ c.fillStyle="rgba(8,4,18,"+(0.62*this.dark)+")"; c.fillRect(-40,-40,R.W+80,R.H+80); }
      // キャラ(攻撃中の方を手前に)
      const order = this.f[0].state==="attack" ? [this.f[1],this.f[0]] : [this.f[0],this.f[1]];
      for(const f of order) f.render(c,this.L.actor);
      // 飛び道具・巨大な自分(写真は高解像度)
      for(const p of this.projectiles){ const im=p.owner.a.mini, s=p.w/Math.max(im.width,im.height)*1.35;
        c.save(); c.translate(p.x,p.y); c.rotate(p.rot); c.drawImage(im,-im.width*s/2,-im.height*s/2,im.width*s,im.height*s); c.restore(); }
      for(const g of this.giants){ const im=g.owner.a.sticker, s=g.size/Math.max(im.width,im.height);
        const sq = g.landed ? 1-Math.max(0,0.22-g.t*0.02) : 1, al = g.landed ? Math.max(0,1-g.t/50) : 1;
        c.save(); c.globalAlpha=al; c.translate(g.x,g.y+(1-sq)*g.size/2);
        if(!g.landed){ c.globalAlpha=0.25; c.drawImage(im,-im.width*s/2,-im.height*s/2-60,im.width*s,im.height*s); c.globalAlpha=al; }
        c.drawImage(im,-im.width*s/2,-im.height*s/2,im.width*s,im.height*s*sq); c.restore(); }
      this.drawFx(c);
      c.restore();
      if(this.flash>0){ c.fillStyle="rgba(255,255,255,"+Math.min(0.85,this.flash*0.14)+")"; c.fillRect(0,0,R.W,R.H); }
    }
    // VS・勝利画面の時の 縦持ちの帯(空っぽにせず しま模様)
    drawBandsIdle(c){
      for(const [y,h] of [[0,this.TOP],[this.TOP+R.H,this.BOT]]){
        c.fillStyle="#1a0f24"; c.fillRect(0,y,R.W,h);
        c.fillStyle="#2a1a3a"; for(let x=-40;x<R.W;x+=40){ c.beginPath(); c.moveTo(x,y+h); c.lineTo(x+20,y+h); c.lineTo(x+40,y); c.lineTo(x+20,y); c.fill(); }
        c.fillStyle="#ffd23e"; c.fillRect(0, y===0 ? h-6 : y, R.W, 6);
      }
    }
    drawFx(c){
      const lines = this.dark>0.3 || (this.phase==="ko" && this.phaseT<40);
      if(!this.fx.length && !this.words.length && !lines) return;
      const L=this.L.fx, g=L.begin();
      for(const p of this.fx){ const k=1-p.t/p.life;
        if(p.k==="spark"){ const s=p.t<4?9:6; g.fillStyle=p.col; g.fillRect(p.x-s/2,p.y-s/2,s,s); g.fillStyle=INK; g.fillRect(p.x-p.vx*1.6-2,p.y-p.vy*1.6-2,4,4); }
        else if(p.k==="ring"){ g.save(); g.translate(p.x,p.y); g.scale(1,p.flat); g.beginPath(); g.arc(0,0,p.r,0,7); g.lineWidth=Math.max(3,12*k); g.strokeStyle=p.col; g.stroke(); g.restore(); }
        else if(p.k==="star"){ const r=p.r*(p.t<2?0.7:1)*(0.6+k*0.4);
          g.save(); g.translate(p.x,p.y); g.rotate(p.rot); g.beginPath();
          for(let i=0;i<16;i++){ const rr=i%2?r*0.38:r*(0.75+((i*7)%5)*0.08), a=i/16*Math.PI*2; g.lineTo(Math.cos(a)*rr,Math.sin(a)*rr); }
          g.closePath(); g.fillStyle=p.t<2?"#ffffff":"#ffe14d"; g.fill(); g.lineWidth=6; g.strokeStyle=INK; g.stroke();
          g.beginPath(); g.arc(0,0,r*0.3,0,7); g.fillStyle="#fff"; g.fill(); g.restore(); }
        else if(p.k==="puff"){ g.beginPath(); g.arc(p.x,p.y,p.r*(1.5-k*0.5),0,7); g.fillStyle=k>0.4?"#e6dccb":"#b9ae9a"; g.fill(); }
      }
      for(const w of this.words){ const k=w.t<5 ? 0.4+w.t*0.15 : 1, off=w.t>30 ? (w.t-30)*1.5 : 0;
        if(w.t>38 && w.t%2) continue;
        g.save(); g.translate(w.x,w.y-w.t*0.7+off*0); g.rotate(w.rot); g.scale(k*w.sz,k*w.sz);
        P.text(g,w.text,0,0,w.latin?32:48,w.col,{align:"center",latin:w.latin,ow:12,shadow:"#120a10",sd:6}); g.restore(); }
      // 超必殺・KO の集中線
      if(lines){
        g.strokeStyle="rgba(255,255,255,.9)"; g.lineWidth=3;
        for(let i=0;i<26;i++){ const a=i/26*Math.PI*2+this.frame*0.07, r0=330+((i*53+this.frame*13)%120);
          g.beginPath(); g.moveTo(R.W/2+Math.cos(a)*r0, R.H/2+Math.sin(a)*r0); g.lineTo(R.W/2+Math.cos(a)*700, R.H/2+Math.sin(a)*700); g.stroke(); }
      }
      L.crisp(); L.blit(c);
    }

    // ---- アーケード風HUD ----
    hudSig(){
      const [a,b]=this.f, blink=(this.frame>>2), sec=Math.ceil(this.timer/60);
      const anyBlink = a.meter>=R.METER_MAX||b.meter>=R.METER_MAX||a.hp<a.maxHp*0.25||b.hp<b.maxHp*0.25||sec<=10||this.comboShow;
      return [a.hp,b.hp,Math.round(a.trailHp/a.maxHp*110),Math.round(b.trailHp/b.maxHp*110),a.meter,b.meter,a.wins,b.wins,a.guardHp>>2,b.guardHp>>2,(a.cd.special||0)>>3,(b.cd.special||0)>>3,this.stat[0].score,this.stat[1].score,
        sec,this.round,a.alive,b.alive,this.comboShow?(this.comboShow.n+(this.comboShow.done?"d":"")+":"+(this.comboShow.t<6?this.comboShow.t:(this.comboShow.t>60?this.comboShow.t>>1:6))):-1,
        this.banner?this.banner.text+Math.min(this.banner.t,9):"",anyBlink?blink:0].join(",");
    }
    drawHUD(c){
      if(this.port) return this.drawHUDPort(c);
      const L=this.L.hud, sig=this.hudSig();
      if(sig===this._hudSig){ L.blit(c); this.drawPortraits(c); return; }
      this._hudSig=sig;
      const g=L.begin(), [a,b]=this.f, tags=this.o.tags||["1P","2P"];
      const BW=330, BH=20, BY=46;
      const side=(f,left)=>{
        const px = left ? 16 : R.W-16-58, bx = left ? 84 : R.W-84-BW;
        // 顔わく
        g.fillStyle=INK; g.fillRect(px-4,10,66,66); g.fillStyle="#f4efe2"; g.fillRect(px,14,58,58); g.fillStyle="#2a2440"; g.fillRect(px+4,18,50,50);
        // タグ(1P/CPU)
        g.fillStyle=INK; g.fillRect(px-8,4,44,22); g.fillStyle=f.glove; g.fillRect(px-6,6,40,18);
        P.text(g,tags[f.idx],px+14,22,16,"#fff",{align:"center",latin:true,ow:5});
        // 名前 (タイプ)
        const nm=String(f.a.ch.name).toUpperCase(), tg="("+f.a.tag+")";
        if(left){ P.text(g,nm,bx,38,28,"#fff",{ow:7}); P.text(g,tg,bx+P.measure(g,nm,28)+10,38,18,"#ffd23e",{ow:6}); }
        else { P.text(g,nm,bx+BW,38,28,"#fff",{align:"right",ow:7}); P.text(g,tg,bx+BW-P.measure(g,nm,28)-10,38,18,"#ffd23e",{align:"right",ow:6}); }
        // 体力
        const tr=Math.max(0,f.trailHp/f.maxHp), hp=f.hp/f.maxHp, low=hp<0.25 && this.frame%16<8;
        g.fillStyle=INK; g.fillRect(bx-4,BY-4,BW+8,BH+8);
        g.fillStyle="#5a0d12"; g.fillRect(bx,BY,BW,BH);
        const fill=(r,col)=>{ const w=Math.round(BW*r/2)*2; g.fillStyle=col; if(left) g.fillRect(bx+BW-w,BY,w,BH); else g.fillRect(bx,BY,w,BH); return w; };
        fill(tr,"#ff3a2a"); const w=fill(hp, low?"#ff9a1f":"#ffe234");
        g.fillStyle=low?"#ffd08a":"#fff7a8"; if(left) g.fillRect(bx+BW-w,BY,w,4); else g.fillRect(bx,BY,w,4);
        g.fillStyle="rgba(18,10,16,.35)"; for(let i=1;i<10;i++) g.fillRect(bx+BW*i/10,BY,2,BH);
        // 勝ち星
        for(let i=0;i<WIN_ROUNDS;i++){ const sx = left ? bx+BW-14-i*26 : bx+14+i*26;
          P.star(g,sx,BY+BH+16,10,i<f.wins?"#ffd23e":"#3a3350",5); }
        // スコア
        P.text(g,"SCORE "+String(this.stat[f.idx].score).padStart(8,"0"), left?bx:bx+BW, BY+BH+24, 16, "#fff", {latin:true,ow:5,align:left?"left":"right"});
        // ガード耐久(減ってる時だけ)
        if(f.guardHp<f.guardMax-1){ const gw=110, gx = left ? bx+BW-gw-60 : bx+60;
          g.fillStyle=INK; g.fillRect(gx-2,BY+BH+30,gw+4,10); g.fillStyle="#8fd0ff"; g.fillRect(gx,BY+BH+32,Math.round(gw*f.guardHp/f.guardMax/2)*2,6); }
        // 超ひっさつゲージ(下)
        // スマホは右下にボタンがあるので、ゲージは体力の下に出す
        const MW=240, MX = left ? (this.o.touch?84:20) : R.W-(this.o.touch?84:20)-MW, MY=this.o.touch?136:R.H-34, full=f.meter>=R.METER_MAX;
        g.fillStyle=INK; g.fillRect(MX-4,MY-4,MW+8,22);
        g.fillStyle="#241c3a"; g.fillRect(MX,MY,MW,14);
        const mw=Math.round(MW*f.meter/R.METER_MAX/2)*2;
        g.fillStyle= full ? ["#ff4fa3","#ffd23e","#5fe0ff"][(this.frame>>2)%3] : "#a056ff";
        if(left) g.fillRect(MX,MY,mw,14); else g.fillRect(MX+MW-mw,MY,mw,14);
        for(let i=1;i<4;i++){ g.fillStyle=INK; g.fillRect(MX+MW*i/4-1,MY,2,14); }
        P.text(g, full ? "MAX! しゃがみ+必殺" : "SUPER", left?MX:MX+MW, MY-10, full?24:16, full?"#ffd23e":"#fff", {align:left?"left":"right",latin:!full,ow:6});
        // 必殺(飛び道具)の クールダウン
        const cdMax=KK.MOVES.special.startup+KK.MOVES.special.active+KK.MOVES.special.recovery+KK.MOVES.special.cooldown, cd=f.cd.special||0;
        if(!full){ const CX = left ? MX+96 : MX+MW-96-64, CY=MY-26;
          g.fillStyle=INK; g.fillRect(CX-3,CY-3,70,20); g.fillStyle= cd>0 ? "#3a3350" : "#ff9a1f"; g.fillRect(CX,CY,64,14);
          if(cd>0){ g.fillStyle="#a056ff"; g.fillRect(CX,CY,Math.round(64*(1-cd/cdMax)/2)*2,14); }
          P.text(g,"必殺",CX+32,CY+13,16,cd>0?"#9d95c4":"#fff",{align:"center",ow:4}); }
      };
      side(a,true); side(b,false);
      // タイム
      const sec=Math.max(0,Math.ceil(this.timer/60));
      g.fillStyle="#d81f26"; g.fillRect(R.W/2-46,6,92,74); g.fillStyle=INK; g.fillRect(R.W/2-40,12,80,62); g.fillStyle="#f6f1e2"; g.fillRect(R.W/2-36,16,72,54);
      P.text(g,"TIME",R.W/2,32,16,"#d81f26",{align:"center",latin:true,outline:false});
      P.text(g,String(sec).padStart(2,"0"),R.W/2,66,32,sec<=10&&this.frame%30<15?"#d81f26":INK,{align:"center",latin:true,outline:false});
      // ラウンド札
      g.fillStyle=INK; g.fillRect(R.W/2-58,84,116,26); g.fillStyle="#c99a2e"; g.fillRect(R.W/2-54,88,108,18);
      P.text(g,"ROUND "+this.round,R.W/2,104,16,"#fff3c4",{align:"center",latin:true,ow:4});
      // コンボ
      if(this.comboShow){ const cs=this.comboShow, left=cs.who===0, k=cs.t<6?1.5-cs.t*0.08:1;
        if(!(cs.t>60 && cs.t%4<2)){ g.save(); g.translate(left?40:R.W-40,210); g.scale(k,k);
          P.text(g,cs.n+" HITS",0,0,32,"#ffd23e",{align:left?"left":"right",latin:true,ow:8,shadow:"#d81f26",sd:4});
          P.text(g, cs.done ? cs.dmg+" DMG" : "れんだ！",0,40,32,cs.done?"#ff9a1f":"#fff",{align:left?"left":"right",ow:8,latin:!!cs.done}); g.restore(); } }
      if(this.banner) this.drawBanner(g);
      // HUDがある帯だけカクカク処理(全面は重い)
      L.crisp(0,0,R.W,this.o.touch?160:128); L.crisp(0,R.H-72,R.W,72);
      if(this.banner) L.crisp(0,40,R.W,330); else if(this.comboShow) L.crisp(0,150,R.W,120);
      L.blit(c); this.drawPortraits(c);
    }
    // ---- 縦持ちHUD: 上の帯=顔・名前・体力・タイム・勝ち星 / 下の帯=ゲージ・必殺 / 帯なので試合にかぶらない ----
    drawHUDPort(c){
      const L=this.L.hud, sig="P"+this.hudSig();
      if(sig===this._hudSig){ L.blit(c); this.drawPortraitsPort(c); return; }
      this._hudSig=sig;
      const g=L.begin(), [a,b]=this.f, tags=this.o.tags||["1P","2P"], T=this.TOP, B0=this.TOP+R.H;
      // 帯の地
      g.fillStyle="#1a0f24"; g.fillRect(0,0,R.W,T); g.fillRect(0,B0,R.W,this.BOT);
      g.fillStyle="#ffd23e"; g.fillRect(0,T-6,R.W,6); g.fillRect(0,B0,R.W,6);
      const BW=286, BH=40, BY=58;
      const side=(f,left)=>{
        const px = left ? 10 : R.W-10-96, bx = left ? 116 : R.W-116-BW;
        g.fillStyle=INK; g.fillRect(px-4,8,104,104); g.fillStyle="#f4efe2"; g.fillRect(px,12,96,96); g.fillStyle="#2a2440"; g.fillRect(px+5,17,86,86);
        g.fillStyle=INK; g.fillRect(px-6,2,62,30); g.fillStyle=f.glove; g.fillRect(px-3,5,56,24);
        P.text(g,tags[f.idx],px+25,26,16,"#fff",{align:"center",latin:true,ow:5});
        const nm=String(f.a.ch.name);
        P.text(g,nm,left?bx:bx+BW,44,36,"#fff",{align:left?"left":"right",ow:8});
        const tr=Math.max(0,f.trailHp/f.maxHp), hp=f.hp/f.maxHp, low=hp<0.25 && this.frame%16<8;
        g.fillStyle=INK; g.fillRect(bx-5,BY-5,BW+10,BH+10); g.fillStyle="#5a0d12"; g.fillRect(bx,BY,BW,BH);
        const fill=(r,col)=>{ const w=Math.round(BW*r/2)*2; g.fillStyle=col; if(left) g.fillRect(bx+BW-w,BY,w,BH); else g.fillRect(bx,BY,w,BH); return w; };
        fill(tr,"#ff3a2a"); const w=fill(hp, low?"#ff9a1f":"#ffe234");
        g.fillStyle=low?"#ffd08a":"#fff7a8"; if(left) g.fillRect(bx+BW-w,BY,w,6); else g.fillRect(bx,BY,w,6);
        g.fillStyle="rgba(18,10,16,.35)"; for(let i=1;i<10;i++) g.fillRect(bx+BW*i/10,BY,2,BH);
        for(let i=0;i<WIN_ROUNDS;i++){ const sx = left ? bx+BW-16-i*34 : bx+16+i*34; P.star(g,sx,BY+BH+24,14,i<f.wins?"#ffd23e":"#3a3350",5); }
        if(f.guardHp<f.guardMax-1){ const gw=140, gx = left ? bx : bx+BW-gw;
          g.fillStyle=INK; g.fillRect(gx-2,BY+BH+16,gw+4,14); g.fillStyle="#8fd0ff"; g.fillRect(gx,BY+BH+18,Math.round(gw*f.guardHp/f.guardMax/2)*2,10); }
        // 下の帯: ゲージと必殺
        const MW=330, MX = left ? 20 : R.W-20-MW, MY=B0+50, full=f.meter>=R.METER_MAX;
        g.fillStyle=INK; g.fillRect(MX-5,MY-5,MW+10,34); g.fillStyle="#241c3a"; g.fillRect(MX,MY,MW,24);
        const mw=Math.round(MW*f.meter/R.METER_MAX/2)*2;
        g.fillStyle= full ? ["#ff4fa3","#ffd23e","#5fe0ff"][(this.frame>>2)%3] : "#a056ff";
        if(left) g.fillRect(MX,MY,mw,24); else g.fillRect(MX+MW-mw,MY,mw,24);
        for(let i=1;i<4;i++){ g.fillStyle=INK; g.fillRect(MX+MW*i/4-1,MY,3,24); }
        P.text(g, full ? "MAX! ▼+必殺" : "SUPER", left?MX:MX+MW, MY-10, full?32:16, full?"#ffd23e":"#fff", {align:left?"left":"right",latin:!full,ow:6});
        const cdMax=KK.MOVES.special.startup+KK.MOVES.special.active+KK.MOVES.special.recovery+KK.MOVES.special.cooldown, cd=f.cd.special||0;
        if(!full){ const CX = left ? MX+MW-96 : MX, CY=MY-34;
          g.fillStyle=INK; g.fillRect(CX-3,CY-3,102,26); g.fillStyle= cd>0 ? "#3a3350" : "#ff9a1f"; g.fillRect(CX,CY,96,20);
          if(cd>0){ g.fillStyle="#a056ff"; g.fillRect(CX,CY,Math.round(96*(1-cd/cdMax)/2)*2,20); }
          P.text(g,"必殺",CX+48,CY+18,20,cd>0?"#9d95c4":"#fff",{align:"center",ow:5}); }
      };
      side(a,true); side(b,false);
      // タイム・ラウンド
      const sec=Math.max(0,Math.ceil(this.timer/60));
      g.fillStyle="#d81f26"; g.fillRect(R.W/2-62,6,124,104); g.fillStyle=INK; g.fillRect(R.W/2-56,12,112,92); g.fillStyle="#f6f1e2"; g.fillRect(R.W/2-50,18,100,80);
      P.text(g,"TIME",R.W/2,40,16,"#d81f26",{align:"center",latin:true,outline:false});
      P.text(g,String(sec).padStart(2,"0"),R.W/2,90,48,sec<=10&&this.frame%30<15?"#d81f26":INK,{align:"center",latin:true,outline:false});
      g.fillStyle=INK; g.fillRect(R.W/2-74,114,148,30); g.fillStyle="#c99a2e"; g.fillRect(R.W/2-70,118,140,22);
      P.text(g,"ROUND "+this.round,R.W/2,136,16,"#fff3c4",{align:"center",latin:true,ow:4});
      // コンボ・帯の文字は 試合の中に
      g.save(); g.translate(0,T);
      if(this.comboShow){ const cs=this.comboShow, left=cs.who===0, k=cs.t<6?1.5-cs.t*0.08:1;
        if(!(cs.t>60 && cs.t%4<2)){ g.save(); g.translate(left?30:R.W-30,120); g.scale(k,k);
          P.text(g,cs.n+" HITS",0,0,48,"#ffd23e",{align:left?"left":"right",latin:true,ow:10,shadow:"#d81f26",sd:5});
          P.text(g, cs.done ? cs.dmg+" DMG" : "れんだ！",0,54,48,cs.done?"#ff9a1f":"#fff",{align:left?"left":"right",ow:10,latin:!!cs.done}); g.restore(); } }
      if(this.banner) this.drawBanner(g);
      g.restore();
      L.crisp(0,0,R.W,T); L.crisp(0,B0,R.W,this.BOT);
      if(this.banner) L.crisp(0,T+40,R.W,340); else if(this.comboShow) L.crisp(0,T+60,R.W,140);
      L.blit(c); this.drawPortraitsPort(c);
    }
    drawPortraitsPort(c){
      for(const f of this.f){ const px = f.idx===0 ? 10 : R.W-10-96, th=f.a.thumb, s=86/Math.max(th.width,th.height);
        c.save(); c.beginPath(); c.rect(px+5,17,86,86); c.clip(); if(!f.alive){ c.filter="grayscale(1)"; }
        c.drawImage(th, px+48-th.width*s/2, 17+43-th.height*s/2, th.width*s, th.height*s); c.restore(); }
    }
    // 顔写真(高解像度)
    drawPortraits(c){
      for(const f of this.f){ const px = f.idx===0 ? 16 : R.W-16-58, th=f.a.thumb, s=50/Math.max(th.width,th.height);
        c.save(); c.beginPath(); c.rect(px+4,18,50,50); c.clip(); if(!f.alive){ c.filter="grayscale(1)"; }
        c.drawImage(th, px+29-th.width*s/2, 18+25-th.height*s/2, th.width*s, th.height*s); c.restore(); }
    }
    drawBanner(g){
      const b=this.banner, t=b.t;
      let k = t<6 ? 2.2-t*0.2 : 1; if(b.kind==="ko") k = t<8 ? 3-t*0.25 : 1;
      const col = b.kind==="fight"||b.kind==="ko" ? "#ff4a3d" : "#ffe234";
      g.save(); g.translate(R.W/2, b.kind==="ko" ? 170 : R.H/2-40); g.scale(k,k);
      if(b.kind!=="win"){ g.fillStyle="rgba(18,10,16,.55)"; g.fillRect(-R.W, -54, R.W*2, 96); g.fillStyle="#ffd23e"; g.fillRect(-R.W,-54,R.W*2,4); g.fillRect(-R.W,38,R.W*2,4); }
      const latin=/^[\x20-\x7e]+$/.test(b.text), size = b.kind==="ko" ? 96 : (latin?64:56);
      P.text(g,b.text,0,size*0.35,size,col,{align:"center",latin,ow:14,shadow:"#120a10",sd:8});
      g.restore();
    }
    drawSuperCut(c){
      const s=this.superCut, f=s.who, t=s.t, k=Math.min(1,t/7), L=this.L.fx, g=L.begin();
      const y0=R.H/2-110*k, y1=R.H/2+90*k;
      g.fillStyle=f.glove; g.beginPath(); g.moveTo(0,y0+30); g.lineTo(R.W,y0-20); g.lineTo(R.W,y1-20); g.lineTo(0,y1+30); g.closePath(); g.fill();
      g.fillStyle="#ffd23e"; g.fillRect(0,y0+20,R.W,6); g.fillStyle="#ffd23e"; g.fillRect(0,y1+10,R.W,6);
      g.strokeStyle="rgba(255,255,255,.8)"; g.lineWidth=3;
      for(let i=0;i<24;i++){ const y=y0+10+((i*37)%(y1-y0)), x=(i*131+t*60)%(R.W+200)-200; g.beginPath(); g.moveTo(x,y); g.lineTo(x+160,y-8); g.stroke(); }
      const txX = f.idx===0 ? R.W*0.63 : R.W*0.37;
      P.text(g,"SUPER!!",txX,R.H/2-36,32,"#ffd23e",{align:"center",latin:true,ow:8});
      P.text(g,f.a.ch.superName||"超ひっさつ",txX,R.H/2+30,48,"#fff",{align:"center",ow:12,shadow:"#120a10",sd:6});
      L.crisp(); L.blit(c);
      const im=f.a.sticker, sz=250/Math.max(im.width,im.height), slide=(1-k)*400;
      const x = f.idx===0 ? 60-slide : R.W-60-im.width*sz+slide;
      c.save(); c.translate(x+im.width*sz/2, R.H/2-10); c.rotate((f.idx===0?-1:1)*0.06); c.drawImage(im,-im.width*sz/2,-im.height*sz/2,im.width*sz,im.height*sz); c.restore();
    }

    // ---- VS 画面 ----
    renderVs(c){
      const t=this.phaseT, L=this.L.hud, g=L.begin(), [a,b]=this.f;
      const slide=Math.max(0,1-t/24), slam=t>=34, k=slam?Math.max(1,2.6-(t-34)*0.3):0;
      g.fillStyle="#1a0f24"; g.fillRect(0,0,R.W,R.H);
      g.fillStyle="#b81e2a"; g.beginPath(); g.moveTo(0,0); g.lineTo(R.W/2+60-slide*600,0); g.lineTo(R.W/2-60-slide*600,R.H); g.lineTo(0,R.H); g.fill();
      g.fillStyle="#1e4fb8"; g.beginPath(); g.moveTo(R.W,0); g.lineTo(R.W/2+60+slide*600,0); g.lineTo(R.W/2-60+slide*600,R.H); g.lineTo(R.W,R.H); g.fill();
      g.strokeStyle="rgba(255,255,255,.18)"; g.lineWidth=4;
      for(let i=0;i<20;i++){ const y=(i*29+t*9)%R.H; g.beginPath(); g.moveTo(0,y); g.lineTo(R.W*0.4,y); g.moveTo(R.W*0.6,R.H-y); g.lineTo(R.W,R.H-y); g.stroke(); }
      g.fillStyle="#ffd23e"; g.beginPath(); g.moveTo(R.W/2+66-slide*600,0); g.lineTo(R.W/2+54-slide*600,0); g.lineTo(R.W/2-66-slide*600,R.H); g.lineTo(R.W/2-54-slide*600,R.H); g.fill();
      P.text(g,"BATTLE START",R.W/2,44,32,"#fff",{align:"center",latin:true,ow:8});
      const nameY=R.H-92;
      P.text(g,String(a.a.ch.name).toUpperCase(),R.W*0.25,nameY,40,"#fff",{align:"center",ow:10});
      P.text(g,"("+a.a.tag+")",R.W*0.25,nameY+36,24,"#ffd23e",{align:"center",ow:7});
      P.text(g,String(b.a.ch.name).toUpperCase(),R.W*0.75,nameY,40,"#fff",{align:"center",ow:10});
      P.text(g,"("+b.a.tag+")",R.W*0.75,nameY+36,24,"#ffd23e",{align:"center",ow:7});
      P.text(g,"STAGE : "+KK.stage.get(this.stage).name,R.W/2,84,24,"#c8c2e6",{align:"center",ow:6});
      if(slam){ g.save(); g.translate(R.W/2,R.H/2-10); g.scale(k,k); P.text(g,"VS",0,32,96,"#ffe234",{align:"center",latin:true,ow:18,shadow:"#d81f26",sd:8}); g.restore(); }
      L.crisp();
      c.save(); if(slam && t<44) c.translate((Math.random()-0.5)*16,(Math.random()-0.5)*12);
      L.blit(c);
      const pic=(f,cx,dir)=>{ const im=f.a.sticker, s=Math.min(330/im.width, 300/im.height);
        const x=cx+dir*slide*500, y=R.H/2-6+Math.sin(t*0.08+f.idx)*5;
        c.drawImage(im, x-im.width*s/2, y-im.height*s/2, im.width*s, im.height*s); };
      pic(a,R.W*0.25,-1); pic(b,R.W*0.75,1);
      c.restore();
      if(slam && t<40){ c.fillStyle="rgba(255,255,255,"+((40-t)/12)+")"; c.fillRect(0,0,R.W,R.H); }
    }

    // ---- 勝利画面(キャンバス) ----
    renderResult(c){
      const t=this.phaseT, L=this.L.hud, g=L.begin(), w=this.winner;
      const wf = w>=0 ? this.f[w] : null, lf = w>=0 ? this.f[1-w] : null;
      const base = wf ? (w===0?"#b81e2a":"#1e4fb8") : "#5a3d8a";
      g.fillStyle="#140a1e"; g.fillRect(0,0,R.W,R.H);
      // 回る後光
      g.save(); g.translate(R.W*0.33,R.H*0.48); g.rotate(t*0.006);
      for(let i=0;i<14;i++){ g.rotate(Math.PI*2/14); g.fillStyle = i%2 ? base : P.shade(base.length===7?base:"#5a3d8a",0.6); g.beginPath(); g.moveTo(0,0); g.lineTo(900,-130); g.lineTo(900,130); g.fill(); }
      g.restore();
      // 紙ふぶき
      for(let i=0;i<46;i++){ const x=(i*97+Math.sin(t*0.03+i)*40)%R.W, y=((i*61)+t*(1.6+(i%5)*0.4))%(R.H+40)-20;
        g.fillStyle=["#ffd23e","#ff4fa3","#5fe0ff","#fff","#7cff6a"][i%5]; g.fillRect(x,y,(i%3)*3+6,(i%2)*3+6); }
      const k=Math.min(1,t/14);
      if(wf){
        g.save(); g.translate(R.W*0.33,92); g.scale(2-k,2-k); P.text(g,"WINNER!",0,0,64,"#ffe234",{align:"center",latin:true,ow:16,shadow:"#d81f26",sd:8}); g.restore();
        P.text(g,String(wf.a.ch.name).toUpperCase(),R.W*0.33,R.H-112,48,"#fff",{align:"center",ow:12,shadow:"#120a10",sd:6});
        // 勝利コメント(ふきだし)
        if(t>30){ const bx=R.W*0.56, by=96; g.fillStyle=INK; g.fillRect(bx-6,by-6,400,92); g.fillStyle="#fff"; g.fillRect(bx,by,388,80);
          g.beginPath(); g.moveTo(bx,by+50); g.lineTo(bx-40,by+80); g.lineTo(bx+10,by+70); g.fill();
          const q="「"+this.winLine+"」", qs=Math.min(32, Math.floor(32*360/Math.max(1,P.measure(g,q,32))));
          P.text(g,q,bx+194,by+40+qs*0.4,qs,INK,{align:"center",outline:false}); }
        // 成績
        const st=this.stat[w], rows=[["最大コンボ",st.maxCombo+" HITS"],["与えたダメージ",String(st.dmg)],["のこり体力",Math.round(wf.hp/wf.maxHp*100)+"%"],["SCORE",String(Math.round(st.score*Math.min(1,Math.max(0,(t-40)/50)))).padStart(8,"0")]];
        if(t>40){ const sx=R.W*0.56, sy=214; g.fillStyle=INK; g.fillRect(sx-6,sy-6,400,180); g.fillStyle="#241c3a"; g.fillRect(sx,sy,388,168);
          rows.forEach((r,i)=>{ if(t>40+i*8){ P.text(g,r[0],sx+16,sy+36+i*38,24,"#c8c2e6",{ow:6}); P.text(g,r[1],sx+372,sy+36+i*38,i===3?24:24,i===3?"#ffd23e":"#fff",{align:"right",latin:/^[\x20-\x7e%]+$/.test(r[1]),ow:6}); } }); }
        if(st.perfect && t>90) { g.save(); g.translate(R.W*0.7,428); g.rotate(-0.12); P.text(g,"PERFECT!",0,0,32,"#7cff6a",{align:"center",latin:true,ow:8}); g.restore(); }
      } else {
        g.save(); g.translate(R.W/2,110); g.scale(2-k,2-k); P.text(g,"DRAW GAME",0,0,64,"#ffe234",{align:"center",latin:true,ow:16,shadow:"#5a3d8a",sd:8}); g.restore();
        P.text(g,"「"+this.winLine+"」",R.W/2,R.H-70,40,"#fff",{align:"center",ow:10});
      }
      L.crisp(); L.blit(c);
      // 写真(高解像度)
      if(wf){
        const im=wf.a.sticker, s=Math.min(340/im.width,250/im.height)*(0.6+0.4*k), bounce=Math.abs(Math.sin(t*0.09))*-14;
        c.save(); c.translate(R.W*0.33,R.H*0.44+bounce); c.rotate(Math.sin(t*0.05)*0.05); c.drawImage(im,-im.width*s/2,-im.height*s/2,im.width*s,im.height*s); c.restore();
        const li=lf.a.sticker, ls=Math.min(120/li.width,110/li.height);
        c.save(); c.translate(R.W*0.92,R.H-150); c.rotate(0.5); c.filter="grayscale(1) brightness(.8)"; c.drawImage(li,-li.width*ls/2,-li.height*ls/2,li.width*ls,li.height*ls); c.filter="none";
        c.fillStyle="#f4efe2"; c.strokeStyle=INK; c.lineWidth=3; // ばんそうこう
        for(const r of [0.7,-0.7]){ c.save(); c.rotate(r); c.fillRect(-48,-9,96,18); c.strokeRect(-48,-9,96,18); c.restore(); }
        c.restore();
        P.text(c,"LOSE...",R.W*0.92,R.H-82,16,"#8a83a8",{align:"center",latin:true,ow:4});
      } else {
        this.f.forEach((f,i)=>{ const im=f.a.sticker, s=Math.min(280/im.width,260/im.height);
          c.save(); c.translate(R.W*(i?0.7:0.3),R.H*0.5); c.rotate((i?1:-1)*0.1+Math.sin(t*0.06+i)*0.05); c.drawImage(im,-im.width*s/2,-im.height*s/2,im.width*s,im.height*s); c.restore(); });
      }
    }
  }
  function overlap(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  KK.Battle=Battle;
})();
