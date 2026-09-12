// 鉴权。密码存 KV，不走环境变量。
//
// 几个必须做到的点:
//   - 密码只存 PBKDF2 哈希 + 随机盐，KV 里看不到明文
//   - 会话 token 用哈希当密钥签名，所以改密码会自动让旧 token 全部失效
//   - 常数时间比较，别让内容从响应时间里漏出去
//   - 登录失败限速，否则弱密码几分钟就被爆出来
const enc = new TextEncoder();

const ITER = 100000;   // PBKDF2 轮数，Workers 上约几十毫秒，可接受

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** 常数时间字符串比较。长度差异也异或进去，不提前 return。 */
export function safeEqual(a, b) {
  const x = enc.encode(a || "");
  const y = enc.encode(b || "");
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function pbkdf2(password, saltB64, iter = ITER) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, key, 256);
  return b64(bits);
}

/** 生成密码记录，存进 KV 的就是这个对象。 */
export async function makeCred(password) {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  const salt = b64(s);
  return {
    salt,
    iter: ITER,
    hash: await pbkdf2(password, salt, ITER),
    updatedAt: new Date().toISOString(),
  };
}

export async function checkPassword(cred, password) {
  if (!cred || !cred.hash) return false;
  const h = await pbkdf2(password, cred.salt, cred.iter || ITER);
  return safeEqual(h, cred.hash);
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return b64(sig).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TTL = 7 * 24 * 3600 * 1000;   // 会话 7 天

/** 用密码哈希当签名密钥：改密码 -> 哈希变 -> 所有旧 token 自动失效。 */
export async function signToken(cred) {
  const exp = Date.now() + TTL;
  return `${exp}.${await hmac(cred.hash, String(exp))}`;
}

export async function verifyToken(cred, token) {
  if (!cred || !cred.hash || !token || !token.includes(".")) return false;
  const i = token.lastIndexOf(".");
  const exp = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(cred.hash, exp));
}

export function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** 登录限速：同一 IP 15 分钟内失败 8 次就锁 15 分钟。 */
export async function rateLimit(env, ip) {
  const key = `rl:${ip}`;
  const n = Number((await env.warp.get(key)) || 0);
  if (n >= 8) return false;
  await env.warp.put(key, String(n + 1), { expirationTtl: 900 });
  return true;
}

export async function clearRateLimit(env, ip) {
  await env.warp.delete(`rl:${ip}`);
}

/** 订阅路径只允许字母数字和横杠下划线，避免路由被搞乱。 */
export function normalizePath(p) {
  const clean = String(p || "").trim().replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clean)) return null;
  const reserved = ["login", "logout", "api", "setup"];
  if (reserved.includes(clean.toLowerCase())) return null;
  return clean;
}
