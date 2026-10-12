// ペタ拳 テスト(Node 版)。使い方: node kakutou/tests/run.js
// ブラウザ用の本物のモジュールを、最小限の window/document のふりをした箱の中で読み込んで動かす。
"use strict";
const vm=require("vm"), fs=require("fs"), path=require("path");
const dir=path.join(__dirname,"..");
const noop=()=>{};
const ctx={ console, Math, Date, JSON, setTimeout, clearTimeout, performance:{ now:()=>Date.now() },
  addEventListener:noop, removeEventListener:noop, requestAnimationFrame:noop, cancelAnimationFrame:noop,
  navigator:{}, document:{ createElement:()=>({ getContext:()=>null }), fonts:null } };
ctx.window=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
for(const f of ["pixel.js","voice.js","cutout.js","chars.js","fighter.js","input.js","ai.js","battle.js","tests/specs.js"]){
  vm.runInContext(fs.readFileSync(path.join(dir,f),"utf8"), ctx, { filename:f });
}
const r=ctx.KK_TESTS.run(res=>{
  console.log((res.ok?"  ok  ":"  NG  ")+res.name+(res.ok?"":"\n        → "+res.err)+"  ("+res.ms+"ms)");
});
console.log("\n"+r.pass+" / "+r.total+" passed"+(r.fail?"  ("+r.fail+" failed)":""));
process.exit(r.fail?1:0);
