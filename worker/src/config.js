// 生成 mihomo 配置：MASQUE 接入点 x Opera 落地 全组合。
// 接入点清单是真机握手实测筛过的，别往回加 162.159.194/196/197/204
// 和 v6 的 102/105 段 —— 它们回 QUIC 包但 login 失败。
//
// 端口 4443 和 8095 是后来补测出来的，4 个 v4 地址 x 这两个端口 8/8 全通。
const V4 = ["162.159.198.1", "162.159.198.2", "162.159.199.1", "162.159.199.2"];
const V6 = ["2606:4700:103::1", "2606:4700:103::2",
            "2606:4700:104::1", "2606:4700:104::2"];
const PORTS = [443, 500, 1701, 4500, 4443, 8443, 8095];

// CF 没有 A 记录指向 MASQUE 段，官方域名只能用在 SNI 上
const OFFICIAL_SNI = "zt-masque.cloudflareclient.com";
const SNI_NODE = ["162.159.198.1", 443];

const RS = "https://raw.githubusercontent.com";
const RULESETS = [
  ["🎯 全球直连", RS + "/cmliu/ACL4SSR/refs/heads/main/Clash/CFnat.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/UnBan.list"],
  ["🛑 全球拦截", RS + "/ACL4SSR/ACL4SSR/master/Clash/BanAD.list"],
  ["🍃 应用净化", RS + "/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list"],
  ["🍃 应用净化", RS + "/cmliu/ACL4SSR/main/Clash/adobe.list"],
  ["🍃 应用净化", RS + "/cmliu/ACL4SSR/main/Clash/IDM.list"],
  ["📢 谷歌FCM", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/GoogleFCM.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/GoogleCN.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/SteamCN.list"],
  ["Ⓜ️ 微软服务", RS + "/ACL4SSR/ACL4SSR/master/Clash/Microsoft.list"],
  ["🍎 苹果服务", RS + "/ACL4SSR/ACL4SSR/master/Clash/Apple.list"],
  ["📲 电报信息", RS + "/ACL4SSR/ACL4SSR/master/Clash/Telegram.list"],
  ["🤖 AI服务", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list"],
  ["🤖 AI服务", RS + "/juewuy/ShellClash/master/rules/ai.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/Copilot.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/GithubCopilot.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/Claude.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/Gemini.list"],
  ["📹 油管视频", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/YouTube.list"],
  ["🎥 奈飞视频", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Netflix.list"],
  ["🌍 国外媒体", RS + "/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list"],
  ["🌍 国外媒体", RS + "/cmliu/ACL4SSR/main/Clash/Emby.list"],
  ["🚀 节点选择", RS + "/ACL4SSR/ACL4SSR/master/Clash/ProxyLite.list"],
  ["🚀 节点选择", RS + "/cmliu/ACL4SSR/main/Clash/CMBlog.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list"]
];

function entryName(ip, port) {
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `v6-${parts[2]}-${parts[parts.length - 1]}-${port}`;
  }
  return `${ip.split(".").slice(2).join(".")}-${port}`;
}

function masqueNode(name, ip, port, priv, pub, v4, v6, sni) {
  // 裸 IPv6 含冒号，YAML 里必须加引号否则被当成映射
  const srv = ip.includes(":") ? `"${ip}"` : ip;
  const extra = sni ? `\n    sni: ${sni}` : "";
  return `  - name: ${name}
    type: masque
    server: ${srv}
    port: ${port}${extra}
    private-key: ${priv}
    public-key: ${pub}
    ip: ${v4}
    ipv6: ${v6}
    mtu: 1280
    udp: true
    remote-dns-resolve: true
    dns: [1.1.1.1, 2606:4700:4700::1111]`;
}

/** 生成全部 MASQUE 接入点。两种配置都用这批。 */
function buildEntries(warp) {
  const { privateKey: priv, peerPublicKey: pub, ipv4: v4, ipv6: v6 } = warp;
  const entries = [], proxies = [];
  // v4Entries 单独留一份：做 dialer-proxy 目标时只能用 IPv4，
  // 否则纯 IPv4 的机器上会直接 "network is unreachable"。
  const v4Entries = [];
  for (const ip of [...V4, ...V6]) {
    for (const port of PORTS) {
      const n = entryName(ip, port);
      entries.push(n);
      if (!ip.includes(":")) v4Entries.push(n);
      proxies.push(masqueNode(n, ip, port, priv, pub, v4, v6));
    }
  }
  entries.push("官方域名");
  v4Entries.push("官方域名");   // 官方域名节点本身连的是 IPv4
  proxies.push(masqueNode("官方域名", SNI_NODE[0], SNI_NODE[1],
                          priv, pub, v4, v6, OFFICIAL_SNI));
  return { entries, proxies, v4Entries };
}

// 规则集只盖到 OpenAI / Claude / Gemini / Copilot，其他家没人维护。
// 这批是自己补的，走 DOMAIN-SUFFIX 精确匹配。
//
// 注意别往里加 googleapis.com、cloudflare.com、stripe.com 这类共用域名 ——
// 上游的 ai.list 就干了这事（它把整个 googleapis.com 和 bing.com 都算 AI），
// 会把大量无关流量拽进 AI 分组。这里只放各家自己的域名。
const AI_DOMAINS = [
  // OpenAI（规则集已有 openai.com/chatgpt.com/sora.com，这几个是补的）
  "openai.fm", "operator.chatgpt.com", "chat.com",
  // Anthropic
  "anthropic.com", "claude.ai", "claudeusercontent.com",
  // Google
  "gemini.google.com", "aistudio.google.com", "generativelanguage.googleapis.com",
  "notebooklm.google.com", "notebooklm.google", "labs.google", "deepmind.com",
  // xAI
  "x.ai", "grok.com",
  // Meta
  "meta.ai",
  // Perplexity
  "perplexity.ai", "pplx.ai", "perplexity.com",
  // Mistral
  "mistral.ai", "chat.mistral.ai",
  // Cohere / AI21 / Together / Fireworks / Groq
  "cohere.com", "cohere.ai", "ai21.com", "together.ai", "together.xyz",
  "fireworks.ai", "groq.com",
  // 开源社区与推理平台
  "huggingface.co", "hf.co", "huggingface.js.org",
  "replicate.com", "replicate.delivery", "runpod.io", "modal.com",
  "openrouter.ai", "poe.com", "quora.com",
  // 编程助手
  "cursor.com", "cursor.sh", "codeium.com", "windsurf.com",
  "tabnine.com", "sourcegraph.com", "phind.com", "v0.dev", "v0.app",
  "bolt.new", "lovable.dev", "devin.ai", "cognition.ai",
  // 图像与视频
  "midjourney.com", "stability.ai", "stablediffusionweb.com",
  "leonardo.ai", "runwayml.com", "pika.art", "lumalabs.ai",
  "ideogram.ai", "recraft.ai", "krea.ai", "civitai.com",
  // 语音
  "elevenlabs.io", "eleven-labs.com", "play.ht", "suno.com", "suno.ai",
  "udio.com", "assemblyai.com", "deepgram.com",
  // 搜索与写作
  "you.com", "kagi.com", "exa.ai", "tavily.com",
  "jasper.ai", "copy.ai", "writesonic.com", "notion.so",
  // 观测与工具链
  "langchain.com", "langsmith.com", "wandb.ai", "weightsandbiases.com",
  "pinecone.io", "weaviate.io", "qdrant.tech", "chromadb.com",
  // 国产（默认也走代理，很多在国内反而连不上或要境外号）
  "deepseek.com", "moonshot.cn", "moonshotai.com", "kimi.com",
  "bigmodel.cn", "zhipuai.cn", "z.ai",
  "minimaxi.com", "minimax.io", "hailuoai.com",
  "siliconflow.cn", "dashscope.aliyuncs.com",
];

const q = (a, n = 6) => a.map((x) => " ".repeat(n) + `- "${x}"`).join("\n");
const p = (a, n = 6) => a.map((x) => " ".repeat(n) + `- ${x}`).join("\n");

/** rule-providers 和 rules，两种配置共用。 */
function buildRules() {
  const prov = [], rules = [];
  RULESETS.forEach(([group, url], i) => {
    const pn = `rule${String(i).padStart(2, "0")}`;
    prov.push(`  ${pn}:
    type: http
    behavior: classical
    format: text
    interval: 86400
    url: ${url}
    path: ./ruleset/${pn}.list`);
    rules.push(`  - RULE-SET,${pn},${group}`);
  });
  // 内联的 AI 域名放在 RULE-SET 前面，别被上游规则集里更宽的条目抢先命中
  const ai = AI_DOMAINS.map((d) => `  - DOMAIN-SUFFIX,${d},🤖 AI服务`);
  return { prov: prov.join("\n"), rules: [...ai, ...rules].join("\n") };
}

/** 公共头部：端口、DNS、sniffer 那一堆。 */
function head(ipv6) {
  return `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: ${ipv6}
unified-delay: true
tcp-concurrent: true
find-process-mode: 'off'
external-controller: 127.0.0.1:9090

profile:
  store-selected: true
  store-fake-ip: true

sniffer:
  enable: true
  sniff:
    HTTP:
      ports: [80, 8080-8880]
      override-destination: true
    TLS:
      ports: [443, 8443]
    QUIC:
      ports: [443, 8443]
  skip-domain:
    - '+.push.apple.com'
    - '+.apple.com'

dns:
  enable: true
  listen: 0.0.0.0:1053
  ipv6: ${ipv6}
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - '+.lan'
    - '+.local'
    - '*.msftconnecttest.com'
    - '*.msftncsi.com'
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://223.5.5.5/dns-query
    - https://1.12.12.12/dns-query
  proxy-server-nameserver:
    - https://223.5.5.5/dns-query
  nameserver-policy:
    'geosite:cn,private':
      - https://223.5.5.5/dns-query
      - https://1.12.12.12/dns-query
    'geosite:geolocation-!cn':
      - https://1.1.1.1/dns-query
      - https://8.8.8.8/dns-query`;
}

/** 下游分组（油管/奈飞/OpenAI 那些），两种配置共用。
 *  picks 是给「节点选择」之外的组用的候选列表。 */
function tailGroups(picks) {
  return `  - name: 📹 油管视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
${p(picks)}

  - name: 🎥 奈飞视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
${p(picks)}

  - name: 🌍 国外媒体
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
      - 🎯 全球直连

  - name: 📲 电报信息
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🎯 全球直连

  - name: 🤖 AI服务
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
${p(picks)}

  - name: Ⓜ️ 微软服务
    type: select
    proxies:
      - 🎯 全球直连
      - 🚀 节点选择
      - ♻️ 自动选择

  - name: 🍎 苹果服务
    type: select
    proxies:
      - 🎯 全球直连
      - 🚀 节点选择
      - ♻️ 自动选择

  - name: 📢 谷歌FCM
    type: select
    proxies:
      - 🚀 节点选择
      - 🎯 全球直连
      - ♻️ 自动选择

  - name: 🎯 全球直连
    type: select
    proxies:
      - DIRECT
      - 🚀 节点选择
      - ♻️ 自动选择

  - name: 🛑 全球拦截
    type: select
    proxies:
      - REJECT
      - DIRECT

  - name: 🍃 应用净化
    type: select
    proxies:
      - REJECT
      - DIRECT

  - name: 🐟 漏网之鱼
    type: select
    proxies:
      - 🚀 节点选择
      - 🎯 全球直连
      - ♻️ 自动选择`;
}

export function buildConfig(warp, opera, proton, wind) {
  const { entries, proxies, v4Entries } = buildEntries(warp);

  // 笛卡尔积：任一接入点或任一落地失效，其他组合仍可用
  const byLoc = {};
  for (const land of opera.landings) {
    for (const ent of entries) {
      const name = `${land.tag}@${ent}`;
      (byLoc[land.loc] ||= []).push(name);
      proxies.push(
        `  - {name: "${name}", type: http, server: ${land.ip}, port: ${land.port}, ` +
        `username: ${opera.username}, password: ${opera.password}, tls: true, ` +
        `sni: ${land.host}, skip-cert-verify: false, dialer-proxy: ${ent}}`);
    }
  }
  const combos = Object.values(byLoc).reduce((a, b) => a + b.length, 0);

  // Proton 落地。28 台 x 41 接入点会爆到上千节点，没必要，
  // 每台轮着分一个接入点即可，接入点挂了还有其他 Proton 节点顶。
  //
  // 只从 v4Entries 里选：WireGuard 的 UDP 要经这个接入点发出去，
  // 分到 IPv6 接入点的话，没有 IPv6 的机器上会全部 network is unreachable。
  let protonNames = [];
  const protonByCC = {};   // 国家 -> 该国节点名，用来按国家分组
  if (proton && proton.servers && proton.servers.length) {
    proton.servers.forEach((srv, i) => {
      const ent = v4Entries[i % v4Entries.length];
      protonNames.push(srv.name);
      // 节点名形如「日本1」，去掉尾号就是国家名
      const cc = srv.name.replace(/\d+$/, "");
      (protonByCC[cc] = protonByCC[cc] || []).push(srv.name);
      proxies.push(`  - name: "${srv.name}"
    type: wireguard
    server: ${srv.ip}
    port: ${srv.port}
    ip: 10.2.0.2
    private-key: ${proton.privateKey}
    public-key: ${srv.pub}
    udp: true
    mtu: 1280
    dialer-proxy: ${ent}`);
    });
  }

  // Windscribe 落地。和 Opera 同构（HTTPS 代理 + Basic），
  // 但免费额度只有 2GB/月，做笛卡尔积没意义 —— 每台轮一个接入点就够。
  // 只从 v4Entries 选，理由同 Proton：纯 IPv4 的机器上 v6 接入点不可达。
  const windNames = [];
  const windByLoc = {};
  if (wind && wind.servers && wind.servers.length) {
    wind.servers.forEach((srv, i) => {
      const ent = v4Entries[i % v4Entries.length];
      const name = `WS-${srv.tag}`;
      windNames.push(name);
      (windByLoc[srv.loc] = windByLoc[srv.loc] || []).push(name);
      proxies.push(
        `  - {name: "${name}", type: http, server: ${srv.host}, port: ${srv.port}, ` +
        `username: ${wind.username}, password: ${wind.password}, tls: true, ` +
        `sni: ${srv.host}, skip-cert-verify: false, dialer-proxy: ${ent}}`);
    });
  }
  const windLocNames = Object.keys(windByLoc).map((l) => `WS-${l}`);
  const windLocDefs = Object.entries(windByLoc).map(([loc, names]) =>
    `  - name: WS-${loc}
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 100
    lazy: true
    proxies:
${q(names)}`).join("\n\n");

  // 组合太多没法平铺选，按地区收成 url-test
  const locNames = Object.keys(byLoc).map((l) => `${l}线路`);
  // 接入点本来就在 proxies 里（做 dialer-proxy 的目标），
  // 顺手暴露成一个直连组：套娃慢或落地挂了就切这个，一份订阅够用
  // Proton 按国家分组：外层能选国家，组内 url-test 自动挑最快的那台
  const protonCCNames = Object.keys(protonByCC).map((c) => `Proton-${c}`);
  const protonCCDefs = Object.entries(protonByCC).map(([cc, names]) =>
    `  - name: Proton-${cc}
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 100
    lazy: true
    proxies:
${q(names)}`).join("\n\n");

  const picks = [...locNames, "WARP直连"];
  if (protonNames.length) picks.push("Proton线路", ...protonCCNames);
  if (windNames.length) picks.push("Windscribe线路", ...windLocNames);
  const locDefs = Object.entries(byLoc).map(([loc, tags]) => `  - name: ${loc}线路
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
${q(tags)}`).join("\n\n");

  const { prov, rules } = buildRules();

  const yaml = `# Opera VPN over Cloudflare WARP (MASQUE)
# 由 Cloudflare Worker 生成于 ${new Date().toISOString()}
#
# 聚合版：套娃线路和 WARP 直连都在这一份里。
#
#   亚洲/欧洲/美洲线路  本机 -> MASQUE -> Opera 落地 -> 目标（能换出口国家）
#   WARP直连            本机 -> MASQUE -> 目标（出口是 CF 自己的 IP，快）
#
# 节点名 "欧洲1@198.1-443" = 欧洲第 1 个落地，经 162.159.198.1:443 接入。
#
# 接入点 ${entries.length} 个 x 落地 ${opera.landings.length} 个 = 组合 ${combos} 个，
# 外加 ${entries.length} 个直连接入点${protonNames.length ? ` 和 ${protonNames.length} 个 Proton 落地` : ""}${windNames.length ? ` 和 ${windNames.length} 个 Windscribe 落地` : ""}。
# 任一环失效都有替代路径。
#
# 需要 mihomo Alpha 分支：稳定版没有 masque outbound，也不认 dialer-proxy。
# private-key 等同 WARP 账号凭据，别外传。

${head(true)}

proxies:
${proxies.join("\n")}

proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - ♻️ 自动选择
${p(picks)}
      - 🔄 故障转移

  - name: ♻️ 自动选择
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: true
    proxies:
${p(picks)}

  - name: 🔄 故障转移
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 180
    lazy: true
    proxies:
${p(picks)}

${locDefs}

  - name: WARP直连
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: true
    proxies:
${q(entries)}
${protonNames.length ? `
  - name: Proton线路
    type: select
    proxies:
      - Proton-自动
${p(protonCCNames)}

  - name: Proton-自动
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
${q(protonNames)}

${protonCCDefs}
` : ""}${windNames.length ? `
  - name: Windscribe线路
    type: select
    proxies:
      - WS-自动
${p(windLocNames)}

  - name: WS-自动
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
${q(windNames)}

${windLocDefs}
` : ""}
${tailGroups(picks)}

rule-providers:
${prov}

rules:
${rules}
  - GEOIP,LAN,🎯 全球直连,no-resolve
  - GEOIP,CN,🎯 全球直连
  - MATCH,🐟 漏网之鱼
`;

  return { yaml, entries: entries.length, landings: opera.landings.length,
           combos, proton: protonNames.length, wind: windNames.length };
}
