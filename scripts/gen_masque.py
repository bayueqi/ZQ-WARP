#!/usr/bin/env python3
"""
注册 Cloudflare WARP (MASQUE) 设备并生成 mihomo 配置。

需要先跑 usque register 拿到 config.json，本脚本负责把它转成
带全部可用 endpoint 的 mihomo yaml。

用法:
    python3 gen_masque.py <usque-config.json> <输出目录>
"""
import json
import os
import sys
import urllib.parse

# 全部经真机握手实测（2026-09-05，psg2）
# QUIC 回包不等于能建隧道：162.159.194/196/197/204 段与 v6 的 102/105 段
# 会回包但 login 失败，已剔除。
V4 = ["162.159.198.1", "162.159.198.2", "162.159.199.1", "162.159.199.2"]
V6 = ["2606:4700:103::1", "2606:4700:103::2",
      "2606:4700:104::1", "2606:4700:104::2"]
# 4443/8095 是后来补测出来的，实测 8/8 全通
PORTS = (443, 500, 1701, 4500, 4443, 8443, 8095)

# CF 没有 A 记录指向 MASQUE 段，官方域名只能用在 SNI 上
OFFICIAL_SNI = "zt-masque.cloudflareclient.com"
SNI_NODE = ("162.159.198.1", 443)

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
    return "".join(
        ln.strip() for ln in pem.strip().splitlines()
        if ln.strip() and not ln.startswith("-----")
    )


def node(name, ip, port, priv, pub, v4, v6, sni=None):
    # 裸 IPv6 含冒号，YAML 里必须加引号否则被解析成映射
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


def node_name(ip, port):
    if ":" in ip:
        seg = ip.split(":")[2]
        tail = ip.rsplit(":", 1)[-1]
        return f"WARP6-{seg}-{tail}-{port}"
    return f"WARP-{'.'.join(ip.split('.')[2:])}-{port}"


def masque_links(cfg, priv, pub):
    """生成 Shadowrocket 用的 masque:// 链接。

    格式参数与字段名对齐 Shadowrocket 的 masque 实现：
    masque://<endpoint_ip>:<port>?publicKey=&privateKey=&ip=&dns=&udp=&cc=&flag=#<名称>
    publicKey 用剥掉 PEM 头尾的 base64 DER，privateKey 直接用 usque 的原值。
    逗号不转义（Shadowrocket 的 dns 字段接受逗号分隔）。
    """
    def enc(v):
        return urllib.parse.quote(str(v), safe="").replace("%2C", ",")

    lines = []
    for ip in V4 + V6:
        for port in PORTS:
            params = "&".join([
                "publicKey=" + enc(pub),
                "privateKey=" + enc(priv),
                "ip=" + enc(cfg["ipv4"]),
                "dns=" + enc("1.1.1.1, 8.8.8.8"),
                "udp=1",
                "cc=" + enc(""),
                "flag=" + enc("CDN"),
            ])
            host = "[%s]" % ip if ":" in ip else ip
            name = node_name(ip, port)
            lines.append("masque://%s:%d?%s#%s" % (host, port, params, enc(name)))
    return lines


def build(cfg):
    priv = cfg["private_key"].strip()
    if priv.startswith("-----"):
        priv = pem_to_b64der(priv)
    pub = pem_to_b64der(cfg["endpoint_pub_key"])
    v4, v6 = cfg["ipv4"], cfg["ipv6"]

    names, proxies = [], []
    for ip in V4 + V6:
        for port in PORTS:
            name = node_name(ip, port)
            names.append(name)
            proxies.append(node(name, ip, port, priv, pub, v4, v6))

    names.append("WARP-官方域名")
    proxies.append(node("WARP-官方域名", SNI_NODE[0], SNI_NODE[1],
                        priv, pub, v4, v6, OFFICIAL_SNI))

    ind = lambda lst, n=6: "\n".join(" " * n + f"- {x}" for x in lst)

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

    links = masque_links(cfg, priv, pub)

    return links, f"""# Cloudflare WARP over MASQUE - mihomo 配置
# 由 GitHub Actions 自动生成，请勿手工编辑
# 需要 mihomo Alpha 分支：稳定版没有 masque outbound
#
# 节点 {len(names)} 个，endpoint 均经真机握手实测。
# private-key 等同账号凭据。

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
      - 🔄 故障转移
      - ☑️ 手动切换
      - DIRECT

  - name: ☑️ 手动切换
    type: select
    proxies:
{ind(names)}

  - name: ♻️ 自动选择
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: false
    proxies:
{ind(names)}

  - name: 🔄 故障转移
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 180
    proxies:
{ind(names)}

  - name: 📹 油管视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
      - ☑️ 手动切换
      - DIRECT

  - name: 🎥 奈飞视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
      - ☑️ 手动切换
      - DIRECT

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
      - ☑️ 手动切换
      - DIRECT

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
""", len(names)


def main():
    if len(sys.argv) < 3:
        print("用法: gen_masque.py <usque-config.json> <输出目录>", file=sys.stderr)
        sys.exit(1)
    src, outdir = sys.argv[1], sys.argv[2]
    with open(src) as f:
        cfg = json.load(f)

    os.makedirs(outdir, exist_ok=True)
    links, yaml, count = build(cfg)

    path = os.path.join(outdir, "warp-masque.yaml")
    with open(path, "w") as f:
        f.write(yaml)

    txt = os.path.join(outdir, "warp-masque-shadowrocket.txt")
    with open(txt, "w") as f:
        f.write("\n".join(links) + "\n")

    print(f"已生成 {path}")
    print(f"已生成 {txt}（{len(links)} 条 masque:// 链接）")
    print(f"节点数 {count}")
    print(f"内网地址 {cfg['ipv4']} / {cfg['ipv6']}")


if __name__ == "__main__":
    main()
