/* =====================================================================
   ペタ拳: ドット絵の土台(KK.pixel)。
   世界(背景・体・エフェクト・HUD)は「低解像度のキャンバス」に描いて、拡大して貼る＝本物のドット。
   ふつうに描くと線のふちがボケる(アンチエイリアス)ので、crisp() でアルファを0/255に切って
   カクカクにする。ユーザーの写真だけは高解像度のまま上に重ねる(個性を残すため)。
   ===================================================================== */
window.KK = window.KK || {};
KK.pixel = (function(){
  "use strict";
  const FONT = "'DotGothic16','Press Start 2P','MS Gothic','Osaka-Mono',monospace";
  const LATIN = "'Press Start 2P','DotGothic16',monospace";
  const INK = "#120a10";

  class Layer{
    // w,h = 論理サイズ(例 960x540)、px = 1ドットの大きさ(論理単位)
    constructor(w,h,px){
      this.w=w; this.h=h; this.px=px;
      this.cv=document.createElement("canvas");
      this.cv.width=Math.ceil(w/px); this.cv.height=Math.ceil(h/px);
      this.c=this.cv.getContext("2d",{willReadFrequently:true});
    }
    begin(){ const c=this.c; c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,this.cv.width,this.cv.height);
      c.setTransform(1/this.px,0,0,1/this.px,0,0); c.globalAlpha=1; return c; }
    // 論理座標の矩形内だけ、半透明のふちを 0 か 255 に切る(安く済むよう範囲指定)
    crisp(x,y,w,h){
      if(Layer.fast) return;
      const p=this.px, W=this.cv.width, H=this.cv.height;
      let x0=Math.max(0,Math.floor((x==null?0:x)/p)), y0=Math.max(0,Math.floor((y==null?0:y)/p));
      let x1=Math.min(W,Math.ceil(((x==null?this.w:x+w))/p)), y1=Math.min(H,Math.ceil(((y==null?this.h:y+h))/p));
      if(x1<=x0||y1<=y0) return;
      const id=this.c.getImageData(x0,y0,x1-x0,y1-y0), d=id.data;
      for(let i=3;i<d.length;i+=4){ const a=d[i]; if(a===0||a===255) continue; d[i]= a<110 ? 0 : 255; }
      this.c.putImageData(id,x0,y0);
    }
    blit(ctx){ const s=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false;
      ctx.drawImage(this.cv,0,0,this.w,this.h); ctx.imageSmoothingEnabled=s; }
  }

  // 縁取りつきのドット文字(crisp と組み合わせてカクカクに)
  function text(c,str,x,y,size,col,o){
    o=o||{}; c.save();
    c.font=(o.weight||"400")+" "+size+"px "+(o.latin?LATIN:FONT);
    c.textAlign=o.align||"left"; c.textBaseline=o.base||"alphabetic";
    if(o.outline!==false){ c.lineJoin="miter"; c.miterLimit=2; c.lineWidth=o.ow||Math.max(4,size*0.28); c.strokeStyle=o.oc||INK; c.strokeText(str,x,y); }
    if(o.shadow){ c.fillStyle=o.shadow; c.fillText(str,x+(o.sd||4),y+(o.sd||4)); }
    c.fillStyle=col; c.fillText(str,x,y); c.restore();
  }
  function measure(c,str,size,latin){ c.save(); c.font="400 "+size+"px "+(latin?LATIN:FONT); const w=c.measureText(str).width; c.restore(); return w; }

  // 色をこく/うすくする
  function shade(hex,k){
    let r,g,b;
    if(hex[0]==="#"){ const n=parseInt(hex.slice(1),16); r=n>>16; g=(n>>8)&255; b=n&255; }
    else { const m=hex.match(/\d+/g)||[128,128,128]; r=+m[0]; g=+m[1]; b=+m[2]; }
    if(k<1){ r*=k; g*=k; b*=k; } else { r+=(255-r)*(k-1); g+=(255-g)*(k-1); b+=(255-b)*(k-1); }
    return "rgb("+(r|0)+","+(g|0)+","+(b|0)+")";
  }
  // ドットの だ円(行ごとの矩形で描くのでボケない。半透明OK)
  function ellipseRows(c,cx,cy,rx,ry,col,px){
    px=px||3; c.fillStyle=col;
    for(let y=-ry; y<=ry; y+=px){ const k=1-(y*y)/(ry*ry); if(k<=0) continue; const hw=Math.round(rx*Math.sqrt(k)/px)*px;
      c.fillRect(Math.round((cx-hw)/px)*px, Math.round((cy+y)/px)*px, hw*2, px); }
  }
  // 太い手足(黒フチ→色)
  function limb(c,pts,w,col,oc){
    c.lineCap="round"; c.lineJoin="round";
    c.beginPath(); c.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) c.lineTo(pts[i][0],pts[i][1]);
    c.strokeStyle=oc||INK; c.lineWidth=w+7; c.stroke();
    c.strokeStyle=col; c.lineWidth=w; c.stroke();
  }
  // a→b を曲げる関節(ひざ・ひじ)。bend>0 で進行方向の左に曲がる
  function joint(a,b,bend){
    const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2, dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1;
    return [mx - dy/L*bend, my + dx/L*bend];
  }
  function star(c,x,y,r,col,n){
    n=n||5; c.beginPath();
    for(let i=0;i<n*2;i++){ const rr=i%2?r*0.45:r, a=i/(n*2)*Math.PI*2-Math.PI/2; c.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr); }
    c.closePath(); c.fillStyle=col; c.fill(); c.strokeStyle=INK; c.lineWidth=5; c.stroke();
  }
  // フォントを先に読んでおく(読めなくても代わりのフォントで動く)
  function preload(){ try{ if(document.fonts) return Promise.all([document.fonts.load("16px 'DotGothic16'"), document.fonts.load("16px 'Press Start 2P'")]).catch(()=>{}); }catch(e){} return Promise.resolve(); }

  return { Layer, text, measure, shade, ellipseRows, limb, joint, star, preload, FONT, LATIN, INK };
})();
