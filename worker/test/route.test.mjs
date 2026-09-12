// 路由级测试：mock env，验证首次初始化、鉴权、UI 改配置都对。
// 跑: node test/route.test.mjs
import worker from "../src/index.js";

const PW = "test-password-123";
let kv, env;

function reset() {
  kv = new Map();
  env = {
    KV: {
      async get(k, t) { const v = kv.get(k); return t === "json" && v ? JSON.parse(v) : v ?? null; },
      async put(k, v) { kv.set(k, v); },
      async delete(k) { kv.delete(k); },
    },
  };
}

const req = (path, opt = {}) => new Request(`https://x.dev${path}`, {
  headers: { "cf-connecting-ip": "9.9.9.9", ...(opt.headers || {}) },
  method: opt.method || "GET",
  body: opt.body,
});
const post = (p, body, headers) =>
  req(p, { method: "POST", body: JSON.stringify(body), headers });

let pass = 0, fail = 0;
const t = (n, c) => { c ? (pass++, console.log("  ✓", n)) : (fail++, console.log("  ✗", n)); };

// ---- KV 未绑 ----
t("KV 未绑给指引页",
  (await (await worker.fetch(req("/"), {})).text()).includes("KV Not Bound"));

// ---- 首次初始化 ----
reset();
t("没设密码时 / 出初始化页",
  (await (await worker.fetch(req("/"), env)).text()).includes("First Run"));
t("没设密码时其他路径 404",
  (await worker.fetch(req("/api/state"), env)).status === 404);
t("密码太短被拒",
  (await worker.fetch(post("/api/setup", { password: "short", confirm: "short" }), env)).status === 400);
t("两次不一致被拒",
  (await worker.fetch(post("/api/setup", { password: "longenough1", confirm: "other" }), env)).status === 400);

const setup = await worker.fetch(post("/api/setup", { password: PW, confirm: PW }), env);
const setc = setup.headers.get("set-cookie") || "";
t("设置密码成功", setup.status === 200);
t("直接下发会话 cookie", setc.includes("om_session="));
t("cookie 带 HttpOnly", setc.includes("HttpOnly"));
t("cookie 带 Secure", setc.includes("Secure"));
t("cookie 带 SameSite", setc.includes("SameSite"));
t("cookie 不含密码明文", !setc.includes(PW));
t("KV 里不存密码明文", !JSON.stringify([...kv.values()]).includes(PW));
// 已初始化后 /api/setup 走未登录分支返回 404 —— 不泄露"已初始化"这个事实
t("已初始化后 /api/setup 不可用",
  (await worker.fetch(post("/api/setup", { password: "another123", confirm: "another123" }), env)).status === 404);

// 真正的竞态：两个请求同时读到 cred 为空
{
  const k2 = new Map();
  const e2 = { KV: {
    async get(k, t) { const v = k2.get(k); return t === "json" && v ? JSON.parse(v) : v ?? null; },
    async put(k, v) { k2.set(k, v); },
    async delete(k) { k2.delete(k); } } };
  const [a, b] = await Promise.all([
    worker.fetch(post("/api/setup", { password: "racer-aaa1", confirm: "racer-aaa1" }), e2),
    worker.fetch(post("/api/setup", { password: "racer-bbb1", confirm: "racer-bbb1" }), e2),
  ]);
  const codes = [a.status, b.status].sort();
  t(`并发初始化只成功一个 (${codes.join("/")})`, codes[0] === 200 && codes[1] === 409);
}

const cookie = setc.split(";")[0];
const auth = { cookie };

// ---- 已初始化后的鉴权 ----
t("设完密码后 / 出状态页",
  (await (await worker.fetch(req("/", { headers: auth }), env)).text()).includes("Opera over MASQUE"));
t("退出后 / 出登录页",
  (await (await worker.fetch(req("/"), env)).text()).includes("Auth Required"));
t("未登录 /api/state 404",
  (await worker.fetch(req("/api/state"), env)).status === 404);
t("错密码登录 401",
  (await worker.fetch(post("/login", { password: "nope" }), env)).status === 401);
t("对密码登录 200",
  (await worker.fetch(post("/login", { password: PW }), env)).status === 200);

