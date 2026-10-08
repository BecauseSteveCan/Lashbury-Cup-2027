const C="lc27-v22";
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(["./","./index.html","./manifest.json","./icons/lashbury-cup-icon.png","./icons/icon-192.png","./icons/icon-512.png"])).catch(()=>{}))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET"||u.origin!==location.origin)return;
  e.respondWith((async()=>{
    const c=await caches.open(C);
    if(u.pathname.endsWith("/data.json")){
      return (await fetch(r,{cache:"no-store"}).catch(()=>null)) || (await c.match(r,{ignoreSearch:true})) || Response.error();
    }
    if(r.mode==="navigate"||u.pathname.endsWith("/index.html")){
      const net=await fetch(r,{cache:"no-store"}).then(res=>{if(res.ok)c.put("./index.html",res.clone());return res}).catch(()=>null);
      return net||(await c.match("./index.html"))||Response.error();
    }
    const hit=await c.match(r,{ignoreSearch:true});
    const net=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}).catch(()=>null);
    return hit||(await net)||Response.error();
  })());
});