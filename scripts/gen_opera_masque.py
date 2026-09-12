#!/usr/bin/env python3
"""生成 Opera VPN over Cloudflare WARP(MASQUE) 的 mihomo 配置。

链路: 本机 -> MASQUE 接入点 -> Opera 落地 -> 目标

每个 Opera 落地和每个 MASQUE 接入点都组合一遍，任一环失效都有替代路径。
MASQUE 那一跳把 Opera 的地址完全藏进 QUIC 隧道，本机侧只看得到
162.159.198.x 这类 Cloudflare 地址。

用法:
    python3 gen.py <usque-config.json> <opera-proxy 路径> <输出目录>
"""
import json
import os
import re
import subprocess
import sys

# MASQUE 接入点。均经真机握手实测（2026-09-05，psg2）：
# QUIC 回包不等于能建隧道，162.159.194/196/197/204 与 v6 的 102/105 段
# 会回包但 login 失败，不要往回加。
V4 = ["162.159.198.1", "162.159.198.2", "162.159.199.1", "162.159.199.2"]
V6 = ["2606:4700:103::1", "2606:4700:103::2",
      "2606:4700:104::1", "2606:4700:104::2"]
# 4443/8095 是后来补测出来的，实测 8/8 全通
PORTS = (443, 500, 1701, 4500, 4443, 8443, 8095)

# CF 没有 A 记录指向 MASQUE 段，官方域名只能用在 SNI 上
OFFICIAL_SNI = "zt-masque.cloudflareclient.com"
SNI_NODE = ("162.159.198.1", 443)

# Opera VPN 只有三个大区，没有国家级选项
REGIONS = {"AS": "亚洲", "EU": "欧洲", "AM": "美洲"}

