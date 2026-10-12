/* =====================================================================
   ペタ拳: ステージ(KK.stage)。90年代アーケード風のドット背景。
   1ドット=論理3px の低解像度に描く。止まった絵は一度だけ描いてキャッシュ、
   ゆれる物(チラつく蛍光灯・舞う紙・ネオン・湯気)だけ毎フレーム。
   ステージを足すときは STAGES に {id,name,en,paint(c),live(c,t,ex)} を1つ足すだけ。
   ===================================================================== */
window.KK = window.KK || {};
KK.stage = (function(){
  "use strict";
  const P=KK.pixel, INK=P.INK, W=960, H=540, G=470, PX=3;
  // ドット単位にそろえた矩形
  const R=(c,x,y,w,h,col)=>{ c.fillStyle=col; c.fillRect(Math.round(x/PX)*PX, Math.round(y/PX)*PX, Math.max(PX,Math.round(w/PX)*PX), Math.max(PX,Math.round(h/PX)*PX)); };
  const L=(c,x0,y0,x1,y1,col,w)=>{ c.beginPath(); c.moveTo(x0,y0); c.lineTo(x1,y1); c.strokeStyle=col; c.lineWidth=w||PX; c.stroke(); };
  let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  // 遠近の床タイル。y0〜H を消失点(vx,vy)に向けて分割
  function floor(c,y0,base,grout,opt){
    opt=opt||{}; R(c,0,y0,W,H-y0,base);
    const rows=opt.rows||7; let prev=y0;
    for(let i=1;i<=rows+1;i++){ const k=i/(rows+1), y=y0+(H-y0)*Math.pow(k,1.45);
      if(opt.alt){ for(let j=-12;j<12;j++){ if((i+j)%2) continue; const xa=480+(j*90)*(prev-y0+40)/(H-y0+40)*1.6, xb=480+((j+1)*90)*(prev-y0+40)/(H-y0+40)*1.6;
        c.fillStyle=opt.alt; c.beginPath(); c.moveTo(xa,prev); c.lineTo(xb,prev);
        const xc=480+((j+1)*90)*(y-y0+40)/(H-y0+40)*1.6, xd=480+(j*90)*(y-y0+40)/(H-y0+40)*1.6; c.lineTo(xc,y); c.lineTo(xd,y); c.fill(); } }
      L(c,0,y,W,y,grout,PX); prev=y; }
    for(let j=-12;j<=12;j++){ const xt=480+j*90*(40/(H-y0+40))*1.6, xb=480+j*90*1.6; L(c,xt,y0,xb,H,grout,PX); }
    L(c,0,y0,W,y0,INK,PX*2);
  }
  function box(c,x,y,w,h,open){ // ダンボール
    R(c,x,y,w,h,"#b07a3e"); R(c,x,y,w*0.35,h,"#94632f"); R(c,x,y+h*0.42,w,PX*3,"#d9b27a");
    c.strokeStyle=INK; c.lineWidth=PX*2; c.strokeRect(x,y,w,h);
    if(open){ c.fillStyle="#c58b4a"; c.beginPath(); c.moveTo(x,y); c.lineTo(x-w*0.25,y-h*0.35); c.lineTo(x+w*0.3,y-h*0.25); c.lineTo(x+w*0.35,y); c.closePath(); c.fill(); c.stroke();
      c.fillStyle="#a06e36"; c.beginPath(); c.moveTo(x+w,y); c.lineTo(x+w*1.2,y-h*0.3); c.lineTo(x+w*0.7,y-h*0.32); c.lineTo(x+w*0.65,y); c.closePath(); c.fill(); c.stroke();
      R(c,x+PX*2,y,w-PX*4,PX*3,"#3a2615"); }
  }
  function paper(c,x,y,r){ c.save(); c.translate(x,y); c.rotate(r); R(c,-14,-9,28,18,"#efeee6"); R(c,-14,-9,28,3,"#cfcabb"); R(c,-9,-3,18,3,"#b9b4a6"); R(c,-9,3,12,3,"#b9b4a6"); c.restore(); }
  function crack(c,x,y,len,col){ let cx=x, cy=y; c.beginPath(); c.moveTo(cx,cy);
    for(let i=0;i<len;i++){ cx+=(rnd()-0.5)*30; cy+=10+rnd()*14; c.lineTo(cx,cy); } c.strokeStyle=col||"#4a4034"; c.lineWidth=PX; c.stroke(); }
  function sign(c,x,y,w,h,bg,fg,txt,size){ R(c,x,y,w,h,INK); R(c,x+PX,y+PX,w-PX*2,h-PX*2,bg); P.text(c,txt,x+w/2,y+h/2+size*0.36,size,fg,{align:"center",outline:false}); }

  // 3/4視点のダンボール(前面・上面・側面)。yB=底の高さ
  function box3(c,x,yB,w,h,d,open){
    const dx=d*0.7, dy=d*0.5, top=yB-h;
    const face=(pts,col)=>{ c.beginPath(); c.moveTo(pts[0][0],pts[0][1]); for(const p of pts.slice(1)) c.lineTo(p[0],p[1]); c.closePath(); c.fillStyle=col; c.fill(); c.strokeStyle=INK; c.lineWidth=PX*2; c.stroke(); };
    c.fillStyle="rgba(0,0,0,.35)"; c.fillRect(x+6,yB-4,w+dx,10);                                       // かげ
    face([[x+w,top],[x+w+dx,top-dy],[x+w+dx,yB-dy],[x+w,yB]],"#8a5a2b");                                // 側面
    face([[x,top],[x+w,top],[x+w,yB],[x,yB]],"#b07a3e");                                                // 前面
    R(c,x+PX,top+PX,w*0.3,h-PX*2,"#9c6a34"); R(c,x+w*0.42,top+h*0.35,w*0.3,PX*2,"#7a4f26");            // かげ・ラベル線
    R(c,x+w*0.62,top+h*0.55,w*0.22,h*0.22,"#d9c7a0"); R(c,x+w*0.64,top+h*0.6,w*0.16,PX,"#8a7a60");      // 伝票
    face([[x,top],[x+dx,top-dy],[x+w+dx,top-dy],[x+w,top]], open?"#3a2615":"#c99355");                 // 上面(開いてたら中が暗い)
    if(open){
      face([[x,top],[x+dx,top-dy],[x+dx-w*0.18,top-dy-h*0.42],[x-w*0.2,top-h*0.36]],"#c58b4a");          // 左のふた
      face([[x+w,top],[x+w+dx,top-dy],[x+w+dx+w*0.16,top-dy-h*0.34],[x+w+w*0.18,top-h*0.3]],"#a87538"); // 右のふた
      face([[x+dx,top-dy],[x+w+dx,top-dy],[x+w+dx-w*0.05,top-dy-h*0.3],[x+dx+w*0.05,top-dy-h*0.3]],"#b5803f"); // 奥のふた
    } else { R(c,x+w*0.45,top-dy+PX,PX*3,dy-PX,"#d9b27a"); R(c,x+w*0.45,top,PX*3,h*0.3,"#d9b27a"); }   // ガムテープ
  }
  // 画面のふちを暗く(どのステージも)
  function vignette(c){
    const g=c.createRadialGradient(W/2,H*0.45,H*0.35,W/2,H*0.5,W*0.62);
    g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(10,4,14,.42)"); c.fillStyle=g; c.fillRect(0,0,W,H);
  }

  const STAGES = [
    { id:"haikyo", name:"廃ビル 4F", en:"ABANDONED 4F",
      paint(c){
        seed=11;
        const WALL_B=330;
        // ---- かべ: 上ほど明るく、下ほど汚れて暗い(ドットの帯で段階的に) ----
        const bands=["#c9bda2","#c3b69b","#bcaf93","#b4a78b","#ab9e82","#a29579"];
        for(let i=0;i<bands.length;i++) R(c,0,i*WALL_B/bands.length,W,WALL_B/bands.length+PX,bands[i]);
        for(let i=0;i<900;i++){ const x=rnd()*W, y=rnd()*WALL_B; R(c,x,y,PX,PX, rnd()<0.5?"#9a8d72":"#d2c7ae"); }   // ざらつき
        for(let i=0;i<18;i++){ const x=rnd()*W, y=40+rnd()*200, w=30+rnd()*110, h=20+rnd()*70;               // シミ
          for(let k=0;k<26;k++) R(c, x+rnd()*w, y+rnd()*h, 6+rnd()*18, 6+rnd()*12, rnd()<0.6?"#9c8f74":"#8f8268"); }
        for(let i=0;i<10;i++){ const x=rnd()*W; for(let y=60+rnd()*60;y<WALL_B;y+=PX) if(rnd()<0.8) R(c,x+Math.sin(y*0.05)*3,y,PX,PX*2,"#8a7d63"); } // 雨じみの筋
        // はがれ: コンクリ → レンガ
        for(const [bx,by,bw,bh] of [[24,70,150,96],[660,40,120,70],[840,170,100,100],[470,210,70,60]]){
          c.fillStyle="#8e8b84"; c.beginPath(); c.moveTo(bx,by+bh*0.2); c.lineTo(bx+bw*0.3,by); c.lineTo(bx+bw,by+bh*0.15); c.lineTo(bx+bw*0.9,by+bh); c.lineTo(bx+bw*0.1,by+bh*0.85); c.closePath(); c.fill();
          for(let yy=by+10;yy<by+bh-8;yy+=15) for(let xx=bx+12+((yy/15|0)%2)*14; xx<bx+bw-20; xx+=28){ R(c,xx,yy,24,11,"#93503a"); R(c,xx,yy,24,PX,"#a8624a"); }
          c.strokeStyle="#5e5141"; c.lineWidth=PX; c.stroke(); }
        for(let i=0;i<12;i++) crack(c,rnd()*W,20+rnd()*140,5+rnd()*7,"#4f4436");
        // 天井と配管
        R(c,0,0,W,30,"#5d564a"); R(c,0,30,W,PX*2,INK);
        R(c,0,40,W,16,INK); R(c,0,43,W,10,"#7d8a8c"); R(c,0,44,W,PX,"#a9b6b8");
        for(let x=60;x<W;x+=180){ R(c,x,38,14,20,INK); R(c,x+3,40,8,16,"#5f6b6d"); }
        R(c,598,40,18,WALL_B-40,INK); R(c,601,40,12,WALL_B-40,"#7d8a8c"); R(c,602,40,PX,WALL_B-40,"#a9b6b8");
        R(c,590,200,34,14,INK); R(c,593,203,28,8,"#b8392f");                                  // バルブ
        R(c,540,120,46,62,INK); R(c,543,123,40,56,"#9a9c94"); R(c,547,128,32,6,"#6b6d66"); R(c,551,150,24,22,"#7e8079"); // 配電盤
        // 戸口(中央左): 枠＋半開きの扉＋奥の暗がり
        R(c,262,104,176,WALL_B-104,INK); R(c,270,112,160,WALL_B-112,"#1a1612");
        for(let i=0;i<60;i++) R(c,272+rnd()*150,114+rnd()*200,PX,PX,"#2a241d");
        c.fillStyle="#5b3a26"; c.beginPath(); c.moveTo(270,112); c.lineTo(330,124); c.lineTo(330,WALL_B-6); c.lineTo(270,WALL_B); c.closePath(); c.fill();
        c.strokeStyle=INK; c.lineWidth=PX*2; c.stroke(); R(c,272,114,10,WALL_B-116,"#6e4a33"); R(c,318,214,8,10,"#c9a640");
        R(c,262,104,176,8,"#8a7a62"); R(c,436,104,8,WALL_B-104,"#8a7a62");
        // 貼り紙
        R(c,456,140,58,74,INK); R(c,459,143,52,68,"#e4dcc3"); R(c,463,149,44,10,"#b83a30"); R(c,463,165,30,5,"#8a8270"); R(c,463,175,40,5,"#8a8270"); R(c,463,185,24,5,"#8a8270");
        // 板でふさいだ窓(右)
        R(c,680,96,190,150,INK); R(c,688,104,174,134,"#141826");
        for(let i=0;i<10;i++) R(c,690+((i*53)%170),106+((i*37)%120),PX,PX,"#d8d2a4");
        for(const [y,ang] of [[118,-0.06],[156,0.05],[196,-0.03]]){ c.save(); c.translate(775,y); c.rotate(ang); R(c,-96,-11,192,22,INK); R(c,-93,-8,186,16,"#8c6a44"); R(c,-93,-8,186,PX,"#a8845a"); R(c,-84,-3,6,6,"#cfcfcf"); R(c,78,-3,6,6,"#cfcfcf"); c.restore(); }
        // 幅木
        R(c,0,WALL_B-14,W,14,"#5f564a"); R(c,0,WALL_B-14,W,PX,INK);
        // ---- ゆか: 大きなタイルを遠近で(手前ほど大きい) ----
        const Y0=WALL_B, VX=480, rows=[Y0,350,376,410,456,516,600];
        const xAt=(j,y)=>VX+(j*150)*(0.42+0.58*(y-Y0)/(H-Y0));
        for(let r=0;r<rows.length-1;r++){ const ya=rows[r], yb=Math.min(H,rows[r+1]);
          for(let j=-6;j<6;j++){
            const shadeK=((r+j)&1)?1:0.95, base=r<1?"#7a7a78":(((r+j)&1)?"#9c9c99":"#92928f");
            c.fillStyle=base; c.beginPath(); c.moveTo(xAt(j,ya),ya); c.lineTo(xAt(j+1,ya),ya); c.lineTo(xAt(j+1,yb),yb); c.lineTo(xAt(j,yb),yb); c.closePath(); c.fill();
            if(rnd()<0.18){ c.fillStyle="#6c6c69"; c.fill(); }                                            // 汚れたタイル
            if(rnd()<0.22){ const cx=(xAt(j,ya)+xAt(j+1,yb))/2, cy=(ya+yb)/2; crack(c,cx-20,cy-(yb-ya)*0.4,2,"#4a4a48"); }
            if(rnd()<0.12){ const cx=(xAt(j,ya)+xAt(j+1,ya))/2, cy=ya+3; R(c,cx,cy,24+(yb-ya)*0.3,(yb-ya)*0.3,"#5a5a57"); } // 欠け
            R(c,xAt(j,ya)+4,ya+PX,(xAt(j+1,ya)-xAt(j,ya))*0.6,PX,"#b0b0ad");                                // タイルのふちの光
          }
          L(c,0,ya,W,ya,"#4b4b49",PX);
        }
        for(let j=-6;j<=6;j++) L(c,xAt(j,Y0),Y0,xAt(j,H),H,"#4b4b49",PX);
        for(let i=0;i<500;i++){ const y=Y0+rnd()*(H-Y0); R(c,rnd()*W,y,PX,PX,rnd()<0.5?"#7d7d7a":"#a8a8a4"); }      // ほこり
        // 壁ぎわの暗がり
        for(let k=0;k<4;k++){ c.fillStyle="rgba(30,24,18,"+(0.22-k*0.05)+")"; c.fillRect(0,Y0+k*6,W,6); }
        // ---- ダンボール(3/4視点) ----
        box3(c,30,350,120,86,46,true); box3(c,138,360,78,56,34,false); box3(c,790,346,128,96,50,true); box3(c,560,344,66,44,30,false);
        // 消火器
        R(c,906,240,30,80,INK); R(c,909,246,24,71,"#c8202a"); R(c,913,252,6,34,"#e8545c"); R(c,912,228,18,15,INK); R(c,918,220,24,9,INK); R(c,912,272,18,15,"#efe9d8");
        // 落ちてる紙
        paper(c,250,430,0.3); paper(c,700,490,-0.4); paper(c,520,380,0.1); paper(c,80,505,0.6); paper(c,410,470,-0.2); paper(c,860,452,0.5);
        R(c,330,500,12,4,"#6a5236"); R(c,620,420,8,8,"#5a4a3a"); R(c,180,470,10,6,"#6a6a66");               // ゴミ
      },
      live(c,t,ex){
        const on = !((t%170>150 && t%6<3) || (t%410>395));
        R(c,140,30,250,12,INK); R(c,146,33,238,6,on?"#fdfbe8":"#8c8a7a");
        R(c,600,30,250,12,INK); R(c,606,33,238,6,"#fdfbe8");
        for(let i=0;i<4;i++){ const ph=t*0.006+i*1.7, x=(i*280+t*(0.5+i*0.15))%1100-60, y=170+Math.sin(ph*3)*50+i*36+(ex*20); paper(c,x,y,Math.sin(ph*5)*0.8); }
      },
      soft(c,t){
        const on = !((t%170>150 && t%6<3) || (t%410>395));
        if(on){ c.fillStyle="rgba(253,251,232,.08)"; c.beginPath(); c.moveTo(140,42); c.lineTo(390,42); c.lineTo(470,330); c.lineTo(60,330); c.fill(); }
        c.fillStyle="rgba(253,251,232,.06)"; c.beginPath(); c.moveTo(600,42); c.lineTo(850,42); c.lineTo(930,330); c.lineTo(520,330); c.fill();
      } },
    { id:"shutter", name:"シャッター街", en:"SHUTTER STREET",
      paint(c){
        seed=23;
        R(c,0,0,W,340,"#1a1730");
        // アーケードの屋根
        R(c,0,0,W,30,"#2c2840"); for(let i=0;i<16;i++){ R(c,i*64,0,PX*2,30,"#423c5c"); } R(c,0,30,W,PX*2,INK);
        // 店
        const shops=[[0,"#2e4a5c","質"],[200,"#5c2e2e","居酒屋"],[420,null,"ラーメン"],[640,"#3a5c2e","クリーニング"],[820,"#4a3a5c","理容"]];
        for(const [x,col,txt] of shops){
          const w = x===820?140:(x===640?180:(x===420?220:200));
          R(c,x,60,w,280,"#3b3550"); R(c,x,60,PX*2,280,INK);
          sign(c,x+12,70,w-24,40,col||"#e8d9a8",col?"#f1e6c4":"#5c1e14",txt, txt.length>4?18:24);
          if(!col){ // 開いてる店(あかり)
            R(c,x+12,122,w-24,206,"#f2c66a"); R(c,x+12,122,w-24,60,"#d9534a"); for(let i=0;i<5;i++) R(c,x+18+i*((w-36)/5),122,(w-36)/5-PX*2,60,"#c0392b");
            P.text(c,"ら",x+40,166,24,"#fff",{outline:false}); R(c,x+30,230,60,90,"#7a4b2a"); R(c,x+120,250,70,70,"#7a4b2a");
          } else { // シャッター
            R(c,x+12,122,w-24,206,"#8b8d96"); for(let yy=126;yy<328;yy+=9) R(c,x+12,yy,w-24,PX,"#6c6e78");
            R(c,x+12,318,w-24,10,"#5b5d66");
          }
        }
        // ラクガキ
        P.text(c,"PETA",230,270,30,"#ff5fae",{latin:true,oc:"#1a1206",ow:8});
        P.text(c,"拳",700,250,46,"#5fe0ff",{oc:"#1a1206",ow:8});
        // 自販機
        R(c,560,170,80,160,INK); R(c,566,176,68,148,"#d8dde8"); R(c,572,184,56,64,"#7fd0ff");
        for(let i=0;i<8;i++) R(c,576+(i%4)*13,190+Math.floor(i/4)*28,9,20,["#e8443a","#ffd23e","#4fae8f","#f08c2e"][i%4]);
        R(c,580,264,40,10,INK); R(c,604,290,20,24,"#2a2a33");
        // ゆか(レンガ)
        floor(c,340,"#6e4a44","#4b302c",{rows:7, alt:"#77514a"});
        for(let i=0;i<22;i++) R(c,rnd()*W,360+rnd()*170,30+rnd()*40,PX,"rgba(255,255,255,.12)"); // ぬれた反射
      },
      live(c,t,ex){
        const fl = (t%200>180 && t%4<2);
        R(c,470,40,120,40,INK); R(c,474,44,112,32,fl?"#5a2a4a":"#ff4fa3"); P.text(c,"ペタ",530,70,24,fl?"#3a1a2a":"#fff",{align:"center",outline:false});
        R(c,566,176,68,4,(t%60<30)?"#ffffff":"#bfe8ff");
      },
      soft(c,t){ c.fillStyle="rgba(255,90,170,.08)"; c.beginPath(); c.ellipse(530,90,160,60,0,0,7); c.fill();
        c.fillStyle="rgba(127,208,255,.08)"; c.beginPath(); c.ellipse(600,260,120,110,0,0,7); c.fill(); } },

    { id:"sento", name:"銭湯 ペタの湯", en:"PUBLIC BATH",
      paint(c){
        seed=5;
        R(c,0,0,W,340,"#a9d8e6");
        // 富士山の壁画
        R(c,0,20,W,210,"#7fb8e0"); for(let i=0;i<6;i++) R(c,rnd()*W,30+rnd()*60,90,15,"#eef6fb");
        c.fillStyle="#e8443a"; c.beginPath(); c.arc(760,90,36,0,7); c.fill();
        c.fillStyle="#3e6fa8"; c.beginPath(); c.moveTo(140,230); c.lineTo(450,62); c.lineTo(760,230); c.closePath(); c.fill(); c.strokeStyle=INK; c.lineWidth=PX*2; c.stroke();
        c.fillStyle="#f4f8fb"; c.beginPath(); c.moveTo(390,95); c.lineTo(450,62); c.lineTo(510,95); c.lineTo(480,90); c.lineTo(462,104); c.lineTo(438,90); c.lineTo(414,102); c.closePath(); c.fill();
        R(c,0,230,W,PX*2,INK);
        // タイル
        R(c,0,236,W,104,"#e7f2f4"); for(let y=236;y<340;y+=18) R(c,0,y,W,PX,"#a7c7cd"); for(let x=0;x<W;x+=18) R(c,x,236,PX,104,"#a7c7cd");
        // 湯船のふち
        R(c,0,300,W,40,"#c4875a"); R(c,0,300,W,PX*2,INK); R(c,0,312,W,PX,"#a26a42");
        sign(c,40,250,96,42,"#fff","#c0392b","ゆ",28); sign(c,824,250,96,42,"#2b54c9","#fff","男",26);
        floor(c,340,"#d4e3e6","#9fb8bd",{rows:6, alt:"#c9dbde"});
        for(const x of [120,840]){ c.fillStyle="#ffd23e"; c.beginPath(); c.ellipse(x,G+18,34,15,0,0,7); c.fill(); c.strokeStyle=INK; c.lineWidth=PX*2; c.stroke(); P.text(c,"ケロ",x,G+24,14,"#c0392b",{align:"center",outline:false}); }
      },
      live(c,t,ex){ for(let i=0;i<3;i++){ const x=(i*330+t*0.4)%1100-60; R(c,x,296,60,PX,"#e9a777"); } },
      soft(c,t){ for(let i=0;i<6;i++){ const x=(i*170+t*0.6)%1000-20, y=220+Math.sin(t*0.02+i)*30;
        c.fillStyle="rgba(255,255,255,.22)"; c.beginPath(); c.arc(x,y,40+i%3*12,0,7); c.fill(); } } },
  ];

  const cache={};
  function get(id){ return STAGES.find(s=>s.id===id) || STAGES[0]; }
  // layer: KK.pixel.Layer(960,540,3)。止まった絵はキャッシュから、動く物だけ描く
  function draw(layer,id,t,excite){
    const s=get(id);
    if(!cache[id]){ const L2=new P.Layer(W,H,PX); s.paint(L2.begin()); cache[id]=L2.cv; }
    const c=layer.begin();
    c.save(); c.setTransform(1,0,0,1,0,0); c.drawImage(cache[id],0,0); c.restore();
    s.live(c,t,excite||0);
    if(s.soft) s.soft(c,t);
    vignette(c);
    return c;
  }
  return { STAGES, get, draw, random(){ return STAGES[Math.floor(Math.random()*STAGES.length)].id; } };
})();
