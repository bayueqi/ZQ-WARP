#!/usr/bin/env python3
"""登录 Proton，产出一段可粘贴进 Worker 的凭据文本。

Worker 不碰 Proton 登录（那会触发风控），只消费这段文本。
证书最长 7 天，过期重跑本流水线换新的。

用法: PROTON_USER=x PROTON_PASS=y python3 gen_proton.py <输出目录>
"""
import asyncio, base64, hashlib, json, os, sys, time
from proton.session import Session
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

# 只挑这些国家的落地，够用且不会让配置爆炸
WANT = {"JP": "日本", "SG": "新加坡", "US": "美国", "NL": "荷兰",
        "CH": "瑞士", "CA": "加拿大", "PL": "波兰", "RO": "罗马尼亚",
        "NO": "挪威", "MX": "墨西哥"}
PER_COUNTRY = 3     # 每国取几台


def ed25519_to_wg(raw_sk: bytes) -> str:
    """Proton 的 wg 私钥是从 Ed25519 私钥推的：SHA512 前 32 字节 + clamp。"""
    h = bytearray(hashlib.sha512(raw_sk).digest()[:32])
    h[0] &= 248
    h[31] &= 127
    h[31] |= 64
    return base64.b64encode(bytes(h)).decode()


async def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "dist"
    s = Session(appversion="linux-vpn@4.8.2",
                user_agent="ProtonVPN/4.8.2 (Linux; Ubuntu/24.04)")

    if not await s.async_authenticate(os.environ["PROTON_USER"],
                                      os.environ["PROTON_PASS"]):
        sys.exit("登录失败：账号密码不对，或触发了风控（等十几分钟再试）")
    print("登录成功")

    vpn = (await s.async_api_request("/vpn/v2")).get("VPN", {})
    print(f"套餐 {vpn.get('PlanName')} / Tier {vpn.get('MaxTier')} / 最大连接 {vpn.get('MaxConnect')}")

    # 申请证书。Duration 写多久都封顶 7 天，实测过
    sk = ed25519.Ed25519PrivateKey.generate()
    pem = sk.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    raw = sk.private_bytes(serialization.Encoding.Raw,
                           serialization.PrivateFormat.Raw,
                           serialization.NoEncryption())
    cert = await s.async_api_request("/vpn/v1/certificate", jsondata={
        "ClientPublicKey": pem, "Mode": "session",
        "Duration": "10080 min", "DeviceName": "worker",
    })
    exp = cert["ExpirationTime"]
    wg_sk = ed25519_to_wg(raw)
    print(f"证书到期 {time.strftime('%F %T', time.gmtime(exp))} UTC "
          f"（{(exp - time.time()) / 86400:.1f} 天）")

    # 服务器列表，只要免费的
    lg = await s.async_api_request("/vpn/logicals")
    free = [x for x in lg["LogicalServers"] if x.get("Tier") == 0]

    picked, by_cc = [], {}
    for srv in sorted(free, key=lambda x: x.get("Score", 99)):
        cc = srv["ExitCountry"]
        if cc not in WANT or by_cc.get(cc, 0) >= PER_COUNTRY:
            continue
        phys = (srv.get("Servers") or [{}])[0]
        pub = phys.get("X25519PublicKey")
        ip = phys.get("EntryIP")
        if not (pub and ip):
            continue
        by_cc[cc] = by_cc.get(cc, 0) + 1
        picked.append({
            "name": f"{WANT[cc]}{by_cc[cc]}",
            "cc": cc, "ip": ip, "port": 51820, "pub": pub,
        })

    print(f"选中 {len(picked)} 台，覆盖 {len(by_cc)} 国: "
          + " ".join(f"{c}x{n}" for c, n in sorted(by_cc.items())))

    payload = {
        "v": 1,
        "privateKey": wg_sk,
        "expiresAt": exp,
        "generatedAt": int(time.time()),
        "servers": picked,
    }

    os.makedirs(outdir, exist_ok=True)
    # 压成一行 base64，方便整段复制粘贴，不会被换行搞乱
    blob = base64.b64encode(
        json.dumps(payload, separators=(",", ":")).encode()).decode()

    with open(os.path.join(outdir, "proton-blob.txt"), "w") as f:
        f.write(blob + "\n")
    with open(os.path.join(outdir, "proton.json"), "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"\n已生成 {outdir}/proton-blob.txt（{len(blob)} 字符）")
    print("把这段整个复制，粘贴到 Worker 管理页的 Proton 凭据框即可。")


asyncio.run(main())
