import test from "node:test";
import assert from "node:assert/strict";
import worker from process.env.WORKER_MODULE;

class MemoryKV {
  data = new Map();
  async get(k, type) { const v=this.data.get(k); return v===undefined?null:(type==="json"?JSON.parse(v):v); }
  async put(k,v) { this.data.set(k,String(v)); }
  async delete(k) { this.data.delete(k); }
}
const origin="https://lashbury.co.uk";
const env=()=>({TOURNAMENT:new MemoryKV(),CORS_ORIGIN:origin});
function req(path,{method="GET",body,token,originHeader=origin,ip="203.0.113.1"}={}) {
  const headers=new Headers();
  if(originHeader!==null) headers.set("Origin",originHeader);
  if(ip) headers.set("CF-Connecting-IP",ip);
  if(body!==undefined) headers.set("Content-Type","application/json");
  if(token) headers.set("Cookie","lc_session="+token);
  return new Request("https://api.lashbury.co.uk"+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function seed(e,token,role) { await e.TOURNAMENT.put("session:"+token,JSON.stringify({role,created:Date.now()})); }
async function hash(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,"0")).join(""); }

test("health and preflight expose expected CORS headers",async()=>{
 const e=env(), h=await worker.fetch(req("/health"),e);
 assert.equal(h.status,200); assert.equal((await h.json()).ok,true);
 assert.equal(h.headers.get("access-control-allow-origin"),origin);
 const p=await worker.fetch(req("/api/data",{method:"OPTIONS"}),e);
 assert.equal(p.status,204); assert.equal(p.headers.get("access-control-allow-credentials"),"true");
});
test("mutations reject absent or untrusted Origin",async()=>{
 const e=env();
 for(const originHeader of [null,"https://evil.example"]) {
  const r=await worker.fetch(req("/auth/login",{method:"POST",body:{pin:"test"},originHeader}),e);
  assert.equal(r.status,403);
 }
});
test("guest reads redacted data but cannot write or change PINs",async()=>{
 const e=env(); await e.TOURNAMENT.put("tournament:data",JSON.stringify({teams:[],events:[],gp:"secret",ownerHash:"secret"})); await seed(e,"g","guest");
 const r=await worker.fetch(req("/api/data",{token:"g"}),e); assert.equal(r.status,200);
 const d=await r.json(); assert.equal(d.gp,undefined); assert.equal(d.ownerHash,undefined);
 assert.equal((await worker.fetch(req("/api/data",{method:"PUT",token:"g",body:{teams:[],events:[]}}),e)).status,401);
 assert.equal((await worker.fetch(req("/api/pins",{method:"PUT",token:"g",body:{guest:"new-pin"}}),e)).status,401);
});
test("admin can save data but cannot change PINs",async()=>{
 const e=env(); await seed(e,"a","admin");
 const r=await worker.fetch(req("/api/data",{method:"PUT",token:"a",body:{teams:[{name:"Test"}],events:[]}}),e);
 assert.equal(r.status,200); assert.equal(JSON.parse(e.TOURNAMENT.data.get("tournament:data")).teams[0].name,"Test");
 assert.equal((await worker.fetch(req("/api/pins",{method:"PUT",token:"a",body:{guest:"new-pin"}}),e)).status,401);
});
test("owner can save and set PINs; short PIN rejected",async()=>{
 const e=env(); await seed(e,"o","owner");
 assert.equal((await worker.fetch(req("/api/pins",{method:"PUT",token:"o",body:{guest:"guest-pin",admin:"admin-pin",owner:"owner-pin"}}),e)).status,200);
 assert.notEqual(e.TOURNAMENT.data.get("pin:guest"),"guest-pin");
 assert.equal((await worker.fetch(req("/api/pins",{method:"PUT",token:"o",body:{guest:"x"}}),e)).status,400);
 assert.equal((await worker.fetch(req("/api/data",{method:"PUT",token:"o",body:{teams:[],events:[]}}),e)).status,200);
});
test("login assigns all configured roles and sets secure HttpOnly cookie",async()=>{
 const e=env();
 for(const [role,pin,prefix,ip] of [["guest","guest-pin","guest:", "198.51.100.1"],["admin","admin-pin","lc27:","198.51.100.2"],["owner","owner-pin","lc27:","198.51.100.3"]]) {
  await e.TOURNAMENT.put("pin:"+role,await hash(prefix+pin));
  const r=await worker.fetch(req("/auth/login",{method:"POST",body:{pin},ip}),e);
  assert.equal(r.status,200); assert.equal((await r.json()).role,role);
  assert.match(r.headers.get("set-cookie"),/HttpOnly/); assert.match(r.headers.get("set-cookie"),/SameSite=Lax/);
  assert.equal(r.headers.get("access-control-allow-origin"),origin);
 }
});
test("five failed logins trigger a 15-minute throttle",async()=>{
 const e=env();
 for(let i=0;i<5;i++) assert.equal((await worker.fetch(req("/auth/login",{method:"POST",body:{pin:"wrong"},ip:"192.0.2.55"}),e)).status,401);
 const r=await worker.fetch(req("/auth/login",{method:"POST",body:{pin:"wrong"},ip:"192.0.2.55"}),e);
 assert.equal(r.status,429); assert.equal(r.headers.get("retry-after"),"900");
});
test("logout deletes session and expires cookie",async()=>{
 const e=env(); await seed(e,"bye","admin");
 const r=await worker.fetch(req("/auth/logout",{method:"POST",token:"bye"}),e);
 assert.equal(r.status,200); assert.equal(e.TOURNAMENT.data.has("session:bye"),false);
 assert.match(r.headers.get("set-cookie"),/Max-Age=0/);
});
