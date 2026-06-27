import assert from "node:assert";
process.env.GHL_CLIENT_ID="test-client";
process.env.GHL_CLIENT_SECRET="test-secret";
process.env.GHL_REDIRECT_URI="https://example.test/oauth/callback";
process.env.DB_DRIVER="memory"; process.env.QUEUE_DRIVER="memory";
process.env.LLM_PROVIDER="mock"; process.env.GHL_ADAPTER="mock"; process.env.LOG_LEVEL="silent";

const { authorizeUrl, exchangeCode } = await import("./src/adapters/ghl/oauth.js");
const { getValidAccessToken, saveGrant } = await import("./src/adapters/ghl/tokenStore.js");
const { createMemoryRepositories, setRepositories } = await import("./src/db/index.js");

const u = new URL(authorizeUrl("xyz"));
assert.equal(u.searchParams.get("client_id"), "test-client");
assert.equal(u.searchParams.get("redirect_uri"), "https://example.test/oauth/callback");
assert.ok(u.pathname.includes("/oauth/chooselocation"));
console.log("PASS authorizeUrl builds consent URL");

globalThis.fetch = async () => ({ ok:true, status:200, json:async()=>({access_token:"acc_1",refresh_token:"ref_1",expires_in:3600,scope:"locations.readonly",locationId:"loc_abc",companyId:"co_1",userType:"Location"}), text:async()=>"" });
const grant = await exchangeCode("code");
assert.equal(grant.locationId,"loc_abc"); assert.equal(grant.accessToken,"acc_1");
assert.ok(grant.expiresAt.getTime() > Date.now());
console.log("PASS exchangeCode returns normalized grant");

globalThis.fetch = async () => ({ ok:false, status:400, json:async()=>({error:"invalid_grant"}), text:async()=>"{}" });
let threw=false; try { await exchangeCode("bad"); } catch { threw=true; }
assert.ok(threw); console.log("PASS exchangeCode throws on 4xx");

setRepositories(createMemoryRepositories());
let called=0; globalThis.fetch = async () => { called++; return {ok:true,status:200,json:async()=>({}),text:async()=>""}; };
await saveGrant({locationId:"loc_1",accessToken:"valid",refreshToken:"r",expiresAt:new Date(Date.now()+3600000)});
assert.equal(await getValidAccessToken("loc_1"),"valid"); assert.equal(called,0);
console.log("PASS valid token returned without refresh");

await saveGrant({locationId:"loc_1",accessToken:"old",refreshToken:"r_old",expiresAt:new Date(Date.now()-1000)});
globalThis.fetch = async () => ({ ok:true, status:200, json:async()=>({access_token:"new",refresh_token:"r_new",expires_in:3600,locationId:"loc_1"}), text:async()=>"" });
assert.equal(await getValidAccessToken("loc_1"),"new");
console.log("PASS expired token auto-refreshes & persists");

let threw2=false; try { await getValidAccessToken("nope"); } catch { threw2=true; }
assert.ok(threw2); console.log("PASS rejects when not installed");
console.log("\nALL OAUTH CHECKS PASSED");
