// Cloudflare WARP 注册 + MASQUE 公钥 enroll。
// 全程 fetch + WebCrypto，Workers 原生能跑。
const API = "https://api.cloudflareclient.com/v0a4471";
const H = {
  "User-Agent": "WARP for Android",
  "CF-Client-Version": "a-6.35-4471",
  "Content-Type": "application/json; charset=UTF-8",
};

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

function randB64(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a));
}

function randHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// CF 要 "2006-01-02T15:04:05.000-07:00" 这个格式
function cfTime() {
  return new Date().toISOString().replace("Z", "+00:00");
}

/** 注册一台新 WARP 设备并把 MASQUE 公钥挂上去。 */
export async function registerWarp(deviceName = "cf-worker") {
  const reg = await fetch(`${API}/reg`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      key: randB64(32),
      install_id: "",
      fcm_token: "",
      tos: cfTime(),
      model: "PC",
      serial_number: randHex(8),
      os_version: "",
      key_type: "curve25519",
      tunnel_type: "wireguard",
      locale: "en-US",
    }),
  });
  if (!reg.ok) {
    throw new Error(`WARP 注册失败 ${reg.status}: ${(await reg.text()).slice(0, 200)}`);
  }
  const acc = await reg.json();

  // MASQUE 用 P-256，和 WireGuard 那套密钥不通用
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = b64(await crypto.subtle.exportKey("spki", kp.publicKey));
  const pkcs8 = b64(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  // mihomo 要 SEC1，WebCrypto 只给 PKCS8，得转一道
  const sec1 = pkcs8ToSec1(pkcs8);

  const patch = await fetch(`${API}/reg/${acc.id}`, {
    method: "PATCH",
    headers: { ...H, Authorization: `Bearer ${acc.token}` },
    body: JSON.stringify({
      key: spki,
      key_type: "secp256r1",
      tunnel_type: "masque",
      name: deviceName,
    }),
  });
  if (!patch.ok) {
    throw new Error(`MASQUE enroll 失败 ${patch.status}: ${(await patch.text()).slice(0, 200)}`);
  }
  const up = await patch.json();

  // peer 公钥回来是 PEM，mihomo 要剥掉头尾的裸 base64
  const pem = up.config?.peers?.[0]?.public_key || "";
  const peerPub = pem.includes("-----")
    ? pem.split("\n").filter((l) => l && !l.startsWith("-----")).join("")
    : pem;

  return {
    deviceId: acc.id,
    token: acc.token,
    privateKey: sec1,
    peerPublicKey: peerPub,
    ipv4: up.config?.interface?.addresses?.v4 || acc.config?.interface?.addresses?.v4,
    ipv6: up.config?.interface?.addresses?.v6 || acc.config?.interface?.addresses?.v6,
    registeredAt: new Date().toISOString(),
  };
}

/** PKCS8 -> SEC1(RFC 5915)，带 P-256 曲线参数。
 *
 * WebCrypto 只能导出 PKCS8，mihomo 要 SEC1，直接喂会报
 * "use ParsePKCS8PrivateKey instead"。
 *
 * 但只把 PKCS8 里那段 OCTET STRING 抠出来还不够：WebCrypto 生成的
 * 内层 SEC1 省略了曲线参数（放在 PKCS8 外层的 AlgorithmIdentifier 里），
 * mihomo 会报 "unknown elliptic curve"。所以要重新编码一份带
 * [0] namedCurve 的完整 SEC1。
 *
 * SEC1 结构:
 *   SEQUENCE {
 *     INTEGER 1
 *     OCTET STRING  privateKey (32 字节)
 *     [0] { OID 1.2.840.10045.3.1.7 }   -- prime256v1
 *     [1] { BIT STRING publicKey }
 *   }
 */
export function pkcs8ToSec1(b64pkcs8) {
  const der = Uint8Array.from(atob(b64pkcs8), (c) => c.charCodeAt(0));

  // 读一个 DER TLV: [tag, 值起始, 值长度, 下一个 TLV 起始]
  const tlv = (pos) => {
    const tag = der[pos];
    let len = der[pos + 1];
    let p = pos + 2;
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | der[p + k];
      p += n;
    }
    return [tag, p, len, p + len];
  };

  let i = tlv(0)[1];            // 进最外层 SEQUENCE
  i = tlv(i)[3];                // 跳过 version
  i = tlv(i)[3];                // 跳过 AlgorithmIdentifier
  const [tag, start, len] = tlv(i);
  if (tag !== 0x04) throw new Error("PKCS8 结构不符合预期");

  // 内层 SEC1，可能已带也可能不带曲线参数
  const inner = der.subarray(start, start + len);
  let j = tlv2(inner, 0)[1];
  j = tlv2(inner, j)[3];                       // 跳过 version
  const [ptag, pstart, plen] = tlv2(inner, j); // privateKey OCTET STRING
  if (ptag !== 0x04) throw new Error("SEC1 结构不符合预期");
  const rawKey = inner.subarray(pstart, pstart + plen);

  // prime256v1 = 1.2.840.10045.3.1.7
  const oid = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
  const body = [
    0x02, 0x01, 0x01,                          // version = 1
    0x04, rawKey.length, ...rawKey,            // privateKey
    0xa0, oid.length, ...oid,                  // [0] namedCurve
  ];
  const out = [0x30, ...derLen(body.length), ...body];
  return btoa(String.fromCharCode(...out));
}

function tlv2(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  let p = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | buf[p + k];
    p += n;
  }
  return [tag, p, len, p + len];
}

function derLen(n) {
  if (n < 0x80) return [n];
  if (n < 0x100) return [0x81, n];
  return [0x82, n >> 8, n & 0xff];
}
