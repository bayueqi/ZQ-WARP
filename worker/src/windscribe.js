// Windscribe 免费落地。
//
// 和 Proton 不同，这家的认证只有一行 md5(secret + 时间戳)，没有 SRP、
// 没有 PGP 验签，所以整套流程能直接在 Worker 里跑完。
//
// 注册不要邮箱：POST /Users 给个用户名密码就返回 session_auth_hash。
// 免费额度 2GB/月（官网说的 10GB 要验证邮箱，这里拿不到）。
//
// 坑：开户和出口 IP 强相关。同一个 IP 开过号之后再开，会拿到
// status=2 的降额账号（traffic_max=1MB），而且那种号连 /ServerCredentials
// 都取不到（400 errorCode 1700），等于完全不可用。
//
// Cloudflare Worker 的出口 IP 是全平台共享的，早被人用过，所以
// **Worker 里开不出可用的号**。registerWindscribe 只在 GitHub Actions
// 的 runner 上跑（scripts/gen_wind.py），Worker 这边只消费账号。

import { md5Hex } from "./md5.js";

const CLIENT_AUTH_SECRET = "952b4412f002315aa50751032fcaab03";
const API = "https://api.windscribe.com";
const ASSETS = "https://assets.windscribe.com/serverlist";
const PROXY_PORT = 443;

const H = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/103.0.5060.53 Safari/537.36",
  "Origin": "chrome-extension://hnmpcagpplmpfojmgmnngilcnanddlhb",
  "Accept": "application/json",
};

// 免费能用的地区 -> 中文名。serverlist 里 premium_only=0 的就这些。
const CC = {
  "US-C": "美国中部", "US": "美国东部", "US-W": "美国西部",
  "CA": "加拿大东部", "CA-W": "加拿大西部",
  "FR": "法国", "DE": "德国", "NL": "荷兰", "NO": "挪威",
  "RO": "罗马尼亚", "CH": "瑞士", "GB": "英国", "HK": "香港",
};

/** client_auth_hash = md5(固定 secret + 当前秒数)。 */
function authHash() {
  const t = Math.floor(Date.now() / 1000);
  return { hash: md5Hex(CLIENT_AUTH_SECRET + String(t)), time: t };
}

function randName(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  const cs = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...a].map((b) => cs[b % cs.length]).join("");
}

function randPass() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  const cs = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return [...a].map((b) => cs[b % cs.length]).join("") + "!aA9";
}

async function call(url, init) {
  const r = await fetch(url, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`响应不是 JSON: ${text.slice(0, 120)}`); }
  if (!j.data) {
    const msg = (j.errorMessage || j.message || text).toString().slice(0, 160);
    throw new Error(`Windscribe ${r.status}: ${msg}`);
  }
  return j.data;
}

/** 匿名开户。返回的 session_auth_hash 是后续所有调用的凭证。 */
export async function registerWindscribe() {
  const { hash, time } = authHash();
  const username = "u" + randName(9);
  const password = randPass();
  const d = await call(`${API}/Users`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_auth_hash: hash,
      time: String(time),
      session_type_id: "2",
      username,
      password,
    }).toString(),
  });
  if (d.status !== 1) {
    throw new Error(`账号状态异常 status=${d.status}，多半是这个出口 IP 开户太频繁`);
  }
  return {
    username,
    password,
    userId: d.user_id,
    sessionAuthHash: d.session_auth_hash,
    locHash: d.loc_hash,
    trafficMax: d.traffic_max,
    registeredAt: new Date().toISOString(),
  };
}

/** 代理用户名/密码。接口返回的是 base64 包过一层的。 */
export async function fetchCredentials(acc) {
  const { hash, time } = authHash();
  const q = new URLSearchParams({
    client_auth_hash: hash,
    session_auth_hash: acc.sessionAuthHash,
    time: String(time),
  });
  const d = await call(`${API}/ServerCredentials?${q}`);
  return { username: atob(d.username), password: atob(d.password) };
}

/** 账号还剩多少流量。管理页显示用，也用来判断要不要换号。 */
export async function fetchSession(acc) {
  const { hash, time } = authHash();
  const q = new URLSearchParams({
    client_auth_hash: hash,
    session_auth_hash: acc.sessionAuthHash,
    time: String(time),
    session_type_id: "2",
  });
  const d = await call(`${API}/Session?${q}`);
  return {
    used: d.traffic_used,
    max: d.traffic_max,
    status: d.status,
    locHash: d.loc_hash,
  };
}

/** 服务器列表。这个接口不要鉴权头，路径里带 loc_hash。 */
export async function fetchServers(acc) {
  const r = await fetch(`${ASSETS}/chrome/0/${acc.locHash}`, { headers: H });
  if (!r.ok) throw new Error(`serverlist HTTP ${r.status}`);
  const j = await r.json();
  const out = [];
  for (const c of j.data || []) {
    if (c.premium_only) continue;
    const loc = CC[c.short_name];
    if (!loc) continue;          // 名单外的免费地区不认，避免出现没中文名的节点
    let seq = 0;
    for (const g of c.groups || []) {
      for (const h of g.hosts || []) {
        if (!h.hostname) continue;
        seq += 1;
        out.push({ tag: `${loc}${seq}`, loc, host: h.hostname, port: PROXY_PORT });
      }
    }
  }
  return out;
}

/** 一次拿齐：账号必须由外部给（流水线推来的），这里只取凭据和服务器列表。
 *
 * 不在这里开户 —— Worker 的出口 IP 是 Cloudflare 共享的，
 * Windscribe 只会发 status=2 的降额号，那种号取不到代理凭据。
 * 开户在 scripts/gen_wind.py 里做，跑在 GitHub runner 上。
 */
export async function fetchWindscribe(account) {
  if (!account || !account.sessionAuthHash) {
    throw new Error("没有 Windscribe 账号，跑一次流水线推一个过来");
  }
  const [cred, servers] = await Promise.all([
    fetchCredentials(account), fetchServers(account),
  ]);
  return { account, ...cred, servers };
}
