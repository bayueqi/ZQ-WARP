// Proton 凭据解析与节点生成。
//
// Worker 不做 Proton 登录 —— 那需要 SRP，而且服务端风控会拦掉非官方客户端指纹。
// 凭据由 Actions 流水线（scripts/gen_proton.py）产出一段 base64 文本，
// 用户粘贴进管理页，这里只负责解析和拼配置。
//
// 证书最长 7 天（实测 Duration 写再长也封顶），过期要重跑流水线。

/** 解析粘贴进来的 blob。格式错误要给出能自己解决的提示。 */
export function parseBlob(text) {
  const raw = String(text || "").trim().replace(/\s+/g, "");
  if (!raw) throw new Error("内容为空");

  let obj;
  try {
    obj = JSON.parse(atob(raw));
  } catch {
    throw new Error("解析失败，确认复制完整了（应该是一长串字母数字，没有换行）");
  }

  if (obj.v !== 1) throw new Error(`不认识的版本 v${obj.v}，流水线和 Worker 版本对不上`);
  if (!obj.privateKey || !Array.isArray(obj.servers) || !obj.servers.length) {
    throw new Error("内容不完整，重跑一次流水线");
  }
  if (obj.expiresAt && obj.expiresAt * 1000 < Date.now()) {
    throw new Error("这份凭据已经过期了，重跑流水线拿新的");
  }
  return obj;
}

/** 生成 Proton WireGuard 节点。dialerProxy 非空时挂在 MASQUE 后面。 */
export function protonNodes(proton, dialerProxy) {
  return proton.servers.map((s) => {
    const dp = dialerProxy ? `\n    dialer-proxy: ${dialerProxy}` : "";
    return `  - name: "${s.name}"
    type: wireguard
    server: ${s.ip}
    port: ${s.port}
    ip: 10.2.0.2
    private-key: ${proton.privateKey}
    public-key: ${s.pub}
    udp: true
    mtu: 1280
    remote-dns-resolve: true
    dns: [10.2.0.1]${dp}`;
  });
}

export const protonNames = (proton) => proton.servers.map((s) => s.name);
