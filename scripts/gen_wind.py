#!/usr/bin/env python3
"""在 GitHub runner 上注册一个 Windscribe 账号，推给 Worker。

为什么不在 Worker 里做：Cloudflare 的出口 IP 是全平台共享的，早被别人
拿去开过号。Windscribe 对这种 IP 直接发 status=2 的降额账号
（traffic_max=1MB），而且那种号连 /ServerCredentials 都取不到
（400 errorCode 1700 "User unable to generate credentials"），
等于完全不可用 —— 不是"额度小一点"的问题。

runner 的 IP 每次都不一样且相对干净，所以开户放这里。
"""
import hashlib
import json
import os
import secrets
import string
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# 浏览器扩展里硬编码的，认证就是 md5(它 + 当前秒数)
CLIENT_AUTH_SECRET = "952b4412f002315aa50751032fcaab03"
API = "https://api.windscribe.com"

HDR = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/103.0.5060.53 Safari/537.36",
    "Origin": "chrome-extension://hnmpcagpplmpfojmgmnngilcnanddlhb",
    "Accept": "application/json",
}


def auth_hash():
    t = int(time.time())
    return hashlib.md5((CLIENT_AUTH_SECRET + str(t)).encode()).hexdigest(), t


def post(url, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={**HDR, "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"errorMessage": raw[:200]}


def register():
    h, t = auth_hash()
    user = "u" + "".join(secrets.choice(string.ascii_lowercase + string.digits)
                         for _ in range(9))
    pw = "".join(secrets.choice(string.ascii_letters + string.digits)
                 for _ in range(16)) + "!aA9"
    st, body = post(f"{API}/Users", {
        "client_auth_hash": h, "time": str(t), "session_type_id": "2",
        "username": user, "password": pw,
    })
    if st == 429:
        raise SystemExit("被限速了，等一会儿重跑流水线")
    d = body.get("data")
    if not d:
        raise SystemExit(f"开户失败 HTTP {st}: {body.get('errorMessage', body)}")
    if d.get("status") != 1:
        # 这台 runner 的 IP 之前被人用过。重跑一次通常会换一台
        raise SystemExit(
            f"拿到的是降额账号 status={d['status']} "
            f"traffic_max={d.get('traffic_max')}，"
            "这台 runner 的 IP 被用过了，重跑一次流水线")
    return {
        "username": user, "password": pw,
        "userId": d["user_id"],
        "sessionAuthHash": d["session_auth_hash"],
        "locHash": d["loc_hash"],
        "trafficMax": d["traffic_max"],
        "status": d["status"],
        "registeredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def verify(acc):
    """确认这个号真能取到代理凭据。降额号在这一步会 400。"""
    h, t = auth_hash()
    q = urllib.parse.urlencode({
        "client_auth_hash": h, "session_auth_hash": acc["sessionAuthHash"],
        "time": str(t)})
    req = urllib.request.Request(f"{API}/ServerCredentials?{q}", headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read()).get("data")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"账号取不到代理凭据 HTTP {e.code}: {e.read().decode()[:200]}")
    if not d:
        raise SystemExit("账号取不到代理凭据")
    return d


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "dist"
    os.makedirs(out, exist_ok=True)

    acc = register()
    verify(acc)     # 开完就验一次，别把不能用的号推给 Worker

    path = os.path.join(out, "wind-account.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(acc, f, ensure_ascii=False)

    gb = acc["trafficMax"] / 1073741824
    print(f"账号 {acc['userId']} 额度 {gb:.2f} GB，凭据可取")
    print(f"已写入 {path}")


if __name__ == "__main__":
    main()
