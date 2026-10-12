/* =====================================================================
   ペタ拳: 画像処理(KK.cutout)。外部AI・有料APIは使わない。全部ブラウザ内。
   - 背景のけし方は3つ: おまかせ(ふちの色から背景を推定して塗りつぶし) / まる / そのまま
   - 失敗しても「ブラシでけす・もどす」で人が仕上げられる(おまかせは たたき台)
   - 画像しんだん: 色や形から勝手に強さを決める(シュール要素)
   - ステッカー化: 白フチ＋黒フチを付けて「貼った感」を出す
   将来 AI切り抜き等に替えるときは autoMask を差し替えるだけでよい。
   ===================================================================== */
window.KK = window.KK || {};
KK.cutout = (function(){
  "use strict";

  function loadImage(src){
    return new Promise((res,rej)=>{ const im=new Image();
      im.onload=()=>res(im); im.onerror=()=>rej(new Error("画像を よめませんでした")); im.src=src; });
  }
  function fileToDataURL(file){
    return new Promise((res,rej)=>{ const fr=new FileReader();
      fr.onload=()=>res(fr.result); fr.onerror=()=>rej(fr.error); fr.readAsDataURL(file); });
  }
  function mkCanvas(w,h){ const c=document.createElement("canvas"); c.width=Math.max(1,w|0); c.height=Math.max(1,h|0); return c; }

  // 元画像を扱いやすい大きさにそろえる。p = {canvas,w,h,data,hasAlpha,anyAlpha}
  function prepare(img, maxDim){
    maxDim=maxDim||640;
    const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
    const s=Math.min(1, maxDim/Math.max(iw,ih));
    const w=Math.max(1,Math.round(iw*s)), h=Math.max(1,Math.round(ih*s));
    const cv=mkCanvas(w,h), c=cv.getContext("2d",{willReadFrequently:true});
    c.drawImage(img,0,0,w,h);
    const d=c.getImageData(0,0,w,h).data;
    let tr=0,tot=0,any=false;
    const chk=(x,y)=>{ tot++; if(d[(y*w+x)*4+3]<200) tr++; };
    for(let x=0;x<w;x++){ chk(x,0); chk(x,h-1); }
    for(let y=0;y<h;y++){ chk(0,y); chk(w-1,y); }
    for(let i=3;i<d.length;i+=16){ if(d[i]<250){ any=true; break; } }
    return { canvas:cv, w, h, data:d, hasAlpha: tr/tot>0.3, anyAlpha:any };
  }
  // 保存用の元画像(縮小済み)。透過があればPNG、なければJPEGで軽く。
  function originalDataURL(p){ return p.anyAlpha ? p.canvas.toDataURL("image/png") : p.canvas.toDataURL("image/jpeg",0.9); }

  // ---------------- 背景けし ----------------
  // おまかせ: 透過PNGならその透明を使う。そうでなければ
  // ふち一周の「よく出る色」を背景色とみなし、ふちから つながっている似た色を塗りつぶして消す。
  function autoMask(p, tol){
    const w=p.w, h=p.h, d=p.data, n=w*h, m=new Uint8ClampedArray(n);
    if(p.hasAlpha){ for(let i=0;i<n;i++) m[i]=d[i*4+3]; return m; }
    tol = tol==null ? 40 : tol;

    // 1) 背景色の推定(ふちの色を量子化して多い順に、7割をカバーするまで最大6色)
    const buckets=new Map(); let total=0;
    const addB=(i)=>{ const r=d[i*4],g=d[i*4+1],b=d[i*4+2];
      const k=((r>>4)<<8)|((g>>4)<<4)|(b>>4); let e=buckets.get(k);
      if(!e){ e=[0,0,0,0]; buckets.set(k,e); } e[0]++; e[1]+=r; e[2]+=g; e[3]+=b; total++; };
    for(let x=0;x<w;x++){ addB(x); addB((h-1)*w+x); }
    for(let y=1;y<h-1;y++){ addB(y*w); addB(y*w+w-1); }
    const arr=[...buckets.values()].sort((a,b)=>b[0]-a[0]);
    const bg=[]; let cum=0;
    for(const e of arr){ bg.push([e[1]/e[0],e[2]/e[0],e[3]/e[0]]); cum+=e[0]; if(cum>=total*0.7||bg.length>=6) break; }

    // 色の距離(緑に敏感な人の目に少し寄せた重み)
    const t2=tol*tol;
    const bgDist=(i)=>{ const r=d[i*4],g=d[i*4+1],b=d[i*4+2]; let best=1e9;
      for(let k=0;k<bg.length;k++){ const c=bg[k], dr=r-c[0], dg=g-c[1], db=b-c[2];
        const v=(2*dr*dr+4*dg*dg+3*db*db)/9; if(v<best) best=v; } return best; };
    const near=(i,j)=>{ const dr=d[i*4]-d[j*4], dg=d[i*4+1]-d[j*4+1], db=d[i*4+2]-d[j*4+2]; return (2*dr*dr+4*dg*dg+3*db*db)/9; };

    // 2) ふちから塗りつぶし。背景色に近い所(=1)を背景とみなす。
    //    少し遠くても「本物の背景のすぐ隣で滑らかにつながる」所(=2)だけは背景のふちとして足す。
    //    =2 からはさらに滑らかつながりで広げない(肌などの似た色の面に流れ込むのを防ぐ)
    const vis=new Uint8Array(n), q=new Int32Array(n); let qh=0, qt=0;
    const tryPush=(i,from)=>{ if(vis[i]) return; const bd=bgDist(i);
      if(bd<t2){ vis[i]=1; q[qt++]=i; }
      else if(from>=0 && vis[from]===1 && bd<t2*2.5 && near(i,from)<64){ vis[i]=2; q[qt++]=i; } };
    for(let x=0;x<w;x++){ tryPush(x,-1); tryPush((h-1)*w+x,-1); }
    for(let y=1;y<h-1;y++){ tryPush(y*w,-1); tryPush(y*w+w-1,-1); }
    while(qh<qt){ const i=q[qh++], x=i%w;
      if(x>0) tryPush(i-1,i); if(x<w-1) tryPush(i+1,i);
      if(i>=w) tryPush(i-w,i); if(i<n-w) tryPush(i+w,i); }
    for(let i=0;i<n;i++) m[i]=vis[i]?0:255;

    // 3) ゴミ掃除: 本体(一番大きい塊)に比べて小さすぎる塊は消す
    keepBigIslands(m,w,h);
    // 4) ふちを少しなめらかに
    return blur3(m,w,h);
  }
  function keepBigIslands(m,w,h){
    const n=w*h, lab=new Int32Array(n), q=new Int32Array(n), sizes=[0]; let id=0;
    for(let s=0;s<n;s++){ if(m[s]<128||lab[s]) continue; id++; let qh=0,qt=0,cnt=0; q[qt++]=s; lab[s]=id;
      while(qh<qt){ const i=q[qh++], x=i%w; cnt++;
        const nb=[x>0?i-1:-1, x<w-1?i+1:-1, i>=w?i-w:-1, i<n-w?i+w:-1];
        for(const j of nb){ if(j>=0 && !lab[j] && m[j]>=128){ lab[j]=id; q[qt++]=j; } } }
      sizes.push(cnt); }
    if(id<=1) return;
    const big=Math.max(...sizes), keep=Math.max(30,big*0.04);
    for(let i=0;i<n;i++) if(lab[i] && sizes[lab[i]]<keep) m[i]=0;
  }
  function blur3(m,w,h){
    const o=new Uint8ClampedArray(m.length);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ let s=0,c=0;
      for(let dy=-1;dy<=1;dy++){ const yy=y+dy; if(yy<0||yy>=h) continue;
        for(let dx=-1;dx<=1;dx++){ const xx=x+dx; if(xx<0||xx>=w) continue; s+=m[yy*w+xx]; c++; } }
      o[y*w+x]=s/c; }
    return o;
  }
  // まる: 顔写真むけ。まんなかを だ円で切る
  function circleMask(p){
    const w=p.w,h=p.h,m=new Uint8ClampedArray(w*h), rx=w*0.47, ry=h*0.47, cx=w/2, cy=h/2;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const e=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2); // 1がふち
      m[y*w+x]=Math.max(0,Math.min(255,(1-e)*rx*0.5*255)); }
    return m;
  }
  function fullMask(p){ return new Uint8ClampedArray(p.w*p.h).fill(255); }
  // ブラシ(val=0でけす / 255でもどす)。ふちは少しやわらかく
  function brush(m,w,h,cx,cy,r,val){
    const x0=Math.max(0,Math.floor(cx-r)), x1=Math.min(w-1,Math.ceil(cx+r));
    const y0=Math.max(0,Math.floor(cy-r)), y1=Math.min(h-1,Math.ceil(cy+r));
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
      const dd=Math.hypot(x-cx,y-cy); if(dd>r) continue;
      const k=Math.min(1,(r-dd)/2); const i=y*w+x;
      m[i] = m[i] + (val-m[i])*k; }
  }

  // 元画像×マスク → 切り抜いて余白をつめ、ゲーム用サイズに
  function compose(p, m, maxOut){
    maxOut=maxOut||420;
    const w=p.w,h=p.h, tmp=mkCanvas(w,h), c=tmp.getContext("2d");
    const id=c.createImageData(w,h), o=id.data, d=p.data;
    let x0=w,y0=h,x1=-1,y1=-1;
    for(let i=0,n=w*h;i<n;i++){ const a=d[i*4+3]*m[i]/255;
      o[i*4]=d[i*4]; o[i*4+1]=d[i*4+1]; o[i*4+2]=d[i*4+2]; o[i*4+3]=a;
      if(a>20){ const x=i%w, y=(i/w)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
    if(x1<0) return null; // 全部けしちゃった
    c.putImageData(id,0,0);
    const bw=x1-x0+1, bh=y1-y0+1, s=Math.min(2, maxOut/Math.max(bw,bh));
    const out=mkCanvas(Math.round(bw*s), Math.round(bh*s));
    const oc=out.getContext("2d"); oc.imageSmoothingQuality="high";
    oc.drawImage(tmp,x0,y0,bw,bh,0,0,out.width,out.height);
    return out;
  }
  function opaqueRatio(m){ let s=0; for(let i=0;i<m.length;i++) if(m[i]>128) s++; return s/m.length; }

  // マスクの保存/復元(アルファだけのPNG)
  function maskToDataURL(m,w,h){
    const cv=mkCanvas(w,h), c=cv.getContext("2d"), id=c.createImageData(w,h);
    for(let i=0;i<m.length;i++){ id.data[i*4]=255; id.data[i*4+1]=255; id.data[i*4+2]=255; id.data[i*4+3]=m[i]; }
    c.putImageData(id,0,0); return cv.toDataURL("image/png");
  }
  async function dataURLToMask(url,w,h){
    const im=await loadImage(url), cv=mkCanvas(w,h), c=cv.getContext("2d",{willReadFrequently:true});
    c.drawImage(im,0,0,w,h); const d=c.getImageData(0,0,w,h).data, m=new Uint8ClampedArray(w*h);
    for(let i=0;i<m.length;i++) m[i]=d[i*4+3]; return m;
  }

  // ---------------- 画像しんだん ----------------
  // 色がこい・赤い・ゴチャゴチャ → パワー / 明るい・細長い・すき間 → スピード / どっしり・暗い → かたい
  // 合計9ポイント(1〜5)に配分＝どんな画像でも総合力は同じ。だからバランスは崩れない。
  function analyze(src){
    const sw=src.width, sh=src.height, k=Math.min(1,160/Math.max(sw,sh));
    const w=Math.max(1,Math.round(sw*k)), h=Math.max(1,Math.round(sh*k));
    const cv=mkCanvas(w,h), c=cv.getContext("2d",{willReadFrequently:true}); c.drawImage(src,0,0,w,h);
    const d=c.getImageData(0,0,w,h).data;
    let n=0,sat=0,bri=0,red=0,edge=0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(y*w+x)*4; if(d[i+3]<128) continue;
      const r=d[i],g=d[i+1],b=d[i+2], mx=Math.max(r,g,b), mn=Math.min(r,g,b);
      n++; sat+= mx? (mx-mn)/mx : 0; bri+=(r+g+b)/765; red+=Math.max(0,r-(g+b)/2)/255;
      if(x<w-1 && d[i+7]>=128){ edge+=Math.abs((r+g+b)-(d[i+4]+d[i+5]+d[i+6]))/765; } }
    if(!n) return { hp:3, atk:3, def:3, spd:3, reason:"よく わからない → バランス型" };
    sat/=n; bri/=n; red/=n; edge/=n;
    const cover=n/(w*h), aspect=h/w, cl=(v)=>Math.max(0,Math.min(1,v));
    const raw=[
      cover*1.6 + cl(aspect-0.8)*0.4,                            // 体力: 画像がみっちり
      sat*1.1 + red*2.2 + edge*3.0,                              // 攻撃力: 色がこい・赤い・ゴチャゴチャ
      (1-bri)*1.2 + cl(1.1-aspect)*0.8,                          // 防御力: 暗い・どっしり横長
      bri*1.2 + cl(aspect-1.1)*1.0 + cl(1-cover)*0.9,            // 移動速度: 明るい・細長い・すき間
    ];
    const pts=allocate(raw,12,4), top=pts.indexOf(Math.max(...pts));
    const reasons=[
      "みっちり つまってる → タフ型",
      red>0.12 ? "赤みが つよい → パワー型" : (edge>0.12 ? "ゴチャゴチャしてる → パワー型" : "色が こい → パワー型"),
      cover>0.7 ? "ずっしり四角い → かたい型" : "暗くて どっしり → かたい型",
      aspect>1.3 ? "ほそながい → スピード型" : "あかるい → スピード型",
    ];
    const flat = Math.max(...pts)-Math.min(...pts)<=1;
    return { hp:pts[0], atk:pts[1], def:pts[2], spd:pts[3], reason: flat ? "かたよりが ない → バランス型" : reasons[top] };
  }
  // 合計 budget を、各1〜5の範囲で raw の比に応じて配る
  function allocate(raw,budget,n){
    const wts=raw.map(r=>Math.pow(Math.max(0.05,r),3)), sum=wts.reduce((a,b)=>a+b,0);
    const pts=raw.map(()=>1); let left=budget-n;
    const share=wts.map(v=>left*v/sum), fl=share.map(v=>Math.min(4,Math.floor(v)));
    for(let i=0;i<n;i++){ pts[i]+=fl[i]; left-=fl[i]; }
    const order=raw.map((_,i)=>i).sort((a,b)=>(share[b]-fl[b])-(share[a]-fl[a]));
    while(left>0){ let moved=false; for(const i of order){ if(left>0 && pts[i]<5){ pts[i]++; left--; moved=true; } } if(!moved) break; }
    return pts;
  }

  // ---------------- ステッカー化 ----------------
  function silhouette(src,color){
    const cv=mkCanvas(src.width,src.height), c=cv.getContext("2d");
    c.drawImage(src,0,0); c.globalCompositeOperation="source-in"; c.fillStyle=color; c.fillRect(0,0,cv.width,cv.height);
    return cv;
  }
  // src(Image/Canvas) → {sticker, flash}。白フチ＋黒フチ。flash は被弾時の白光り用
  // white=false なら黒フチだけ(ドットの世界になじむ)
  function makeSticker(src, border, white){
    const b=border||7, pad=b+4, sw=src.naturalWidth||src.width, sh=src.naturalHeight||src.height;
    const base=mkCanvas(sw,sh); base.getContext("2d").drawImage(src,0,0,sw,sh);
    const out=mkCanvas(sw+pad*2, sh+pad*2), c=out.getContext("2d");
    const blk=silhouette(base,"#120a10");
    if(white===false){
      for(let a=0;a<16;a++){ const t=a/16*Math.PI*2; c.drawImage(blk, pad+Math.cos(t)*b, pad+Math.sin(t)*b); }
    } else {
      const wht=silhouette(base,"#ffffff");
      for(let a=0;a<24;a++){ const t=a/24*Math.PI*2; c.drawImage(blk, pad+Math.cos(t)*(b+2.5), pad+Math.sin(t)*(b+2.5)); }
      for(let a=0;a<24;a++){ const t=a/24*Math.PI*2; c.drawImage(wht, pad+Math.cos(t)*b, pad+Math.sin(t)*b); }
    }
    c.drawImage(base,pad,pad);
    return { sticker:out, flash:silhouette(out,"#ffffff") };
  }
  // ちいさい版(飛び道具・サムネ用)
  function scaled(src, maxDim){
    const s=maxDim/Math.max(src.width,src.height), cv=mkCanvas(src.width*s, src.height*s);
    const c=cv.getContext("2d"); c.imageSmoothingQuality="high"; c.drawImage(src,0,0,cv.width,cv.height); return cv;
  }

  return { loadImage, fileToDataURL, prepare, originalDataURL, autoMask, circleMask, fullMask, brush,
    compose, opaqueRatio, maskToDataURL, dataURLToMask, analyze, makeSticker, silhouette, scaled, mkCanvas };
})();
