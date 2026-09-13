import assert from 'node:assert/strict';
const base=process.env.SALON_TEST_URL||'http://localhost:5173';
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=auth.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie,'local sign-in cookie');
async function call(path,body,authenticated=true){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(authenticated?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
assert.equal((await call('/api/action',{action:'new'},false)).status,401);
const session=(await call('/api/action',{action:'new'})).data.id;assert.ok(session);
assert.equal((await call('/api/action',{action:'question',session,body:'短',target:'host'})).status,400);
assert.equal((await call('/api/action',{action:'question',session:'missing',body:'是否应区分股权和债务融资？',target:'host'})).status,400);
const q=(await call('/api/action',{action:'question',session,body:'验收测试：是否应区分股权和债务融资？',target:'bernanke'})).data.id;
assert.ok(q);
await Promise.all([call('/api/action',{action:'like',session,question:q}),call('/api/action',{action:'like',session,question:q})]);
const votes=await Promise.all(Array.from({length:7},()=>call('/api/action',{action:'vote',topic:'ai-growth'})));
assert.ok(votes.some(v=>v.status===400));
let state=(await call('/api/state?session='+session)).data;
assert.equal(state.remaining,0);assert.equal(state.questions[0].votes,1);
const first=fetch(base+'/api/discuss',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({session})});
await new Promise(r=>setTimeout(r,100));
const duplicate=await fetch(base+'/api/discuss',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({session})});
assert.equal(duplicate.status,409);
const firstBody=await (await first).text();assert.match(firstBody,/event: done/);assert.match(firstBody,/event: delta/);
for(let i=0;i<2;i++){const r=await fetch(base+'/api/discuss',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({session})});const text=await r.text();assert.match(text,/event: done/);assert.doesNotMatch(text,/event: error/);}
state=(await call('/api/state?session='+session)).data;
assert.equal(state.session.round,3);assert.equal(state.session.status,'complete');assert.equal(state.questions[0].status,'included');assert.equal(state.messages.length,15);
assert.equal((await call('/api/action',{action:'question',session,body:'结束后不可再提交问题',target:'host'})).status,400);
console.log(JSON.stringify({passed:true,checks:['auth guard','question validation','ownership','duplicate likes','concurrent daily vote limit','concurrent round lock','three-round SSE','question inclusion','persistent archive','closed-room write guard'],messages:state.messages.length}));