RS = "https://raw.githubusercontent.com"
RULESETS = [
    ("🎯 全球直连", f"{RS}/cmliu/ACL4SSR/refs/heads/main/Clash/CFnat.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/UnBan.list"),
    ("🛑 全球拦截", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/BanAD.list"),
    ("🍃 应用净化", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list"),
    ("🍃 应用净化", f"{RS}/cmliu/ACL4SSR/main/Clash/adobe.list"),
    ("🍃 应用净化", f"{RS}/cmliu/ACL4SSR/main/Clash/IDM.list"),
    ("📢 谷歌FCM", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/GoogleFCM.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/GoogleCN.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/SteamCN.list"),
    ("Ⓜ️ 微软服务", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Microsoft.list"),
    ("🍎 苹果服务", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Apple.list"),
    ("📲 电报信息", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Telegram.list"),
    ("🤖 AI服务", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list"),
    ("🤖 AI服务", f"{RS}/juewuy/ShellClash/master/rules/ai.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/Copilot.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/GithubCopilot.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/Claude.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/Gemini.list"),
    ("📹 油管视频", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/YouTube.list"),
    ("🎥 奈飞视频", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Netflix.list"),
    ("🌍 国外媒体", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list"),
    ("🌍 国外媒体", f"{RS}/cmliu/ACL4SSR/main/Clash/Emby.list"),
    ("🚀 节点选择", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ProxyLite.list"),
    ("🚀 节点选择", f"{RS}/cmliu/ACL4SSR/main/Clash/CMBlog.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list"),
]

# 规则集只盖到 OpenAI / Claude / Gemini / Copilot，其他家没人维护。
# 这批是自己补的。别往里加 googleapis.com、cloudflare.com 这类共用域名，
# 会把大量无关流量拽进 AI 分组。和 worker/src/config.js 里那份保持一致。
AI_DOMAINS = [
    "openai.fm", "operator.chatgpt.com", "chat.com", "anthropic.com",
    "claude.ai", "claudeusercontent.com", "gemini.google.com", "aistudio.google.com",
    "generativelanguage.googleapis.com", "notebooklm.google.com", "notebooklm.google", "labs.google",
    "deepmind.com", "x.ai", "grok.com", "meta.ai",
    "perplexity.ai", "pplx.ai", "perplexity.com", "mistral.ai",
    "chat.mistral.ai", "cohere.com", "cohere.ai", "ai21.com",
    "together.ai", "together.xyz", "fireworks.ai", "groq.com",
    "huggingface.co", "hf.co", "huggingface.js.org", "replicate.com",
    "replicate.delivery", "runpod.io", "modal.com", "openrouter.ai",
    "poe.com", "quora.com", "cursor.com", "cursor.sh",
    "codeium.com", "windsurf.com", "tabnine.com", "sourcegraph.com",
    "phind.com", "v0.dev", "v0.app", "bolt.new",
    "lovable.dev", "devin.ai", "cognition.ai", "midjourney.com",
    "stability.ai", "stablediffusionweb.com", "leonardo.ai", "runwayml.com",
    "pika.art", "lumalabs.ai", "ideogram.ai", "recraft.ai",
    "krea.ai", "civitai.com", "elevenlabs.io", "eleven-labs.com",
    "play.ht", "suno.com", "suno.ai", "udio.com",
    "assemblyai.com", "deepgram.com", "you.com", "kagi.com",
    "exa.ai", "tavily.com", "jasper.ai", "copy.ai",
    "writesonic.com", "notion.so", "langchain.com", "langsmith.com",
    "wandb.ai", "weightsandbiases.com", "pinecone.io", "weaviate.io",
    "qdrant.tech", "chromadb.com", "deepseek.com", "moonshot.cn",
    "moonshotai.com", "kimi.com", "bigmodel.cn", "zhipuai.cn",
    "z.ai", "minimaxi.com", "minimax.io", "hailuoai.com",
    "siliconflow.cn", "dashscope.aliyuncs.com",
]


def pem_to_b64der(pem):
    return "".join(ln.strip() for ln in pem.strip().splitlines()
                   if ln.strip() and not ln.startswith("-----"))


def entry_name(ip, port):
    """接入点名字，短一些，后面要拼进组合节点名。"""
    if ":" in ip:
        seg = ip.split(":")[2]
        tail = ip.rsplit(":", 1)[-1]
        return f"v6-{seg}-{tail}-{port}"
    return f"{'.'.join(ip.split('.')[2:])}-{port}"


def masque_node(name, ip, port, priv, pub, v4, v6, sni=None):
    # 裸 IPv6 含冒号，YAML 里必须加引号否则被当成映射
    srv = f'"{ip}"' if ":" in ip else ip
    extra = f"\n    sni: {sni}" if sni else ""
    return f"""  - name: {name}
    type: masque
    server: {srv}
    port: {port}{extra}
    private-key: {priv}
    public-key: {pub}
    ip: {v4}
    ipv6: {v6}
    mtu: 1280
    udp: true
    remote-dns-resolve: true
    dns: [1.1.1.1, 2606:4700:4700::1111]"""


def opera_landings(binary):
    """跑 opera-proxy 拿匿名凭据和落地服务器清单。"""
    out = []
    for code, loc in REGIONS.items():
        r = subprocess.run([binary, "-country", code, "-list-proxies"],
                           capture_output=True, text=True, timeout=180)
        login = re.search(r"Proxy login: (\S+)", r.stdout)
        pw = re.search(r"Proxy password: (\S+)", r.stdout)
        if not (login and pw):
            print(f"警告: {code} 区取凭据失败，跳过", file=sys.stderr)
            continue
        seq = 0
        for line in r.stdout.splitlines():
            m = re.match(r"^([\w.-]+\.sec-tunnel\.com),([\d.]+),(\d+)$",
                         line.strip())
            if not m:
                continue
            host, ip, port = m.groups()
            seq += 1
            out.append({"loc": loc, "tag": f"{loc}{seq}", "host": host,
                        "ip": ip, "port": int(port),
                        "user": login.group(1), "pw": pw.group(1)})
    return out


def build(cfg, landings):
    priv = cfg["private_key"].strip()
    if priv.startswith("-----"):
        priv = pem_to_b64der(priv)
    pub = pem_to_b64der(cfg["endpoint_pub_key"])
    v4, v6 = cfg["ipv4"], cfg["ipv6"]

    # 1. 全部 MASQUE 接入点
    entries, proxies = [], []
    for ip in V4 + V6:
        for port in PORTS:
            n = entry_name(ip, port)
            entries.append(n)
            proxies.append(masque_node(n, ip, port, priv, pub, v4, v6))
    entries.append("官方域名")
    proxies.append(masque_node("官方域名", SNI_NODE[0], SNI_NODE[1],
                               priv, pub, v4, v6, OFFICIAL_SNI))

    # 2. 落地 × 接入点 全组合
    by_loc = {}
    for land in landings:
        for ent in entries:
            name = f"{land['tag']}@{ent}"
            by_loc.setdefault(land["loc"], []).append(name)
            proxies.append(
                f'  - {{name: "{name}", type: http, server: {land["ip"]}, '
                f'port: {land["port"]}, username: {land["user"]}, '
                f'password: {land["pw"]}, tls: true, sni: {land["host"]}, '
                f'skip-cert-verify: false, dialer-proxy: {ent}}}')

    combos = sum(len(v) for v in by_loc.values())

    def q(items, n=6):
        return "\n".join(" " * n + f'- "{x}"' for x in items)

    def plain(items, n=6):
        return "\n".join(" " * n + f"- {x}" for x in items)

    # 组合数太多，平铺在一个组里没法选，按地区收成 url-test
    loc_names = [f"{loc}线路" for loc in by_loc]
    loc_defs = "\n\n".join(f"""  - name: {loc}线路
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
{q(tags)}""" for loc, tags in by_loc.items())

    prov, rules = [], []
    for i, (group, url) in enumerate(RULESETS):
        pn = f"rule{i:02d}"
        prov.append(f"""  {pn}:
    type: http
    behavior: classical
    format: text
    interval: 86400
    url: {url}
    path: ./ruleset/{pn}.list""")
        rules.append(f"  - RULE-SET,{pn},{group}")

    # 内联的 AI 域名放在 RULE-SET 前面，别被上游更宽的条目抢先命中
    rules = [f"  - DOMAIN-SUFFIX,{d},🤖 AI服务" for d in AI_DOMAINS] + rules

    yaml = f"""# Opera VPN over Cloudflare WARP (MASQUE)
# 由 GitHub Actions 自动生成，请勿手工编辑
#
# 链路: 本机 -> MASQUE 接入点 -> Opera 落地 -> 目标
# 节点名 "欧洲1@198.1-443" = 欧洲第 1 个落地，经 162.159.198.1:443 接入。
#
# 接入点 {len(entries)} 个 x 落地 {len(landings)} 个 = 组合 {combos} 个。
# 任一接入点被墙或任一落地失效，其他组合仍可用。
#
# 需要 mihomo Alpha 分支：稳定版没有 masque outbound。
# private-key 等同 WARP 账号凭据，Opera 凭据为匿名注册且会过期。

mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true
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
  ipv6: true
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
      - https://8.8.8.8/dns-query

proxies:
{chr(10).join(proxies)}

proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - ♻️ 自动选择
{plain(loc_names)}
      - 🔄 故障转移

  - name: ♻️ 自动选择
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: true
    proxies:
{plain(loc_names)}

  - name: 🔄 故障转移
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 180
    lazy: true
    proxies:
{plain(loc_names)}

{loc_defs}

  - name: 📹 油管视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
{plain(loc_names)}

  - name: 🎥 奈飞视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
{plain(loc_names)}

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
{plain(loc_names)}

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
      - ♻️ 自动选择

rule-providers:
{chr(10).join(prov)}

rules:
{chr(10).join(rules)}
  - GEOIP,LAN,🎯 全球直连,no-resolve
  - GEOIP,CN,🎯 全球直连
  - MATCH,🐟 漏网之鱼
"""
    return yaml, len(entries), len(landings), combos


def main():
    if len(sys.argv) < 4:
        print("用法: gen.py <usque-config.json> <opera-proxy> <输出目录>",
              file=sys.stderr)
        sys.exit(1)
    cfg_path, opera_bin, outdir = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(cfg_path) as f:
        cfg = json.load(f)

    landings = opera_landings(opera_bin)
    if not landings:
        sys.exit("一个 Opera 落地都没取到，可能是源 IP 被限速，换台机器再试")

    yaml, n_entry, n_land, n_combo = build(cfg, landings)

    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, "opera-masque.yaml")
    with open(path, "w") as f:
        f.write(yaml)

    print(f"已生成 {path}")
    print(f"MASQUE 接入点 {n_entry} 个")
    print(f"Opera 落地   {n_land} 个: "
          + ", ".join(sorted({l['tag'] for l in landings})))
    print(f"组合节点     {n_combo} 个")


if __name__ == "__main__":
    main()
