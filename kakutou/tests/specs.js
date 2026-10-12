/* =====================================================================
   ペタ拳: テスト(Node でも ブラウザでも同じものが動く)
   - Node:     node kakutou/tests/run.js
   - ブラウザ: kakutou/tests/tests.html を開く
   描画なし(headless)の本物の Battle / Fighter / CPU を、台本どおりに入力して検証する。
   ===================================================================== */
(function(root){
  "use strict";
  const T=[];
  const test=(name,fn)=>T.push({name,fn});
  const ok=(c,msg)=>{ if(!c) throw new Error(msg||"assert failed"); };
  const eq=(a,b,msg)=>{ if(a!==b) throw new Error((msg?msg+": ":"")+"expected "+JSON.stringify(b)+" got "+JSON.stringify(a)); };

  // ---------- 道具 ----------
  function asset(stats){
    const st=KK.chars.normalizeStats(stats||{hp:3,atk:3,def:3,spd:3});
    const stk={width:200,height:200};
    return { ch:{name:"T",shout:"",superName:""}, stats:st, mods:KK.chars.mods(st), display:"head", outfit:KK.chars.OUTFITS.suit,
      sticker:stk, flash:stk, mini:{width:50,height:50}, thumb:{width:50,height:50}, tag:"", flip:"none", faceDir:"right",
      pose(){ return {sticker:stk, flash:stk}; } };
  }
  function scripted(){ const c={ keys:{}, read(){ return Object.assign({},c.keys); } }; return c; }
  function fight(o){
    o=o||{};
    const c1=o.c1||scripted(), c2=o.c2||scripted();
    const b=new KK.Battle({ headless:true, assets:[asset(o.s1),asset(o.s2)], ctrls:[c1,c2], stage:"haikyo", sound:false, attract:true,
      onEnd:(r)=>{ b.ended=r; } });
    let n=0; while(b.phase!=="fight" && n<1500){ b.step(); n++; }
    const p=b.f[0], q=b.f[1];
    p.x=300; q.x=300+(o.dist||90); p.facing=1; q.facing=-1;
    return { b, c1, c2, p, q };
  }
  const run=(b,n)=>{ for(let i=0;i<n;i++) b.step(); };
  // キーを1フレームだけ押して離す(hold は押しっぱなしで一緒に押すキー)
  function tap(b, c, key, hold){ for(const h of (hold||[])) c.keys[h]=true; c.keys[key]=true; b.step(); c.keys[key]=false; }
  function release(c){ c.keys={}; }

  const M=()=>KK.MOVES;

  // ================= 攻撃の判定 =================
  test("立ち弱: 発生4Fちょうどで当たる", ()=>{
    const {b,c1,q}=fight({dist:90}); const hp=q.hp; let frames=0;
    tap(b,c1,"a");
    while(q.hp===hp && frames<30){ b.step(); frames++; }
    eq(frames+1, M().light.startup, "当たったフレーム");
  });
  test("持続が終わった後は当たらない(持続3F)", ()=>{
    const {b,c1,p,q}=fight({dist:400}); tap(b,c1,"a");
    run(b, M().light.startup+M().light.active); // 持続が終わるまで空振り
    q.x=p.x+90; const hp=q.hp; run(b,5);
    eq(q.hp,hp,"持続後に近づいても当たらない");
  });
  test("攻撃できる距離: 届かなければダメージ0、届けば当たる", ()=>{
    const reach=M().light.box.x+M().light.box.w;
    let t=fight({dist:reach+R().HURT_W+20}); let hp=t.q.hp; tap(t.b,t.c1,"a"); run(t.b,20); eq(t.q.hp,hp,"射程外");
    t=fight({dist:reach+R().HURT_W-10}); hp=t.q.hp; tap(t.b,t.c1,"a"); run(t.b,20); ok(t.q.hp<hp,"射程内で当たる");
  });
  test("攻撃判定は画像ではなく技ごとの箱: 強は弱より遠くまで届く", ()=>{
    const dist=M().light.box.x+M().light.box.w+R().HURT_W+10;
    let t=fight({dist}); let hp=t.q.hp; tap(t.b,t.c1,"a"); run(t.b,20); eq(t.q.hp,hp,"弱は届かない");
    t=fight({dist}); hp=t.q.hp; tap(t.b,t.c1,"b"); run(t.b,25); ok(t.q.hp<hp,"強は届く");
  });

  // ================= 体力・ダメージ =================
  test("ダメージ計算: 基本値 × 攻撃力倍率 × 防御力倍率", ()=>{
    const {b,c1,q,p}=fight({dist:90, s1:{hp:1,atk:5,def:1,spd:5}, s2:{hp:5,atk:1,def:1,spd:5}});
    const hp=q.hp; tap(b,c1,"a"); run(b,10);
    eq(hp-q.hp, Math.round(M().light.dmg*p.m.dmg*q.m.taken), "弱のダメージ");
  });
  test("防御力が高いほど受けるダメージが減る", ()=>{
    const lo=fight({dist:90, s2:{hp:5,atk:5,def:1,spd:1}}), hi=fight({dist:90, s2:{hp:1,atk:2,def:5,spd:4}});
    const a=lo.q.hp, b2=hi.q.hp; tap(lo.b,lo.c1,"b"); tap(hi.b,hi.c1,"b"); run(lo.b,20); run(hi.b,20);
    ok(a-lo.q.hp > b2-hi.q.hp, "防御1:"+(a-lo.q.hp)+" 防御5:"+(b2-hi.q.hp));
  });
  test("ガード: 相手と反対方向で立ちガード → 削りは技の chip 割合だけ", ()=>{
    const {b,c1,c2,p,q}=fight({dist:100}); c2.keys.r=true; const hp=q.hp;
    tap(b,c1,"b"); run(b,20);
    eq(hp-q.hp, Math.round(M().heavy.dmg*p.m.dmg*q.m.taken*M().heavy.chip), "削り");
    ok(b.stat[0].dmg>0, "与ダメ集計");
  });
  test("通常技の削りではKOしない(体力1で止まる)", ()=>{
    const {b,c1,c2,q}=fight({dist:100}); c2.keys.r=true; q.hp=3;
    tap(b,c1,"b"); run(b,20); eq(q.hp,1);
  });
  test("ガード硬直・被弾硬直がそれぞれの値で入る", ()=>{
    let t=fight({dist:90}); t.c2.keys.r=true; tap(t.b,t.c1,"a"); run(t.b,M().light.startup-1);
    eq(t.q.state,"blockstun"); ok(Math.abs(t.q.stun-M().light.blockstun)<=1,"ガード硬直 "+t.q.stun);
    t=fight({dist:90}); tap(t.b,t.c1,"a"); run(t.b,M().light.startup-1);
    eq(t.q.state,"hitstun"); ok(Math.abs(t.q.stun-M().light.hitstun)<=1,"被弾硬直 "+t.q.stun);
  });
  test("下段(しゃがみ弱)は立ちガードできず、しゃがみガードでは防げる", ()=>{
    let t=fight({dist:90}); t.c2.keys.r=true; let hp=t.q.hp; tap(t.b,t.c1,"a",["d"]); run(t.b,10);
    ok(t.q.hp<hp && t.q.state==="hitstun","立ちガードは崩される");
    t=fight({dist:90}); t.c2.keys.r=true; t.c2.keys.d=true; tap(t.b,t.c1,"a",["d"]); run(t.b,6);
    eq(t.q.state,"blockstun","しゃがみガード成功");
  });
  test("上段(立ち弱)は しゃがむと空振り", ()=>{
    const {b,c1,c2,q}=fight({dist:90}); c2.keys.d=true; run(b,2); const hp=q.hp;
    tap(b,c1,"a"); run(b,15); eq(q.hp,hp);
  });
  test("空中攻撃は しゃがみガード不可・立ちガード可", ()=>{
    const jumpAttack=(guardKeys)=>{ const t=fight({dist:190}); for(const k of guardKeys) t.c2.keys[k]=true;
      t.c1.keys.r=true; tap(t.b,t.c1,"u"); run(t.b,29); tap(t.b,t.c1,"b"); t.c1.keys={};
      let hitOrBlock=""; for(let i=0;i<40;i++){ t.b.step(); if(t.q.state==="hitstun"||t.q.state==="knock"){hitOrBlock="hit";break;} if(t.q.state==="blockstun"){hitOrBlock="block";break;} }
      return hitOrBlock; };
    eq(jumpAttack(["r","d"]),"hit","しゃがみガードは崩される");
    eq(jumpAttack(["r"]),"block","立ちガードで防げる");
  });
  test("ノックバック: 強が当たると相手が押し離される", ()=>{
    const {b,c1,q}=fight({dist:100}); const x=q.x; tap(b,c1,"b"); run(b,24); ok(q.x>x+10,"押された量 "+(q.x-x).toFixed(1));
  });

  // ================= コンボ =================
  test("コンボ: 弱→弱→強→必殺 がキャンセルでつながり、補正がかかる", ()=>{
    const {b,c1,p,q}=fight({dist:85}); const hp=q.hp; let maxCombo=0;
    const seq=[["a",6],["a",6],["b",11],["c",30]];
    for(const [k,wait] of seq){ tap(b,c1,k); for(let i=0;i<wait;i++){ b.step(); maxCombo=Math.max(maxCombo,q.combo); } }
    eq(maxCombo,4,"4段コンボ");
    const base=(mv)=>mv.dmg*p.m.dmg*q.m.taken;
    const expect=Math.round(base(M().light))+Math.round(base(M().light))+Math.round(base(M().heavy)*0.85)+Math.round(base(KK.PROJ_HIT)*0.72);
    eq(hp-q.hp, expect, "補正込みの合計ダメージ");
  });
  test("コンボ終了で「何段・何ダメージ」を集計して表示する", ()=>{
    const {b,c1}=fight({dist:85});
    tap(b,c1,"a"); run(b,6); tap(b,c1,"a"); run(b,6); tap(b,c1,"b"); run(b,60);
    ok(b.comboShow && b.comboShow.done && b.comboShow.n>=3 && b.comboShow.dmg>0, JSON.stringify(b.comboShow));
  });
  test("コンボは無限につながらない(弱連打を300F続けても 4段以下)", ()=>{
    const {b,c1,p,q}=fight({dist:85}); let maxCombo=0;
    for(let i=0;i<300;i++){ c1.keys.a = (i%3===0); b.step(); q.x=p.x+85; maxCombo=Math.max(maxCombo,q.combo); }
    ok(maxCombo<=4, "最大 "+maxCombo+" 段");
  });
  test("コンボが長いほど 相手の のけぞりが短くなる", ()=>{
    const {b,q}=fight({dist:85});
    q.combo=4; const p=b.f[0];
    b.resolve(p,q,M().light,{x:q.x,y:q.y-100},"light");
    eq(q.stun, Math.max(R().HITSTUN_MIN, M().light.hitstun-R().HITSTUN_DECAY*2));
    q.combo=1; b.resolve(p,q,M().light,{x:q.x,y:q.y-100},"light"); eq(q.stun, M().light.hitstun, "2段目までは減らない");
  });
  test("基本コンボ(弱→弱→強→必殺)は どの能力値の組み合わせでも つながる", ()=>{
    const builds=[{hp:1,atk:5,def:1,spd:5},{hp:5,atk:1,def:5,spd:1},{hp:3,atk:5,def:2,spd:2},{hp:4,atk:2,def:4,spd:2},{hp:3,atk:3,def:3,spd:3}];
    for(const s1 of builds) for(const s2 of builds){
      const {b,c1,q}=fight({dist:85,s1,s2}); let maxCombo=0;
      for(const [k,wait] of [["a",6],["a",6],["b",11],["c",34]]){ tap(b,c1,k); for(let i=0;i<wait;i++){ b.step(); maxCombo=Math.max(maxCombo,q.combo); } }
      eq(maxCombo,4,JSON.stringify(s1)+" vs "+JSON.stringify(s2));
    }
  });
  test("ガードされた技は キャンセルできても コンボ数は増えない", ()=>{
    const {b,c1,c2,q}=fight({dist:85}); c2.keys.r=true;
    tap(b,c1,"a"); run(b,6); tap(b,c1,"a"); run(b,20); eq(q.combo,0);
  });

  // ================= 投げ =================
  test("投げ: ガードしている相手を投げられる(ダメージ＋ダウン)", ()=>{
    const {b,c1,c2,p,q}=fight({dist:70}); c2.keys.r=true; c2.keys.d=true; run(b,2); const hp=q.hp;
    tap(b,c1,"t"); run(b,6); eq(q.state,"thrown","つかんだ");
    c2.keys={}; run(b,40);
    eq(hp-q.hp, Math.round(KK.THROW_HIT.dmg*p.m.dmg*q.m.taken), "投げダメージ");
    ok(["knock","down","getup"].includes(q.state), "ダウン "+q.state);
  });
  test("投げ: 弱+強の同時押しでも出る", ()=>{
    const {b,c1,q}=fight({dist:70}); c1.keys.a=true; c1.keys.b=true; b.step(); c1.keys={}; run(b,8); eq(q.state,"thrown");
  });
  test("投げぬけ: つかまれて10F以内に投げボタン → ダメージなし", ()=>{
    const {b,c1,c2,q}=fight({dist:70}); const hp=q.hp;
    tap(b,c1,"t"); run(b,M().throw.startup); eq(q.state,"thrown");
    run(b,3); tap(b,c2,"t"); run(b,30); eq(q.hp,hp,"投げぬけ成功");
  });
  test("ガード硬直中・遠い相手は 投げられない(空振り)", ()=>{
    let t=fight({dist:70}); t.q.setState("blockstun"); t.q.stun=30; tap(t.b,t.c1,"t"); run(t.b,8); ok(t.q.state!=="thrown","硬直中");
    t=fight({dist:200}); tap(t.b,t.c1,"t"); run(t.b,8); ok(t.q.state!=="thrown","遠い"); eq(t.p.state,"attack","空振りの硬直");
  });

  // ================= ダウン・起き上がり =================
  test("足払いでダウン → ダウン中は無敵 → 起き上がる", ()=>{
    const {b,c1,p,q}=fight({dist:110}); tap(b,c1,"b",["d"]); let downSeen=false;
    for(let i=0;i<40 && !downSeen;i++){ b.step(); if(q.state==="down") downSeen=true; }
    ok(downSeen,"ダウンした");
    const hp=q.hp; p.setState("idle"); c1.keys={}; q.x=p.x+90; tap(b,c1,"a"); run(b,8); eq(q.hp,hp,"ダウン中は当たらない");
    let up=false; for(let i=0;i<80;i++){ b.step(); if(q.state==="idle"||q.state==="walk"){ up=true; break; } }
    ok(up,"起き上がった");
  });

  // ================= その他のシステム =================
  test("必殺はクールダウン中に出せない", ()=>{
    const {b,c1,p}=fight({dist:600}); tap(b,c1,"c"); run(b,50); b.projectiles=[];
    p.setState("idle"); tap(b,c1,"c"); run(b,2); ok(!(p.state==="attack" && p.moveKey==="special"),"2発目は出ない");
    run(b,120); p.setState("idle"); tap(b,c1,"c"); run(b,2); eq(p.moveKey,"special","クールダウン後は出る");
  });
  test("しゃがむと やられ判定が低くなる", ()=>{
    const {b,c2,q}=fight({}); const h1=q.hurtbox().h; c2.keys.d=true; run(b,2); ok(q.hurtbox().h<h1);
  });

  // ================= ラウンド・勝敗 =================
  test("タイムアップ: 体力の割合が多い方がラウンドを取る", ()=>{
    const {b,p,q}=fight({}); q.hp=q.maxHp*0.4; p.hp=p.maxHp*0.6; b.timer=1; run(b,1);
    eq(b.phase,"ko"); eq(b.roundWinner,0);
  });
  test("同じ割合なら引き分け(両者に1本)", ()=>{
    const {b}=fight({}); b.timer=1; run(b,1); eq(b.roundWinner,-1); run(b,130); eq(b.f[0].wins,1); eq(b.f[1].wins,1);
  });
  test("体力0でKO → 2本先取で試合終了・勝者決定", ()=>{
    const t=fight({dist:90});
    for(let r=0;r<2;r++){
      let n=0; while(t.b.phase!=="fight" && n<1500){ t.b.step(); n++; }
      t.p.x=300; t.q.x=390; t.q.hp=1; t.p.setState("idle"); release(t.c1); tap(t.b,t.c1,"a"); run(t.b,10);
      eq(t.b.phase,"ko","KOになる");
      n=0; while(t.b.phase==="ko" && n<600){ t.b.step(); n++; }
    }
    eq(t.b.phase,"result"); eq(t.b.winner,0); eq(t.b.ended.winner,0); eq(t.b.ended.wins[0],2);
  });

  // ================= 時間の管理 =================
  test("固定ステップ: 30Hz でも 144Hz でも 1秒で60フレーム進む", ()=>{
    const go=(hz)=>{ const t=fight({}); t.b.paused=false; t.b._last=0; t.b._acc=0; const f0=t.b.frame; let ts=0;
      for(let i=0;i<hz;i++){ ts+=1000/hz; t.b.tick(ts); } return t.b.frame-f0; };
    const a=go(30), c=go(144);
    ok(Math.abs(a-60)<=1 && Math.abs(c-60)<=1, "30Hz:"+a+" 144Hz:"+c);
  });
  test("ヒットストップ中も入力は失われない(先行入力)", ()=>{
    const {b,c1,q}=fight({dist:85}); tap(b,c1,"a"); run(b,M().light.startup); ok(b.hitstop>0,"止まっている");
    tap(b,c1,"b"); let combo=0; for(let i=0;i<30;i++){ b.step(); combo=Math.max(combo,q.combo); } eq(combo,2,"止まっている間に押した強がつながる");
  });

  // ================= 能力値 =================
  test("能力値: 各1〜5・合計12に補正、倍率は上下限の範囲", ()=>{
    const s=KK.chars.normalizeStats({hp:9,atk:9,def:0,spd:-3}); const sum=s.hp+s.atk+s.def+s.spd;
    eq(sum,12); for(const k of ["hp","atk","def","spd"]) ok(s[k]>=1&&s[k]<=5,k);
    const hi=KK.chars.mods({hp:5,atk:5,def:1,spd:1}); ok(hi.dmg<=1.15 && hi.hp<=1160 && hi.taken<=1.13,"上限");
  });

  // ================= CPU =================
  function cpuFight(level, o){ const cpu=KK.cpu(level); const t=fight(Object.assign({c2:cpu},o||{})); t.cpu=cpu; return t; }
  test("CPU: 遠いと 近づくか必殺を使う(その場で空振りし続けない)", ()=>{
    let good=0;
    for(let k=0;k<10;k++){ const t=cpuFight(1,{dist:560}); const x=t.q.x; let proj=false, whiff=0;
      for(let i=0;i<120;i++){ t.b.step(); if(t.b.projectiles.length) proj=true; if(t.q.state==="attack" && !t.q.move.projectile && Math.abs(t.q.x-t.p.x)>300) whiff++; }
      if((t.q.x<x-40 || proj) && whiff<5) good++; }
    ok(good>=8, good+"/10");
  });
  test("CPU(つよい): 強攻撃が来たら たいていガードする(自分が技を出していない時)", ()=>{
    let blocked=0, chances=0;
    for(let k=0;k<30;k++){ const t=cpuFight(2,{dist:110}); run(t.b,1); tap(t.b,t.c1,"b"); let free=true;
      for(let i=0;i<20;i++){ t.b.step(); if(t.q.state==="attack"||t.q.state==="prejump"||t.q.state==="air") free=false;
        if(t.q.state==="blockstun"){ blocked++; break; } if(t.q.state==="hitstun") break; }
      if(free) chances++; }
    ok(chances>0 && blocked/chances>=0.6, blocked+"/"+chances);
  });
  test("CPU(つよい): 下段(足払い)には しゃがみガードで対応する(自分が技を出していない時)", ()=>{
    let blocked=0, chances=0, crouched=0;
    for(let k=0;k<40;k++){ const t=cpuFight(2,{dist:110}); run(t.b,1); tap(t.b,t.c1,"b",["d"]); t.c1.keys={}; let free=true;
      for(let i=0;i<24;i++){ t.b.step(); if(t.q.state==="attack"||t.q.state==="prejump"||t.q.state==="air") free=false;
        if(t.q.state==="blockstun"){ blocked++; if(t.q.lowStance) crouched++; break; } if(t.q.state==="knock"||t.q.state==="hitstun") break; }
      if(free) chances++; }
    ok(chances>0 && blocked/chances>=0.55 && crouched===blocked, blocked+"/"+chances+" しゃがみ"+crouched);
  });
  test("CPU(つよい): 空振りした強に 反撃する", ()=>{
    let punished=0;
    for(let k=0;k<30;k++){ const t=cpuFight(2,{dist:185}); const hp=t.p.hp; t.cpu.idle(14); tap(t.b,t.c1,"b");
      for(let i=0;i<50;i++){ t.b.step(); if(t.p.hp<hp){ punished++; break; } } }
    ok(punished/30>=0.7, punished+"/30");
  });
  test("CPU: 行動がばらける(同じ行動が6割を超えない・4種類以上)", ()=>{
    const t=cpuFight(1,{dist:200});
    for(let i=0;i<2400;i++){ t.b.step(); if(t.b.phase!=="fight"){ t.b.phase="fight"; t.p.hp=t.p.maxHp; t.q.hp=t.q.maxHp; t.b.timer=3600; } }
    const cnt={}; for(const a of t.cpu.debug.log) cnt[a]=(cnt[a]||0)+1;
    const total=t.cpu.debug.log.length, top=Math.max(...Object.values(cnt));
    ok(Object.keys(cnt).length>=4 && top/total<=0.6, JSON.stringify(cnt));
  });
  test("CPU同士の試合が最後まで進み、勝敗が決まる(数値の破綻なし)", ()=>{
    for(let k=0;k<3;k++){
      const c1=KK.cpu(k), c2=KK.cpu(2-k); const t=fight({c1,c2}); let n=0;
      while(t.b.phase!=="result" && n<60*60*10){ t.b.step(); n++; for(const f of t.b.f) ok(isFinite(f.x)&&isFinite(f.y)&&isFinite(f.hp),"NaN"); }
      eq(t.b.phase,"result","試合終了"); const e=t.b.ended; ok(e && (e.winner===0||e.winner===1||e.winner===-1),"勝敗");
    }
  });

  test("声: 文字を音節に分ける(小さい字は1音節・のばし棒は長く・漢字は2音節)", ()=>{
    const m=KK.voice.toMora("きゃっと ファイッ！ー拳");
    const vs=m.filter(x=>x.v!=="pause").map(x=>x.v).join("");
    ok(vs.startsWith("a")&&m.some(x=>x.accent), JSON.stringify(m));
    eq(KK.voice.toMora("あいうえお").map(x=>x.v).join(""),"aiueo");
    eq(KK.voice.toMora("拳").length,2);
  });

  function R(){ return KK.RULES; }

  function runAll(report){
    const res=[]; let pass=0;
    for(const t of T){ const t0=Date.now(); try{ t.fn(); res.push({name:t.name,ok:true,ms:Date.now()-t0}); pass++; }
      catch(e){ res.push({name:t.name,ok:false,err:e.message,ms:Date.now()-t0}); } if(report) report(res[res.length-1]); }
    return { pass, fail:T.length-pass, total:T.length, results:res };
  }
  root.KK_TESTS={ run:runAll, count:()=>T.length };
})(typeof window!=="undefined"?window:globalThis);
