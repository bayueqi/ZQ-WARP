# ZQ-WARP

一键生成 Cloudflare WARP 的 mihomo 配置，57 个节点，跑在 GitHub Actions 上。
不用自己装环境，不用服务器。

仓库里有两条流水线：

- **生成 WARP MASQUE 配置** — 纯 WARP，57 个节点。下面讲的就是这条。
- **Opera over MASQUE（套娃）** — 在 WARP 外面再叠一层 Opera VPN 落地，
  换个出口国家。见文末[套娃那条](#套娃opera-vpn-叠在-warp-上)。

另外 `worker/` 目录是套娃那条的 Worker 版本，部署到 Cloudflare 上自己每 4 小时
更新，带个状态页。见[跑在 Worker 上](#跑在-worker-上)。

## 怎么用

**1. Fork 这个仓库**

点右上角 Fork。

**2. 打开 Actions 页面**

Fork 过来的仓库默认不开 Actions，会看到一个提示，点
`I understand my workflows, go ahead and enable them` 就行。

**3. 跑一次**

左边选 `生成 WARP MASQUE 配置`，右边点 `Run workflow`，绿色按钮再点一次。
等一分钟左右。

**4. 下载**

跑完点进这次运行的页面，最下面 `Artifacts` 里有个 `warp-masque-config`，
下载解压。

**5. 导入客户端**

解压出来三个文件：

- `warp-masque.yaml` —— mihomo 配置，57 个节点，直接导入 Clash Verge / ClashMi 这类客户端
- `warp-masque-shadowrocket.txt` —— Shadowrocket 用的 `masque://` 链接，一行一个，挑一条复制进去
- `usque-config.json` —— 原始密钥，想自己折腾别的客户端时用得上

## 必须用 mihomo Alpha 内核

masque 只有 mihomo 的 Alpha 分支才有，稳定版导进去会直接报错说不认识这个类型。
所以客户端不光要是 mihomo 内核，还得能切到 Alpha。

**Windows / macOS / Linux**

[Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) —— 装完打开
`设置 → Clash 内核`，把内核换成 Alpha，等它下载完自动重启。

> 切内核和升级 Verge 本身是两回事。把程序更新到最新版**不会**让内核变成 Alpha，
> 得手动在这个页面切。没切就导入会报 `unsupport proxy type: masque`。

**Android**

[ClashMetaForAndroid](https://github.com/MetaCubeX/ClashMetaForAndroid/releases/tag/Prerelease-alpha)
—— 认准 `Prerelease-alpha` 那个 tag，正式版不行。

**iOS**

[ClashMi](https://github.com/KaringX/clashmi) —— 内置 mihomo 内核，
把 `warp-masque.yaml` 直接导进去就行。同一个 App 也有 macOS / Android /
Windows / Linux 版本。

Shadowrocket 也能用。它不吃 yaml，但 artifact 里已经带了
`warp-masque-shadowrocket.txt`，一行一个 `masque://` 链接，
挑一条复制进 Shadowrocket 就行。

**跨平台，也可以看看**

[FlClash](https://github.com/chen08209/FlClash) —— 界面比较新，Windows / macOS /
Linux / Android 都有。内核版本在设置里换。

**不用图形界面**

直接下 [mihomo Alpha](https://github.com/MetaCubeX/mihomo/releases/tag/Prerelease-Alpha)
二进制，`mihomo -d 配置目录` 跑起来就行。

### 这些用不了

Surge、Quantumult X、Karing 不是 mihomo 内核，也不认 masque，导进去没用。

## 关于节点

57 个节点是同一个 WARP 账号的不同接入地址，**出口 IP 是一样的**。
多节点是为了某个地址被墙时能自动换一个，不是多国家落地。
想选国家得用 WARP+ 或 ZeroTrust，这个仓库不支持。

里面有 28 个 IPv6 节点，你没 IPv6 的话它们会连不上，但客户端会自动跳过，
不影响用。

## 几个提醒

配置里的 `private-key` 相当于账号密码，别往外发。artifact 默认存 7 天，
公开仓库的 artifact 谁都能下载，介意就把 fork 出来的仓库设成私有。

想换一套密钥就重新跑一次 workflow，每次都是全新账号。

别写成定时任务高频跑，WARP 会风控封号。

## 常见问题

### 导入报「unsupport proxy type: masque」

完整报错长这样：

```
订阅配置校验失败，请检查订阅配置文件，变更已撤销
level=error msg="proxy 0: unsupport proxy type: masque"
```

**内核还是稳定版，没切到 Alpha。** 这是目前最多人踩的一个。

Clash Verge Rev 的切法：打开「设置 → Clash 内核」，选 Alpha，点切换，
等它下载完会自动重启内核。然后再导入配置。

注意切内核和更新程序本身是两回事，把 Verge 升到最新版并不会让内核变成 Alpha。

### Actions 页面有个黄色警告，要紧吗

如果你看到的是这个：

```
Node.js 20 is deprecated. The following actions target Node.js 20 ...
```

不影响结果，配置照样能生成。这个仓库已经升级到 node24 的 action 版本，
重新 Fork 或者同步一下上游就没有了。

Fork 早了的话，把 `.github/workflows/warp-masque.yml` 里这两行改一下：

```yaml
uses: actions/checkout@v6
uses: actions/upload-artifact@v6
```

### 为什么节点延迟不一样，但测速结果都差不多

57 个节点是同一个 WARP 账号的不同接入地址，**出口 IP 是同一个**。
延迟差异来自你到接入点的网络路径，真正落地的还是那台 Cloudflare 机器。

所以挑延迟最低的用就行，不用一个个试速度。

### artifact 过期了怎么办

重新跑一次 workflow，会生成一套全新的密钥和配置。artifact 默认存 7 天，
想留久一点在 Run workflow 的时候把保留天数改大。

### iOS 怎么用

用 [ClashMi](https://github.com/KaringX/clashmi)，它内置 mihomo 内核，
`warp-masque.yaml` 直接导入就行，和桌面端一样。

Shadowrocket 也支持 masque。它不认 yaml，但 artifact 里的
`warp-masque-shadowrocket.txt` 就是现成的 `masque://` 链接，
一行一个，复制一条导进去即可。

Surge、Quantumult X、Karing 不行。

### 能选国家吗

不能。免费 WARP 账号的出口由 Cloudflare 任播决定，你在哪就近落哪。
要指定落地得用 WARP+ 或者 ZeroTrust，这个仓库不支持。

### 跑 workflow 报 login failed

```
Failed to connect tunnel: login failed!
```

账号被 Cloudflare 风控了，通常是短时间内建连太频繁导致的。
重新跑一次 workflow 拿新账号就行，另外别把 workflow 改成定时高频跑。

## 想改配置

`scripts/gen_masque.py` 顶部三个常量控制节点池：

```python
V4    = [...]   # IPv4 接入地址
V6    = [...]   # IPv6 接入地址
PORTS = (...)   # 端口
```

分流规则用的是 ACL4SSR，改 `RULESETS` 那个列表。

---

## 套娃：Opera VPN 叠在 WARP 上

纯 WARP 的出口是 Cloudflare 自己的 IP，任播决定落地，选不了国家。
想换出口就得在后面再接一跳。

Opera 浏览器自带的免费 VPN 正好能干这个：底层是 SurfEasy 的标准 HTTPS 代理，
匿名注册、不限流量、连账号都不用。

```
本机 -> MASQUE 接入点 -> Opera 落地 -> 目标
```

### 为什么要套，不直接用 Opera

单用 Opera，你的机器直接连 `77.111.x.x`，这个段一查就知道是什么。
套上 MASQUE 之后本机只跟 `162.159.198.x` 这类 Cloudflare 地址通信，
Opera 的地址整个封在 QUIC 隧道里。抓包对比过，直连能看到 Opera 服务器，
套娃之后完全看不到。

### 全组合

57 个 MASQUE 接入点和每个 Opera 落地都配一遍。落地通常 9 到 11 个，
最终 400 上下的节点。

这么做是为了任一环失效都还有路走：某个接入点被墙了换个端口或换个段，
某个落地挂了同地区还有别的。节点名直接写明链路，`欧洲1@198.1-443`
就是欧洲第 1 个落地经 `162.159.198.1:443` 接入。

组合太多没法平铺着选，按地区收成了 `亚洲线路`、`欧洲线路`、`美洲线路`
三个 url-test 组，各自在本地区所有组合里挑最快的。都开了 `lazy`，
不会一进去就把四百多条全测一遍。

### 怎么跑

Actions 里选 `Opera over MASQUE（套娃）`，点 Run workflow。

跑完配置有两个地方：仓库里的 `configs/opera-masque.yaml`（流水线自动提交回来），
或者运行页面下面的 Artifacts。只想下载不想提交的话，跑之前把 `commit` 勾去掉。

### Opera 凭据会过期

匿名注册的凭据会失效。opera-proxy 自己默认每 4 小时刷一次，
但 API 不返回真实过期时间，给不了准数。连不上就重跑一次换新的。

### 落地只有三个大区

Opera VPN 只提供亚洲、欧洲、美洲，没有国家级选项。实测落地分别是
新加坡、阿姆斯特丹、美东。

### 这条流水线也要 Alpha 内核

`dialer-proxy` 和 `masque` 一样只有 Alpha 分支支持。
Shadowrocket、Stash 不认 `dialer-proxy`，用不了套娃配置——
它们可以用上面纯 WARP 那份。

### 改配置

`scripts/gen_opera_masque.py`。接入点清单和纯 WARP 那份是同一批
（`V4` / `V6` / `PORTS`），`REGIONS` 控制取哪些 Opera 大区。

---

## 跑在 Worker 上

Actions 那条要手动点一下才跑。如果想要它自己更新、随时有个 URL 能拿到最新配置，
用 `worker/` 这份。

一份聚合订阅，导进去有两类线路可切：

- **亚洲 / 欧洲 / 美洲线路** — 走 MASQUE 再落 Opera，能换出口国家，多一跳会慢些
- **WARP直连** — 只走 MASQUE，出口是 Cloudflare 自己的 IP，快但选不了国家
- **Proton线路** — 配了 Proton 之后出现，下面按国家分组，可以直接选日本、新加坡等
- **Windscribe线路** — 13 个地区，按地区分组。亚洲只有香港，但 Opera 那三个大区里没有

套娃线路超时或某个落地挂了，切 WARP直连 顶上。这两类共用同一批 MASQUE
接入点，直连组本来就在配置里（做 dialer-proxy 的目标），顺手暴露出来而已。

不用定时任务。Opera 凭据 4 小时到期，Worker 在订阅被访问时才检查：
没过期直接给缓存，过期了才重新注册。没人用就不动，不浪费。

WARP 的注册信息存 KV 里复用，不会每次都注册新设备。

密码和订阅路径都在界面上设，所以部署只需要绑一个 KV，
不用配环境变量，也不用加 cron。

### 部署方式

全程在 Cloudflare 后台点，四步。

**1. 建 KV**

Cloudflare 后台 → 左边 `存储和数据库` → `KV` → `创建实例`。
名字随便填，比如 `opera-masque`。

> 找不到入口的话，`Workers 和 Pages` 里也能进 KV。菜单名各语言版本略有差异，
> 认准 "KV" 这两个字母。

**2. 建 Worker 并贴代码**

左边 `Compute (Workers)` → `创建` → `从 Hello World! 开始` → 起个名 → `部署`。

先部署一个空壳，然后点右上角 `编辑代码`，把
[`worker/dist/worker.js`](worker/dist/worker.js) 整个文件的内容复制进去，
覆盖掉原来的 `Hello World`。这是打包好的单文件，全选粘贴就行。

粘完点 `部署`。

**3. 绑 KV**

回到 Worker 页面 → `设置` → `绑定` → `添加` → 选 `KV 命名空间`。

- 变量名填 **`warp`**
- KV 命名空间选第 1 步建的那个

点 `部署`。

**4. 打开设密码**

访问 `https://你的worker名.你的子域.workers.dev`，
第一次打开会让你设管理密码，设完直接进管理页。

订阅地址、改路径、改密码都在这个页面上。

第一次点订阅可能要等十几秒，它在现注册 WARP 和 Opera。

> 没绑 KV 就打开的话，页面会告诉你怎么绑，不会报一堆栈。



### 改了代码想重新打包

网页部署用的 `dist/worker.js` 是从 `src/` 打包出来的，改完源码跑一下：

```bash
npm run build
```

### 访问控制怎么做的

状态页和所有 API 都要密码。客户端拉订阅时带不了 cookie，所以订阅链接里
挂了个签名 token——状态页上显示的那条完整链接直接复制走就行。

- 密码只存 PBKDF2 哈希 + 随机盐，KV 里看不到明文
- 会话是 HMAC 签名的 token，cookie 里没有密码本身
- 密码比对走常数时间，不会从响应时间里泄露
- 同一 IP 连续失败 8 次锁 15 分钟
- 订阅路径不对或 token 无效，一律返回 404，不提示"密码错误"这类可枚举信息
- 想让所有旧链接失效，在界面上改一次密码就够了（token 是用密码哈希签的）

### 路由

| 路径 | 说明 |
|---|---|
| `/` | 首次是设密码页，之后是登录/管理页 |
| `/login` `/logout` | 登录、退出 |
| 你设的订阅路径 | 默认 `/sub`，要 `?token=` |
| `/api/setup` | POST，首次设密码 |
| `/api/password` | POST，改密码 |
| `/api/sub-path` | POST，改订阅路径 |
| `/api/refresh` | POST，重新拿 Opera 凭据 |
| `/api/reset-warp` | POST，重注册 WARP 设备 |

订阅响应带了 `profile-update-interval: 4`，支持这个头的客户端会自己每 4 小时拉一次，
正好卡在凭据到期点上。

### 更新是怎么触发的

没有 cron。订阅每次被访问时，Worker 看一眼 `expiresAt`：

- 还没到期 → 直接给缓存，不碰任何 API
- 到期了 → 重新注册 Opera，重建配置

多个客户端同时拉订阅时会加锁，只有一个真去注册，其他的先用旧配置顶着，
免得并发注册一堆账号触发风控。

4 小时这个数来自 opera-proxy 自己的 `-refresh 4h` 默认值。
SurfEasy 的 API 不返回真实过期时间，所以按这个走，另外留了 10 分钟余量。

### Worker 常见问题

**打开显示 KV Not Bound** — 第 3 步没做，或者绑定的变量名不是 `KV`。
必须是这两个字母大写。

**忘了密码** — 没有找回。去 KV 里把 `auth:cred` 这条删掉，
刷新页面就回到设密码那步。别的数据不受影响。

**订阅链接打开是 404** — token 过期了（7 天），回状态页重新复制一条。
改过密码的话所有旧链接都会失效，这是故意的。

**节点全都连不上** — 先点`刷新 Opera 凭据`。还不行再点`重注册 WARP 设备`。

**导入客户端报错说不认识 masque** — 内核不是 mihomo Alpha。见下面那节。

**客户端不认 dialer-proxy** — Shadowrocket、Stash 这类只支持 masque
不支持链式出站，导进去只有 WARP直连 那组能用，套娃线路会报错。

### Proton 落地（可选）

Opera 只有三个大区，想要更多国家可以再挂一层 Proton。免费版 10 个国家：
加拿大、瑞士、日本、墨西哥、荷兰、挪威、波兰、罗马尼亚、新加坡、美国。

链路和 Opera 那条一样：`本机 → MASQUE → Proton WireGuard → 目标`。

**为什么要多绕一圈流水线**

Proton 必须账号登录，走的是 SRP 协议。这套在 Worker 里能算对（我验过 A 和 M1
跟官方库逐字节一致），但提交时会被 Proton 的风控拦掉，非官方客户端指纹过不去。

所以让 GitHub Actions 去登录、拿证书，再把结果推给 Worker。
Worker 完全不碰 Proton 账号。

**配置步骤**

1. 注册一个 Proton 账号（免费版就行）
2. 仓库 Settings → Secrets → 加 `PROTON_USER`（邮箱）和 `PROTON_PASS`（密码）
3. Worker 管理页的「Proton 落地」区块，点`生成`拿到推送地址
4. 把那个地址加成第三个 secret：`WORKER_PUSH_URL`
5. 跑一次 `取 Proton 凭据` 流水线

之后每 3 天自动续，不用再管。

**关于证书有效期**

Proton 的证书最长 7 天，`Duration` 写再长也封顶（实测 43200 min、525600 min
返回的都是 7 天）。所以流水线每 3 天跑一次，留足余量。

**推送地址的安全性**

令牌在地址里，只能写 Proton 凭据，动不了管理页也拿不到订阅。
泄露了在管理页点「换一个」，旧地址立刻失效。

不配这部分也不影响，其他线路照常工作。

### Windscribe 落地（可选）

Windscribe 的浏览器扩展用的是标准 HTTPS 代理，和 Opera 同一个形态，
所以能直接写成静态节点挂在 MASQUE 后面。

注册不需要邮箱，`POST /Users` 给个随机用户名密码就返回 session。
免费额度**每月 2GB**（官网说的 10GB 要验证邮箱，匿名号拿不到）。

**为什么开户要走流水线**

它的认证只有一行 `md5(固定secret + 时间戳)`，本来在 Worker 里就能跑完。
但**开户和出口 IP 强相关**：一个 IP 开过号之后再开，拿到的是
`status=2` 的降额账号（`traffic_max` 只有 1MB），而这种账号连
`/ServerCredentials` 都取不到：

```
400  errorCode 1700
     "User unable to generate credentials. status = 2"
```

也就是说降额号完全不可用，不是"额度小一点"的问题。

Cloudflare Worker 的出口 IP 是整个平台共享的，早被别人拿去开过号，
所以 Worker 里开不出能用的账号。开户放到 GitHub Actions 上做，
runner 的 IP 干净。

13 个地区，62 台落地：

```
美国东部/中部/西部  加拿大东部/西部  英国  法国  德国  荷兰
挪威  瑞士  罗马尼亚  香港
```

落地是机房 IP，M247 为主。

**配置步骤**

和 Proton 共用同一个推送地址，不用再加 secret：

1. 管理页「Proton 落地」那里生成推送地址，配进 `WORKER_PUSH_URL`
2. 跑一次 `取 Windscribe 账号` 流水线

流水线会自己在地址末尾加 `/wind`。它开完号会先验一次能不能取到代理凭据，
拿到降额号就直接失败退出，不会把不能用的号推给 Worker。

**流量用完了怎么办**

管理页「Windscribe 落地」区块能看到本月用了多少。用完重跑一次流水线换个号。

偶尔会碰上 runner 的 IP 被别人用过，这时流水线会报
`拿到的是降额账号 status=2`，重跑一次换台机器就行。

流水线也配了每月 1 号自动跑一次，对上 Windscribe 的月度重置。

### 跑测试

```bash
cd worker && npm test
```

99 项，覆盖常数时间比较、token 伪造/篡改/过期、登录限速、并发初始化，
Proton 凭据推送（令牌校验、坏数据、过期拒绝、换令牌失效），
配置结构（分组完整性、无悬空引用、直连组成员正确），
以及路由层的鉴权（未登录一律 404、订阅 token 校验、按需重建、cookie 安全属性）。

### 两个坑

**WebCrypto 导不出 mihomo 要的私钥格式。** WebCrypto 只能导 PKCS8，
mihomo 要 SEC1，直接喂会报 `use ParsePKCS8PrivateKey instead`。
而且光把 PKCS8 里那段抠出来还不够——WebCrypto 省略了曲线参数，
会接着报 `unknown elliptic curve`。`warp.js` 里的 `pkcs8ToSec1`
重新编了一份带 P-256 OID 的完整 SEC1。

**Opera 的 API 用 Digest 认证，而 Digest 要 MD5。** WebCrypto 没有 MD5，
所以 `md5.js` 是手写的。另外 Workers 的 fetch 不自动管 cookie，
SurfEasy 的会话得手工存 `Set-Cookie`。

### 跟 Actions 版的区别

Worker 版少一道 `mihomo -t` 校验——Actions 里会真的下载 mihomo 加载一遍，
确保推出去的配置能用，Worker 里做不到。

换来的是自动更新和一个随时可用的 URL。