// ---- 订阅 ----
kv.set("config:yaml", "# fake\nproxies: []");
const home = await (await worker.fetch(req("/", { headers: auth }), env)).text();
const tok = (home.match(/token=([\w.\-]+)/) || [])[1];
t("状态页给出带 token 的订阅链接", !!tok);

const sub = await worker.fetch(req(`/sub?token=${tok}`), env);
t("默认路径 /sub 带 token 可取", sub.status === 200);
t("订阅是 yaml", (sub.headers.get("content-type") || "").includes("yaml"));
t("订阅带更新间隔头", sub.headers.get("profile-update-interval") === "4");
// 文件名不能带引号：部分客户端不解析，会把 \"x\" 当成文件名显示出来
t("文件名不带引号",
  sub.headers.get("content-disposition") === "attachment; filename=opera-masque.yaml");
t("无 token 取订阅 404", (await worker.fetch(req("/sub"), env)).status === 404);
t("错 token 取订阅 404", (await worker.fetch(req("/sub?token=bad.sig"), env)).status === 404);

// ---- UI 改订阅路径 ----
t("非法路径被拒",
  (await worker.fetch(post("/api/sub-path", { path: "a/b" }, auth), env)).status === 400);
t("保留字被拒",
  (await worker.fetch(post("/api/sub-path", { path: "api" }, auth), env)).status === 400);
t("改路径成功",
  (await worker.fetch(post("/api/sub-path", { path: "my-secret" }, auth), env)).status === 200);
t("新路径生效", (await worker.fetch(req(`/my-secret?token=${tok}`), env)).status === 200);
t("旧路径失效", (await worker.fetch(req(`/sub?token=${tok}`), env)).status === 404);


// ---- UI 改密码 ----
t("当前密码不对时拒绝改",
  (await worker.fetch(post("/api/password",
    { current: "wrong", password: "brandnew123", confirm: "brandnew123" }, auth), env)).status === 401);
t("新密码太短被拒",
  (await worker.fetch(post("/api/password",
    { current: PW, password: "x1", confirm: "x1" }, auth), env)).status === 400);

const chg = await worker.fetch(post("/api/password",
  { current: PW, password: "brandnew123", confirm: "brandnew123" }, auth), env);
t("改密码成功", chg.status === 200);
t("改密码后重新下发 cookie", (chg.headers.get("set-cookie") || "").includes("om_session="));
t("改密码后旧订阅 token 失效",
  (await worker.fetch(req(`/my-secret?token=${tok}`), env)).status === 404);
t("旧密码登不上",
  (await worker.fetch(post("/login", { password: PW }), env)).status === 401);
t("新密码能登上",
  (await worker.fetch(post("/login", { password: "brandnew123" }), env)).status === 200);

// ---- 按需重建：没过期用缓存，过期才重建 ----
{
  reset();
  await worker.fetch(post("/api/setup", { password: PW, confirm: PW }), env);
  const c2 = (await worker.fetch(post("/login", { password: PW }), env))
    .headers.get("set-cookie").split(";")[0];
  const a2 = { cookie: c2 };
  const h2 = await (await worker.fetch(req("/", { headers: a2 }), env)).text();
  const tk = (h2.match(/token=([\w.\-]+)/) || [])[1];

  // 放一份"还没过期"的配置，访问订阅不应触发重建
  kv.set("config:yaml", "# cached\nproxies: []");
  kv.set("state:meta", JSON.stringify({
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    stats: {}, warp: {},
  }));
  const r1 = await worker.fetch(req(`/sub?token=${tk}`), env);
  t("未过期直接给缓存", (await r1.text()).includes("# cached"));

  // 标记为已过期，此时该重建。这里不真的联网，用锁占住来验证走了重建分支
  kv.set("state:meta", JSON.stringify({
    updatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    stats: {}, warp: {},
  }));
  kv.set("rebuild:lock", String(Date.now()));   // 假装别人在重建
  const r2 = await worker.fetch(req(`/sub?token=${tk}`), env);
  t("过期但有人在重建时用旧配置顶住", (await r2.text()).includes("# cached"));

  kv.delete("rebuild:lock");
  kv.delete("config:yaml");
  kv.set("state:meta", JSON.stringify({ expiresAt: new Date(Date.now() - 1).toISOString() }));
  kv.set("rebuild:lock", String(Date.now()));
  const r3 = await worker.fetch(req(`/sub?token=${tk}`), env);
  t("过期且无缓存又拿不到锁时给 503", r3.status === 503);
}

