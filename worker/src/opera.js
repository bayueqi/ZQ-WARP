// Opera VPN (SurfEasy) 匿名注册与落地发现。
// 坑一: API 用 Digest 认证不是 Basic，要先吃一个 401 拿 nonce。
// 坑二: 服务端声明 algorithm="SHA-256"，不是 Digest 默认的 MD5。
//       按服务端声明的算法走，同时保留 MD5 兜底。
// 坑三: Workers 的 fetch 不自动管 cookie，会话得手工维持。
import { md5Hex } from "./md5.js";

const EP = "https://api2.sec-tunnel.com/v4";
const API_USER = "se0316";
const API_PASS = "SILrMEPBmJuhomxWkfm3JalqHX2Eheg1YhlEZiMh8II";
const CLIENT_TYPE = "se0316";
const H = {
  "SE-Client-Version": "Stable 114.0.5282.21",
  "SE-Operating-System": "Windows",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0",
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "application/json",
};

export const REGIONS = { AS: "亚洲", EU: "欧洲", AM: "美洲" };

/** Digest 的 H()。服务端目前用 SHA-256，老实现是 MD5，两个都支持。 */
async function digestHash(algo, s) {
  if (/^md5$/i.test(algo)) return md5Hex(s);
  const name = /512/.test(algo) ? "SHA-512" : "SHA-256";
  const d = await crypto.subtle.digest(name, new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha1Upper(s) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function randHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

class Session {
  constructor() { this.jar = ""; }

  _absorb(r) {
    const sc = r.headers.getSetCookie?.() || [];
    if (sc.length) this.jar = sc.map((c) => c.split(";")[0]).join("; ");
  }

  async rpc(path, params) {
    const url = `${EP}/${path}`;
    const body = new URLSearchParams(params).toString();
    const base = () => ({ ...H, ...(this.jar ? { Cookie: this.jar } : {}) });

    let r = await fetch(url, { method: "POST", headers: base(), body });
    if (r.status === 401) {
      const wa = r.headers.get("www-authenticate") || "";
      const g = (k) => (wa.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || "";
      const realm = g("realm"), nonce = g("nonce"), qop = g("qop"), opaque = g("opaque");
      // algorithm 可能不带引号，两种写法都认
      const algo = g("algorithm") ||
        (wa.match(/algorithm=([\w-]+)/) || [])[1] || "MD5";
      const uri = new URL(url).pathname;
      const cnonce = randHex(8), nc = "00000001";
      const H1 = await digestHash(algo, `${API_USER}:${realm}:${API_PASS}`);
      const H2 = await digestHash(algo, `POST:${uri}`);
      const q = qop ? qop.split(",")[0].trim() : "";
      const resp = q
        ? await digestHash(algo, `${H1}:${nonce}:${nc}:${cnonce}:${q}:${H2}`)
        : await digestHash(algo, `${H1}:${nonce}:${H2}`);
      let a = `Digest username="${API_USER}", realm="${realm}", nonce="${nonce}", ` +
              `uri="${uri}", response="${resp}", algorithm=${algo}`;
      if (q) a += `, qop=${q}, nc=${nc}, cnonce="${cnonce}"`;
      if (opaque) a += `, opaque="${opaque}"`;
      this._absorb(r);
      r = await fetch(url, {
        method: "POST",
        headers: { ...base(), Authorization: a },
        body,
      });
    }
    this._absorb(r);
    if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
    const j = await r.json();
    if (j.status && j.status.code !== 0) {
      throw new Error(`${path} code=${j.status.code} ${j.status.message || ""}`);
    }
    return j;
  }
}

/** 匿名注册一个 Opera 账号，返回全部大区的落地清单和代理凭据。 */
export async function fetchOpera() {
  const s = new Session();

  // 邮箱随机，密码就是邮箱的 SHA-1 大写
  const email = `${randHex(10)}@${CLIENT_TYPE}.best.vpn`;
  await s.rpc("register_subscriber", { email, password: await sha1Upper(email) });

  const dev = await s.rpc("register_device", {
    client_type: CLIENT_TYPE,
    device_hash: randHex(20).toUpperCase(),
    device_name: "Opera-Browser-Client",
  });
  const deviceId = dev.data.device_id;
  const idHash = await sha1Upper(deviceId);

  const gp = await s.rpc("device_generate_password", { device_id: deviceId });
  const password = gp.data.device_password;

  const landings = [];
  for (const [code, loc] of Object.entries(REGIONS)) {
    let disc;
    try {
      disc = await s.rpc("discover", { serial_no: idHash, requested_geo: code });
    } catch {
      continue;   // 某个区拿不到就跳过，不影响其他区
    }
    let seq = 0;
    for (const x of disc.data.ips || []) {
      seq += 1;
      landings.push({
        tag: `${loc}${seq}`,
        loc,
        ip: x.ip,
        port: (x.port && x.port[0]) || 443,
        host: `${code.toLowerCase()}${seq - 1}.sec-tunnel.com`,
      });
    }
  }

  return { username: idHash, password, landings, fetchedAt: new Date().toISOString() };
}
