// Opera VPN over Cloudflare WARP (MASQUE) —— Worker 版
//
// 部署只需要绑一个 KV，密码和订阅路径都在界面上设，不用 cron。
//
// 职责:
//   1. 订阅被访问时按需重建：Opera 凭据没过期就直接给缓存，
//      过期了才重新注册。凭据有效期 4 小时（opera-proxy 的 -refresh 默认值）
//   2. WARP 注册信息存 KV 复用，不每次重注册（设备是有限资源）
//   3. 首次访问引导设密码，之后订阅路径、改密码都在界面里做
import { registerWarp } from "./warp.js";
import { fetchOpera } from "./opera.js";
import { buildConfig } from "./config.js";
import { parseBlob } from "./proton.js";
import { fetchWindscribe, fetchSession } from "./windscribe.js";
import { renderUI, renderLogin, renderSetup, renderNoKV } from "./ui.js";
import {
  safeEqual, makeCred, checkPassword, signToken, verifyToken,
  readCookie, rateLimit, clearRateLimit, normalizePath,
} from "./auth.js";

const K_WARP = "warp:device";     // WARP 注册信息，长期复用
const K_CFG = "config:yaml";      // 聚合配置（套娃线路 + WARP 直连）
const K_STATE = "state:meta";     // 状态元数据，给 UI 用
const K_CRED = "auth:cred";       // 密码哈希 + 盐
const K_SET = "settings";         // 订阅路径等设置
const K_CLAIM = "auth:claim";     // 初始化时的抢占标记
const K_PROTON = "proton:cred";   // Proton 凭据（由流水线推送）
const K_PUSH = "proton:token";    // 流水线的写入令牌
const K_WIND = "wind:account";    // Windscribe 账号，长期复用（连着开户会被降额）
const K_LOCK = "rebuild:lock";    // 重建锁，防并发重复注册
const COOKIE = "om_session";
const DEFAULT_SUB = "sub";

