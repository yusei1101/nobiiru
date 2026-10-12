/* =====================================================================
   ペタ拳: 保存係(KK.store)。
   キャラ画像は大きいので localStorage(5MB) でなく IndexedDB に入れる。
   IndexedDB が使えない環境(一部のプライベートモード等)では localStorage に逃がす。
   ほかのモジュールはこの get/put/remove/all だけを使う＝保存先を差し替えやすい。
   ===================================================================== */
window.KK = window.KK || {};
KK.store = (function(){
  "use strict";
  const DB="petaken", VER=1, OS="chars", LS_KEY="petaken_chars_fallback";
  let dbp=null, useLS=false;

  function open(){
    if(dbp) return dbp;
    dbp = new Promise((res,rej)=>{
      if(!window.indexedDB){ rej(new Error("no indexedDB")); return; }
      let r; try{ r=indexedDB.open(DB,VER); }catch(e){ rej(e); return; }
      r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains(OS)) db.createObjectStore(OS,{keyPath:"id"}); };
      r.onsuccess=()=>res(r.result);
      r.onerror=()=>rej(r.error);
    }).catch(e=>{ console.warn("IndexedDB不可→localStorageへ", e); useLS=true; return null; });
    // ブラウザに「消さないで」と頼む(対応ブラウザのみ・失敗しても困らない)
    try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}
    return dbp;
  }

  // ---- localStorage 逃げ道 ----
  function lsAll(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch(e){ return []; } }
  function lsSave(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); }

  function req(mode, fn){
    return open().then(db=>{
      if(!db) return null;
      return new Promise((res,rej)=>{
        const t=db.transaction(OS,mode), s=t.objectStore(OS), r=fn(s);
        t.oncomplete=()=>res(r ? r.result : undefined);
        t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error);
      });
    });
  }

  async function all(){
    await open();
    const list = useLS ? lsAll() : (await req("readonly", s=>s.getAll())) || [];
    return list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  }
  async function put(ch){
    await open();
    ch.updatedAt=Date.now(); if(!ch.createdAt) ch.createdAt=ch.updatedAt;
    if(useLS){ const l=lsAll().filter(c=>c.id!==ch.id); l.push(ch); lsSave(l); return ch; }
    await req("readwrite", s=>s.put(ch)); return ch;
  }
  async function remove(id){
    await open();
    if(useLS){ lsSave(lsAll().filter(c=>c.id!==id)); return; }
    await req("readwrite", s=>s.delete(id));
  }
  function newId(){ return "c"+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

  // ---- ちょっとした設定(難易度・音など)は localStorage。消えても困らない物だけ ----
  const PREF_KEY="petaken_prefs";
  function prefs(){ try{ return JSON.parse(localStorage.getItem(PREF_KEY)||"{}"); }catch(e){ return {}; } }
  function setPref(k,v){ try{ const p=prefs(); p[k]=v; localStorage.setItem(PREF_KEY,JSON.stringify(p)); }catch(e){} }

  return { all, put, remove, newId, prefs, setPref };
})();