// ---- 过期判定 ----
{
  reset();
  await worker.fetch(post("/api/setup", { password: PW, confirm: PW }), env);
  const st = await (await worker.fetch(req("/api/state",
    { headers: { cookie: (await worker.fetch(post("/login", { password: PW }), env))
      .headers.get("set-cookie").split(";")[0] } }), env)).json();
  t("初始无配置时 state 为空", Object.keys(st).length === 0);
}

// ---- Proton 推送 ----
{
  reset();
  await worker.fetch(post("/api/setup", { password: PW, confirm: PW }), env);
  const ck = (await worker.fetch(post("/login", { password: PW }), env))
    .headers.get("set-cookie").split(";")[0];
  const a3 = { cookie: ck };

  const blob = btoa(JSON.stringify({
    v: 1, privateKey: "FAKEKEY", expiresAt: Math.floor(Date.now()/1000) + 604800,
    servers: [{ name: "JP1", cc: "JP", ip: "1.2.3.4", port: 51820, pub: "PUB" }],
  }));
  const raw = (p, body) => new Request(`https://x.dev${p}`, {
    method: "POST", headers: { "cf-connecting-ip": "9.9.9.9" }, body });

  t("没生成令牌时推送 404",
    (await worker.fetch(raw("/push/anything", blob), env)).status === 404);

  const tr = await (await worker.fetch(post("/api/proton/token", {}, a3), env)).json();
  t("能生成推送令牌", tr.ok && tr.token && tr.token.length >= 32);

  t("错令牌推送 404",
    (await worker.fetch(raw("/push/wrongtoken", blob), env)).status === 404);
  t("未登录也不能拿令牌",
    (await worker.fetch(post("/api/proton/token", {}), env)).status === 404);

  const bad = await worker.fetch(raw(`/push/${tr.token}`, "not-base64!!"), env);
  t("坏数据被拒且提示明确", bad.status === 400);

  const expired = btoa(JSON.stringify({
    v: 1, privateKey: "K", expiresAt: Math.floor(Date.now()/1000) - 10,
    servers: [{ name: "x", ip: "1.1.1.1", port: 51820, pub: "P" }] }));
  t("过期凭据被拒",
    (await worker.fetch(raw(`/push/${tr.token}`, expired), env)).status === 400);

  // 正常推送（rebuild 会联网失败，但凭据应已写入）
  const okp = await worker.fetch(raw(`/push/${tr.token}`, blob), env);
  const oj = await okp.json();
  t("正常推送被接受", okp.status === 200 && oj.ok);
  t("凭据已落 KV", !!kv.get("proton:cred"));
  t("KV 里存的是解析后的对象",
    JSON.parse(kv.get("proton:cred")).servers[0].name === "JP1");

  // 换令牌后旧的失效
  const tr2 = await (await worker.fetch(post("/api/proton/token", {}, a3), env)).json();
  t("换令牌后旧令牌失效",
    (await worker.fetch(raw(`/push/${tr.token}`, blob), env)).status === 404);
  t("新令牌可用",
    (await worker.fetch(raw(`/push/${tr2.token}`, blob), env)).status === 200);

  await worker.fetch(post("/api/proton/clear", {}, a3), env);
  t("能清除 Proton 凭据", !kv.get("proton:cred"));
}