// Opera 凭据有效期。opera-proxy 默认每 4 小时刷新一次登录和设备密码
// （main.go: -refresh 4h），API 本身不返回真实 TTL，按这个值走。
// 留 10 分钟余量，别卡着点过期。
const TTL_MS = 4 * 3600 * 1000;
const SKEW_MS = 10 * 60 * 1000;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const html = (body, s = 200) =>
  new Response(body, {
    status: s,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const notFound = () => new Response("Not Found", { status: 404 });

async function getSettings(env) {
  const s = (await env.warp.get(K_SET, "json")) || {};
  return { subPath: s.subPath || DEFAULT_SUB };
}

/** 拿 WARP 设备信息，KV 里有就复用，没有才注册。 */
async function getWarp(env, force = false) {
  if (!force) {
    const cached = await env.warp.get(K_WARP, "json");
    if (cached && cached.privateKey) return cached;
  }
  const w = await registerWarp("cf-worker");
  await env.warp.put(K_WARP, JSON.stringify(w));
  return w;
}

/** Windscribe 账号只用流水线推来的那个，Worker 不自己开户。
 *
 * 原因：Cloudflare Worker 的出口 IP 是整个平台共享的，早就被别人拿去开过号。
 * Windscribe 认这个 IP，直接发 status=2 的降额账号（traffic_max=1MB），
 * 而 status=2 的号连 /ServerCredentials 都取不到
 * （400 errorCode 1700 "User unable to generate credentials"），
 * 也就是说降额号完全没法用，不是"额度小一点"的问题。
 *
 * 所以开户放到 GitHub Actions 上做，runner 的 IP 是干净的。
 */
async function getWind(env) {
  const acc = await env.warp.get(K_WIND, "json");
  if (!acc || !acc.sessionAuthHash) return null;
  return await fetchWindscribe(acc);
}

/** 重建配置。WARP 复用，Opera 每次重取（凭据会过期）。 */
async function rebuild(env, { forceWarp = false } = {}) {
  const warp = await getWarp(env, forceWarp);
  const opera = await fetchOpera();
  // Proton 凭据是流水线推来的，没有就跳过，不影响其他线路
  let proton = null;
  const pc = await env.warp.get(K_PROTON, "json");
  if (pc && (!pc.expiresAt || pc.expiresAt * 1000 > Date.now())) proton = pc;
  // Windscribe 拿不到就跳过。它只是多一条线路，不该拖垮整份订阅。
  // 但错误要留下来 —— 之前直接吞掉，管理页只能显示一句笼统的失败，
  // 排查时完全看不出是限速、开户被拒还是别的。
  let wind = null, windErr = null;
  try {
    wind = await getWind(env);
  } catch (e) {
    windErr = e.message;
  }
  const { yaml, entries, landings, combos, proton: pn, wind: wn } =
    buildConfig(warp, opera, proton, wind);

  const now = Date.now();
  const state = {
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
    stats: { entries, landings, combos, proton: pn || 0, wind: wn || 0 },
    protonExpiresAt: proton ? proton.expiresAt : null,
    wind: wind ? { userId: wind.account.userId, servers: wn || 0 } : null,
    windErr,
    warp: {
      deviceId: warp.deviceId,
      ipv4: warp.ipv4,
      ipv6: warp.ipv6,
      registeredAt: warp.registeredAt,
    },
  };

  await env.warp.put(K_CFG, yaml);
  await env.warp.put(K_STATE, JSON.stringify(state));
  return state;
}

/** 凭据是否还在有效期内。没有配置或没有到期时间都算过期。 */
function isFresh(state) {
  if (!state || !state.expiresAt) return false;
  return Date.parse(state.expiresAt) - SKEW_MS > Date.now();
}

/** 按需重建。没过期直接返回缓存，过期了才重新注册。
 *
 * 加锁是因为订阅可能被多个客户端同时拉，不加锁会并发注册一堆
 * Opera 账号，还可能触发风控。拿不到锁的一方用旧配置顶一下，
 * 旧配置也没有才等着。
 */
async function ensureConfig(env) {
  const state = await env.warp.get(K_STATE, "json");
  const yaml = await env.warp.get(K_CFG);
  if (yaml && isFresh(state)) return yaml;

  const lock = await env.warp.get(K_LOCK);
  if (lock && Date.now() - Number(lock) < 90000) {
    // 别人正在重建。有旧配置就先顶着，用户不至于拿不到东西
    if (yaml) return yaml;
  } else {
    await env.warp.put(K_LOCK, String(Date.now()), { expirationTtl: 120 });
    try {
      await rebuild(env);
    } finally {
      await env.warp.delete(K_LOCK);
    }
  }
  return (await env.warp.get(K_CFG)) || yaml;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const ip = req.headers.get("cf-connecting-ip") || "unknown";

    // KV 没绑就没法工作，给个明确指引而不是报一堆栈
    if (!env || !env.warp) return html(renderNoKV(), 500);

    const cred = await env.warp.get(K_CRED, "json");
    const authed = cred && (await verifyToken(cred, readCookie(req, COOKIE)));

    // ---- 首次使用：还没设密码 ----
    if (!cred) {
      if (path === "/api/setup" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const pw = String(body.password || "");
        if (pw.length < 8) return json({ ok: false, error: "密码至少 8 位" }, 400);
        if (pw !== body.confirm) return json({ ok: false, error: "两次输入不一致" }, 400);

        // 抢占式竞态保护。KV 没有 CAS，check-then-put 不是原子的，
        // 两个并发请求会都读到空。这里先写一个带随机标记的占位，
        // 回读确认是自己写的才继续，否则说明被别人抢先了。
        const claim = crypto.randomUUID();
        if (await env.warp.get(K_CRED)) {
          return json({ ok: false, error: "密码已被设置，请刷新页面" }, 409);
        }
        await env.warp.put(K_CLAIM, claim, { expirationTtl: 60 });
        if ((await env.warp.get(K_CLAIM)) !== claim) {
          return json({ ok: false, error: "密码已被设置，请刷新页面" }, 409);
        }

        const c = await makeCred(pw);
        if (await env.warp.get(K_CRED)) {
          return json({ ok: false, error: "密码已被设置，请刷新页面" }, 409);
        }
        await env.warp.put(K_CRED, JSON.stringify(c));
        await env.warp.delete(K_CLAIM);
        const token = await signToken(c);
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; ` +
                          `SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
          },
        });
      }
      if (path === "/") return html(renderSetup());
      return notFound();
    }

    const settings = await getSettings(env);
    const subPath = "/" + settings.subPath;

    // ---- 订阅。客户端带不了 cookie，用 ?token= ----
    if (path === subPath) {
      const t = url.searchParams.get("token") || "";
      if (!(await verifyToken(cred, t)) && !authed) return notFound();

      const yaml = await ensureConfig(env);
      if (!yaml) {
        return new Response("配置生成失败，稍后重试或到管理页手动刷新",
          { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      return new Response(yaml, {
        headers: {
          "content-type": "text/yaml; charset=utf-8",
          // 文件名不加引号：部分客户端不解析引号，会把 \"x\" 当成文件名的一部分
          "content-disposition": "attachment; filename=opera-masque.yaml",
          "profile-update-interval": "4",
          "cache-control": "no-store",
        },
      });
    }

    // ---- 流水线推送 Proton 凭据 ----
    // 令牌直接放在路径里，这样 Actions 只需要配一个 secret。
    // 它只能写 Proton 凭据，动不了管理页；泄露了在管理页换一个即可。
    if (path.startsWith("/push/") && req.method === "POST") {
      const tk = await env.warp.get(K_PUSH);
      // 路径可以带类型后缀：/push/<令牌> 是 Proton，/push/<令牌>/wind 是 Windscribe。
      // 同一个令牌收两种，Actions 那边还是只配一个 secret。
      const rest = path.slice(6);
      const slash = rest.indexOf("/");
      const got = slash < 0 ? rest : rest.slice(0, slash);
      const kind = slash < 0 ? "proton" : rest.slice(slash + 1);
      if (!tk || !got || !safeEqual(got, tk)) return notFound();

      const body = await req.text();

      if (kind === "wind") {
        // Windscribe 账号由流水线在 GitHub runner 上开。
        // Worker 自己开不了 —— CF 的出口 IP 是共享的，早被人用过，
        // Windscribe 直接发 status=2 的降额号(1MB)，那种号连代理凭据都取不到。
        let acc;
        try {
          acc = JSON.parse(body);
        } catch {
          return json({ ok: false, error: "不是合法的 JSON" }, 400);
        }
        if (!acc || !acc.sessionAuthHash || !acc.locHash) {
          return json({ ok: false, error: "缺 sessionAuthHash 或 locHash" }, 400);
        }
        if (acc.status !== undefined && acc.status !== 1) {
          return json({ ok: false, error: `账号 status=${acc.status}，是被降额的号，没法用` }, 400);
        }
        await env.warp.put(K_WIND, JSON.stringify(acc));
        try {
          const st = await rebuild(env);
          return json({ ok: true, msg: `已写入 Windscribe 账号，${st.stats.wind} 台落地` });
        } catch (e) {
          return json({ ok: true, msg: "账号已写入，但重建配置失败：" + e.message });
        }
      }

      let parsed;
      try {
        parsed = parseBlob(body);
      } catch (e) {
        return json({ ok: false, error: e.message }, 400);
      }
      await env.warp.put(K_PROTON, JSON.stringify(parsed));
      // 凭据换了，配置得重建才生效
      try {
        const st = await rebuild(env);
        return json({ ok: true, msg: `已写入 ${parsed.servers.length} 台 Proton 落地`,
                      combos: st.stats.combos, proton: st.stats.proton });
      } catch (e) {
        return json({ ok: true, msg: "凭据已写入，但重建配置失败：" + e.message });
      }
    }

    // ---- 登录 ----
    if (path === "/login" && req.method === "POST") {
      if (!(await rateLimit(env, ip))) {
        return json({ ok: false, error: "尝试过多，15 分钟后再试" }, 429);
      }
      const body = await req.json().catch(() => ({}));
      if (!(await checkPassword(cred, String(body.password || "")))) {
        return json({ ok: false, error: "密码错误" }, 401);
      }
      await clearRateLimit(env, ip);
      const token = await signToken(cred);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; ` +
                        `SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
        },
      });
    }

    if (path === "/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        },
      });
    }

    // ---- 首页 ----
    if (path === "/") {
      if (!authed) return html(renderLogin());
      const state = await env.warp.get(K_STATE, "json");
      const token = await signToken(cred);
      const pushToken = await env.warp.get(K_PUSH);
      const protonCred = await env.warp.get(K_PROTON, "json");
      // 用量是实时问 Windscribe 的，问不到就不显示，不影响页面其他部分
      let windUsage = null;
      const wa = await env.warp.get(K_WIND, "json");
      if (wa && wa.sessionAuthHash) {
        try { windUsage = await fetchSession(wa); } catch { windUsage = null; }
      }
      return html(renderUI(state, url.host, subPath, token, cred,
                           pushToken, protonCred, windUsage));
    }

    // ---- 以下都要登录。未登录一律 404，不用 401 ----
    // 401 会告诉探测者"这个路径存在"，等于泄露订阅路径的存在性
    if (!authed) return notFound();

    if (path === "/api/state") {
      return json((await env.warp.get(K_STATE, "json")) || {});
    }

    // 重新生成流水线的写入令牌
    if (path === "/api/proton/token" && req.method === "POST") {
      const t = crypto.randomUUID().replace(/-/g, "") +
                crypto.randomUUID().replace(/-/g, "");
      await env.warp.put(K_PUSH, t);
      return json({ ok: true, token: t, msg: "令牌已更新，旧的立即失效" });
    }

    // 清掉 Proton 凭据
    if (path === "/api/proton/clear" && req.method === "POST") {
      await env.warp.delete(K_PROTON);
      try {
        await rebuild(env);
      } catch { /* 重建失败不影响清除本身 */ }
      return json({ ok: true, msg: "Proton 凭据已清除" });
    }

    // 改订阅路径
    if (path === "/api/sub-path" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const p = normalizePath(body.path);
      if (!p) {
        return json({
          ok: false,
          error: "只能用字母数字和 - _，1-64 位，且不能是 login/logout/api/setup",
        }, 400);
      }
      await env.warp.put(K_SET, JSON.stringify({ ...settings, subPath: p }));
      return json({ ok: true, msg: `订阅路径已改为 /${p}` });
    }

    // 改密码。旧 token 会因为哈希变化自动失效，所以要重新下发
    if (path === "/api/password" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!(await checkPassword(cred, String(body.current || "")))) {
        return json({ ok: false, error: "当前密码不对" }, 401);
      }
      const pw = String(body.password || "");
      if (pw.length < 8) return json({ ok: false, error: "新密码至少 8 位" }, 400);
      if (pw !== body.confirm) return json({ ok: false, error: "两次输入不一致" }, 400);

      const c = await makeCred(pw);
      await env.warp.put(K_CRED, JSON.stringify(c));
      const token = await signToken(c);
      return new Response(
        JSON.stringify({ ok: true, msg: "密码已改，旧的订阅链接全部失效" }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; ` +
                          `SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
          },
        });
    }

    // 只换 Opera 凭据，WARP 设备保留
    if (path === "/api/refresh" && req.method === "POST") {
      try {
        const s = await rebuild(env);
        return json({ ok: true, msg: `已刷新，${s.stats.combos} 个组合` });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // 重注册 WARP 设备，MASQUE 整体不通时才用
    if (path === "/api/reset-warp" && req.method === "POST") {
      try {
        const s = await rebuild(env, { forceWarp: true });
        return json({ ok: true, msg: `WARP 已重注册，${s.stats.combos} 个组合` });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // 清掉 Windscribe 账号。换号要重跑流水线 —— Worker 自己开不出可用的号
    if (path === "/api/wind/clear" && req.method === "POST") {
      await env.warp.delete(K_WIND);
      try {
        await rebuild(env);
      } catch { /* 重建失败不影响清除本身 */ }
      return json({ ok: true, msg: "已清除，重跑一次流水线拿新账号" });
    }

    return notFound();
  },
};
