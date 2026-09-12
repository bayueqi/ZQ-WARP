// 配置结构测试。跑: node test/config.test.mjs
import { buildConfig } from "../src/config.js";

const warp = {
  privateKey: "MGsCAQEEIFAKE", peerPublicKey: "MFkwEwFAKE",
  ipv4: "172.16.0.2", ipv6: "2606:4700:110::1",
  deviceId: "x", registeredAt: new Date().toISOString(),
};
const opera = {
  username: "USER", password: "PASS",
  landings: [
    { tag: "亚洲1", loc: "亚洲", ip: "77.111.245.1", port: 443, host: "as0.sec-tunnel.com" },
    { tag: "欧洲1", loc: "欧洲", ip: "77.111.247.1", port: 443, host: "eu0.sec-tunnel.com" },
  ],
};

let pass = 0, fail = 0;
const t = (n, c) => { c ? (pass++, console.log("  ✓", n)) : (fail++, console.log("  ✗", n)); };

const { yaml, entries, combos } = buildConfig(warp, opera);
const groups = [...yaml.matchAll(/^  - name: (.+)$/gm)].map((m) => m[1]);
const proxyNames = [...yaml.matchAll(/^  - \{name: "([^"]+)"/gm)].map((m) => m[1]);
const entryNames = [...yaml.matchAll(/^  - name: (\S+)\n    type: masque$/gm)].map((m) => m[1]);

t(`接入点 ${entries} 个`, entries === 57);
t(`组合 ${combos} 个 (57 x 2)`, combos === 114);
t("有 WARP直连 组", groups.includes("WARP直连"));
t("有三个地区组",
  ["亚洲线路", "欧洲线路"].every((g) => groups.includes(g)));

// WARP直连 组的成员必须都是接入点，不能混进组合节点
const warpGroup = yaml.split("  - name: WARP直连")[1].split("\n  - name:")[0];
const members = [...warpGroup.matchAll(/^      - "([^"]+)"$/gm)].map((m) => m[1]);
t(`WARP直连 有 ${members.length} 个成员`, members.length === 57);
t("成员都是接入点(不含 @)", members.every((m) => !m.includes("@")));
t("成员都在 proxies 里定义", members.every((m) => entryNames.includes(m)));

// 节点选择里要同时有地区组和直连
const sel = yaml.split("  - name: 🚀 节点选择")[1].split("\n  - name:")[0];
t("节点选择含 WARP直连", sel.includes("WARP直连"));
t("节点选择含地区线路", sel.includes("亚洲线路"));

// 组合节点必须带 dialer-proxy，直连节点必须不带
t("组合节点都带 dialer-proxy",
  (yaml.match(/dialer-proxy:/g) || []).length === combos);
t("组合节点名格式正确", proxyNames.every((n) => /^[\u4e00-\u9fa5]+\d+@/.test(n)));

// 不能有悬空引用
const groupSection = yaml.slice(yaml.indexOf("proxy-groups:"), yaml.indexOf("rule-providers:"));
const allRefs = [...groupSection.matchAll(/^      - "?([^"\n]+)"?$/gm)].map((m) => m[1].trim());
const defined = new Set([...groups, ...proxyNames, ...entryNames, "DIRECT", "REJECT"]);
const dangling = [...new Set(allRefs.filter((r) => !defined.has(r)))];
t(`无悬空引用${dangling.length ? " (" + dangling.slice(0, 3) + ")" : ""}`, dangling.length === 0);

// Proton 相关（回归用，这两条都是线上实测踩出来的）
{
  const proton = {
    privateKey: "PK", expiresAt: Math.floor(Date.now()/1000)+604800,
    servers: [
      { name: "日本1", cc: "JP", ip: "1.1.1.1", port: 51820, pub: "A" },
      { name: "日本2", cc: "JP", ip: "1.1.1.2", port: 51820, pub: "B" },
      { name: "美国1", cc: "US", ip: "2.2.2.1", port: 51820, pub: "C" },
    ],
  };
  const r2 = buildConfig(warp, opera, proton);
  const y = r2.yaml;

  // WireGuard 的 UDP 从接入点发出，分到 IPv6 接入点的话
  // 纯 IPv4 机器上会全部 network is unreachable
  const dps = [...y.matchAll(/type: wireguard[\s\S]*?dialer-proxy: (\S+)/g)].map(m => m[1]);
  t(`Proton 接入点全是 IPv4 (${dps.length} 个)`,
    dps.length === 3 && dps.every(d => !d.startsWith("v6-")));

  // 10.2.0.1 是隧道内网 DNS，配上会让解析请求自己路由回 Proton 节点，死循环
  t("Proton 节点不带隧道内 DNS", !/10\.2\.0\.1/.test(y));

  const gs2 = [...y.matchAll(/^  - name: (.+)$/gm)].map(m => m[1]);
  t("Proton线路 是 select 组", /- name: Proton线路\n    type: select/.test(y));
  t("按国家分组", gs2.includes("Proton-日本") && gs2.includes("Proton-美国"));
  t("有自动选择组", gs2.includes("Proton-自动"));

  const jp = y.split("  - name: Proton-日本")[1].split("\n  - name:")[0];
  t("国家组只含该国节点",
    jp.includes("日本1") && jp.includes("日本2") && !jp.includes("美国1"));
}

// Windscribe（和 Opera 同构，但只轮接入点不做笛卡尔积）
{
  const wind = {
    username: "WU", password: "WP",
    servers: [
      { tag: "香港1", loc: "香港", host: "hk-016.totallyacdn.com", port: 443 },
      { tag: "香港2", loc: "香港", host: "hk-014.totallyacdn.com", port: 443 },
      { tag: "英国1", loc: "英国", host: "uk-048.totallyacdn.com", port: 443 },
    ],
  };
  const r3 = buildConfig(warp, opera, null, wind);
  const y = r3.yaml;
  const gs3 = [...y.matchAll(/^  - name: (.+)$/gm)].map((m) => m[1]);

  t(`Windscribe 节点 ${r3.wind} 个`, r3.wind === 3);
  t("Windscribe线路 是 select 组", /- name: Windscribe线路\n    type: select/.test(y));
  t("按地区分组", gs3.includes("WS-香港") && gs3.includes("WS-英国"));
  t("有自动选择组", gs3.includes("WS-自动"));

  const hk = y.split("  - name: WS-香港")[1].split("\n  - name:")[0];
  t("地区组只含该地区节点",
    hk.includes("WS-香港1") && hk.includes("WS-香港2") && !hk.includes("WS-英国1"));

  // 同 Proton：dialer-proxy 只能是 IPv4 接入点
  const wdp = [...y.matchAll(/name: "WS-[^"]+"[^\n]*dialer-proxy: (\S+)\}/g)].map((m) => m[1]);
  t(`Windscribe 接入点全是 IPv4 (${wdp.length} 个)`,
    wdp.length === 3 && wdp.every((d) => !d.startsWith("v6-")));

  const sel3 = y.split("  - name: 🚀 节点选择")[1].split("\n  - name:")[0];
  t("节点选择含 Windscribe线路", sel3.includes("Windscribe线路"));

  // 没传 wind 时不该冒出任何 WS 相关的东西
  t("不传 wind 就没有 WS 分组", !buildConfig(warp, opera).yaml.includes("Windscribe线路"));

  // 悬空引用（含 Windscribe 分组）
  const gsec = y.slice(y.indexOf("proxy-groups:"), y.indexOf("rule-providers:"));
  const refs3 = [...gsec.matchAll(/^      - "?([^"\n]+)"?$/gm)].map((m) => m[1].trim());
  const names3 = [...y.matchAll(/^  - \{name: "([^"]+)"/gm)].map((m) => m[1]);
  const ents3 = [...y.matchAll(/^  - name: (\S+)\n    type: masque$/gm)].map((m) => m[1]);
  const def3 = new Set([...gs3, ...names3, ...ents3, "DIRECT", "REJECT"]);
  const dang3 = [...new Set(refs3.filter((r) => !def3.has(r)))];
  t(`无悬空引用${dang3.length ? " (" + dang3.slice(0, 3) + ")" : ""}`, dang3.length === 0);
}

// AI 分组
{
  const y = buildConfig(warp, opera).yaml;
  const gs = [...y.matchAll(/^  - name: (.+)$/gm)].map((m) => m[1]);

  t("有 AI服务 分组", gs.includes("🤖 AI服务"));
  t("旧的 OpenAi 分组已改名", !gs.includes("🤖 OpenAi"));
  t("没有指向 OpenAi 的残留规则", !y.includes(",🤖 OpenAi"));

  // 各家都要能命中
  const must = [
    "anthropic.com", "grok.com", "perplexity.ai", "deepseek.com",
    "midjourney.com", "huggingface.co", "cursor.com", "elevenlabs.io",
    "mistral.ai", "meta.ai", "openrouter.ai", "kimi.com",
  ];
  const miss = must.filter((d) => !y.includes(`DOMAIN-SUFFIX,${d},🤖 AI服务`));
  t(`覆盖各家 AI${miss.length ? " 缺:" + miss.slice(0, 3) : ""}`, miss.length === 0);

  // 共用域名不能进来，否则会把无关流量拽进 AI 分组
  const tooWide = ["googleapis.com", "cloudflare.com", "stripe.com", "sentry.io", "bing.com"];
  const bad = tooWide.filter((d) => y.includes(`DOMAIN-SUFFIX,${d},🤖 AI服务`));
  t(`没有过宽的共用域名${bad.length ? " (" + bad + ")" : ""}`, bad.length === 0);

  // 内联规则必须排在 RULE-SET 之前，否则会被上游更宽的条目抢先命中
  const rs = y.indexOf("  - RULE-SET,");
  const inl = y.indexOf("  - DOMAIN-SUFFIX,");
  t("内联 AI 规则排在 RULE-SET 前", inl > 0 && inl < rs);

  // 域名不能重复
  const ds = [...y.matchAll(/^  - DOMAIN-SUFFIX,([^,]+),🤖 AI服务$/gm)].map((m) => m[1]);
  t(`AI 域名 ${ds.length} 条无重复`, new Set(ds).size === ds.length);

  // AI 分组要能选到所有落地
  const ai = y.split("  - name: 🤖 AI服务")[1].split("\n  - name:")[0];
  t("AI服务 能选地区线路", ai.includes("亚洲线路"));
  t("AI服务 能选 WARP直连", ai.includes("WARP直连"));
}

console.log(`\n通过 ${pass} 失败 ${fail}`);
if (fail) process.exit(1);