// ---- Windscribe ----
{
  reset();
  await worker.fetch(post("/api/setup", { password: PW, confirm: PW }), env);
  const c4 = (await worker.fetch(post("/login", { password: PW }), env))
    .headers.get("set-cookie").split(";")[0];
  const a4 = { cookie: c4 };

  // 首页要查 Windscribe 用量。接口挂了不能把整个管理页带塌
  kv.set("wind:account", JSON.stringify({
    sessionAuthHash: "sah", locHash: "lh", userId: "u1",
  }));
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network down"); };
  const boom = await worker.fetch(req("/", { headers: a4 }), env);
  globalThis.fetch = real;
  t("查用量失败不影响管理页", boom.status === 200);

  // 有用量时按 GB 显示
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: { traffic_used: 536870912, traffic_max: 2147483648, status: 1, loc_hash: "lh" },
  }), { status: 200 });
  kv.set("state:meta", JSON.stringify({
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    stats: { wind: 62 }, warp: {}, wind: { userId: "u1", servers: 62 },
  }));
  const okpg = await (await worker.fetch(req("/", { headers: a4 }), env)).text();
  globalThis.fetch = real;
  t("显示用量", okpg.includes("0.50 GB") && okpg.includes("2.00 GB"));
  t("显示账号", okpg.includes("u1"));
  t("显示落地数", okpg.includes("62"));

  // 没账号时不查，也不该报错
  reset();
  await worker.fetch(post("/api/setup", { password: PW, confirm: PW }), env);
  const c5 = (await worker.fetch(post("/login", { password: PW }), env))
    .headers.get("set-cookie").split(";")[0];
  const noacc = await (await worker.fetch(req("/", { headers: { cookie: c5 } }), env)).text();
  t("没账号显示未启用", noacc.includes("未启用"));

  t("清除账号要登录", (await worker.fetch(post("/api/wind/clear", {}), env)).status === 404);
  t("清除账号只认 POST",
    (await worker.fetch(req("/api/wind/clear", { headers: { cookie: c5 } }), env)).status === 404);
}

// ---- Windscribe 账号由流水线推送 ----
{
  reset();
  await worker.fetch(post("/api/setup", { password: PW, confirm: PW }), env);
  const c6 = (await worker.fetch(post("/login", { password: PW }), env))
    .headers.get("set-cookie").split(";")[0];
  const a6 = { cookie: c6 };
  const tk = (await (await worker.fetch(post("/api/proton/token", {}, a6), env)).json()).token;
  const raw = (p, body) => new Request(`https://x.dev${p}`, {
    method: "POST", headers: { "cf-connecting-ip": "9.9.9.9" }, body });

  const good = JSON.stringify({
    userId: "u1", sessionAuthHash: "sah", locHash: "lh",
    status: 1, trafficMax: 2147483648,
  });

  t("错令牌推 wind 是 404",
    (await worker.fetch(raw("/push/wrong/wind", good), env)).status === 404);
  t("坏 JSON 被拒",
    (await worker.fetch(raw(`/push/${tk}/wind`, "{oops"), env)).status === 400);
  t("缺字段被拒",
    (await worker.fetch(raw(`/push/${tk}/wind`, '{"userId":"x"}'), env)).status === 400);

  // 降额账号必须挡住 —— status=2 的号连代理凭据都取不到
  const dud = JSON.stringify({
    userId: "u2", sessionAuthHash: "s", locHash: "l",
    status: 2, trafficMax: 1048576,
  });
  const dr = await worker.fetch(raw(`/push/${tk}/wind`, dud), env);
  t("降额账号被拒", dr.status === 400 && (await dr.json()).error.includes("status=2"));
  t("降额账号没落 KV", !kv.get("wind:account"));

  // 正常账号：rebuild 会联网失败，但账号本身应已写入
  const okr = await worker.fetch(raw(`/push/${tk}/wind`, good), env);
  t("正常账号被接受", okr.status === 200);
  t("账号已落 KV", JSON.parse(kv.get("wind:account") || "{}").userId === "u1");

  // 同一个令牌，不带后缀还是走 Proton
  const blob = btoa(JSON.stringify({
    v: 1, privateKey: "K", expiresAt: Math.floor(Date.now() / 1000) + 604800,
    servers: [{ name: "JP1", ip: "1.1.1.1", port: 51820, pub: "P" }] }));
  await worker.fetch(raw(`/push/${tk}`, blob), env);
  t("同一令牌不带后缀走 Proton", !!kv.get("proton:cred"));
  t("两种凭据互不覆盖", !!kv.get("wind:account") && !!kv.get("proton:cred"));

  // 清除
  await worker.fetch(post("/api/wind/clear", {}, a6), env);
  t("能清除 Windscribe 账号", !kv.get("wind:account"));
  t("清除 wind 不动 Proton", !!kv.get("proton:cred"));
}

console.log(`\n通过 ${pass} 失败 ${fail}`);
if (fail) process.exit(1);
