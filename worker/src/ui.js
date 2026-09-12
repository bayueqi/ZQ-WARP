// 界面沿用 cfnew 的赛博朋克终端风：青/品红霓虹、等宽字体、扫描线。
const CSS = `
:root{
  --bg:#05030e; --bg2:#0a0820;
  --cyan:#00f0ff; --pink:#ff2bd6; --purple:#a347ff;
  --yellow:#fff200; --mint:#00ff9d; --red:#ff3860;
  --text:#e6f5ff; --dim:#7aa9c4;
  --border:rgba(0,240,255,.55); --grid:rgba(255,43,214,.16);
}
*{margin:0;padding:0;box-sizing:border-box}
html{overflow-x:hidden}
html,body{min-height:100%}
body{
  font-family:"JetBrains Mono","Fira Code","Courier New",
    "PingFang SC","Microsoft YaHei","Noto Sans SC",monospace;
  background:radial-gradient(ellipse at 20% 10%,#2a0040 0%,var(--bg) 55%,#000 100%);
  color:var(--text);
  padding:32px 16px 56px;
  display:flex;justify-content:center;
  position:relative;overflow-x:hidden;
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    linear-gradient(var(--grid) 1px,transparent 1px) 0 0/44px 44px,
    linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/44px 44px;
  opacity:.5;
}
body::after{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:1;
  background:repeating-linear-gradient(180deg,rgba(0,240,255,.05) 0 1px,transparent 1px 4px);
}
.term{
  min-width:0;overflow:hidden;
  border:1px solid var(--border);
  background:rgba(8,4,28,.86);
  box-shadow:0 0 24px rgba(0,240,255,.14),inset 0 0 60px rgba(163,71,255,.07);
}
.head{
  display:flex;align-items:center;gap:12px;
  padding:12px 16px;border-bottom:1px solid var(--border);
  background:linear-gradient(90deg,rgba(255,43,214,.16),rgba(0,240,255,.16));
}
.dots{display:flex;gap:8px}
.dot{width:11px;height:11px;transform:rotate(45deg);background:var(--pink);box-shadow:0 0 8px var(--pink)}
.dot:nth-child(2){background:var(--yellow);box-shadow:0 0 8px var(--yellow)}
.dot:nth-child(3){background:var(--mint);box-shadow:0 0 8px var(--mint)}
.title{
  color:var(--cyan);font-size:13px;font-weight:700;
  letter-spacing:.25em;text-transform:uppercase;text-shadow:0 0 6px var(--cyan);
}
.title::before{content:"// ";color:var(--pink)}
.body{padding:22px 20px;min-width:0}
input{
  background:rgba(0,0,0,.45);
  border:1px solid var(--border);color:var(--cyan);
  font-family:inherit;font-size:12px;padding:11px 12px;outline:none;
  text-shadow:0 0 4px var(--cyan);
}
input:focus{border-color:var(--pink);box-shadow:0 0 12px rgba(255,43,214,.4)}
button{
  font-family:inherit;font-size:12px;letter-spacing:.12em;text-transform:uppercase;
  padding:11px 18px;cursor:pointer;
  background:transparent;border:1px solid var(--pink);color:var(--pink);
  text-shadow:0 0 6px var(--pink);transition:.15s;white-space:nowrap;
}
button:hover{background:var(--pink);color:#05030e;text-shadow:none;box-shadow:0 0 16px var(--pink)}
button.gh{border-color:var(--cyan);color:var(--cyan);text-shadow:0 0 6px var(--cyan)}
button.gh:hover{background:var(--cyan);color:#05030e;box-shadow:0 0 16px var(--cyan)}
button:disabled{opacity:.4;cursor:not-allowed}
#msg{margin-top:10px;font-size:12px;min-height:18px}
`;

/** KV 没绑时的指引页。报错要能自己解决，别只丢个栈。 */
export function renderNoKV() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="https://img.520jacky.dpdns.org/i/2026/09/12/009586.svg">
<title>ZQ-WARP</title>
<style>${CSS}
.wrap{width:100%;max-width:520px;position:relative;z-index:2;min-width:0;align-self:center}
.step{font-size:12px;color:var(--dim);line-height:2;margin-top:6px}
.step b{color:var(--cyan);font-weight:400}
.step code{color:var(--yellow)}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">KV Not Bound</div>
  </div>
  <div class="body">
    <div class="step">
      还没绑 KV，配置和密码都没地方存。<br><br>
      <b>1.</b> Cloudflare 后台 → 存储和数据库 → KV → 创建实例<br>
      <b>2.</b> 回到这个 Worker → 设置 → 绑定 → 添加 → KV 命名空间<br>
      <b>3.</b> 变量名填 <code>KV</code>（两个字母，大写），命名空间选刚建的<br>
      <b>4.</b> 部署，刷新本页
    </div>
  </div>
</div></div></body></html>`;
}

/** 首次访问的初始化页，设管理密码。 */
export function renderSetup() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="https://img.520jacky.dpdns.org/i/2026/09/12/009586.svg">
<title>ZQ-WARP</title>
<style>${CSS}
.wrap{width:100%;max-width:430px;position:relative;z-index:2;min-width:0;align-self:center}
.f{display:flex;flex-direction:column;gap:10px}
.hint{font-size:11px;color:var(--dim);line-height:1.9;margin-top:14px}
.hint b{color:var(--yellow);font-weight:400}
.lead{font-size:12px;color:var(--cyan);line-height:1.8;margin-bottom:16px}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">First Run</div>
  </div>
  <div class="body">
    <div class="lead">第一次打开，先设一个管理密码。<br>之后订阅路径、改密码都在界面里做。</div>
    <form class="f" onsubmit="return go(event)">
      <input type="password" id="p" placeholder="PASSWORD (>= 8)" autofocus autocomplete="new-password">
      <input type="password" id="c" placeholder="CONFIRM" autocomplete="new-password">
      <button type="submit">设置</button>
    </form>
    <div id="msg"></div>
    <div class="hint">
      密码只存哈希（PBKDF2 + 随机盐），KV 里看不到明文。<br>
      <b>忘了只能删掉 KV 里的 auth:cred 重来</b>，没有找回。
    </div>
  </div>
</div></div>
<script>
async function go(e){
  e.preventDefault();
  const b=document.querySelector('button'), m=document.getElementById('msg');
  b.disabled=true; m.textContent='> 设置中…'; m.style.color='var(--yellow)';
  try{
    const r=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:document.getElementById('p').value,
                           confirm:document.getElementById('c').value})});
    const j=await r.json();
    if(j.ok){m.textContent='> 完成';m.style.color='var(--mint)';location.reload();}
    else{m.textContent='> '+j.error;m.style.color='var(--red)';b.disabled=false;}
  }catch(err){m.textContent='> '+err.message;m.style.color='var(--red)';b.disabled=false;}
  return false;
}
</script>
</body></html>`;
}

/** 登录页。密码错时不提示"用户名错误"这类可枚举信息。 */
export function renderLogin(err) {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="https://img.520jacky.dpdns.org/i/2026/09/12/009586.svg">
<title>ZQ-WARP</title>
<style>${CSS}
.wrap{width:100%;max-width:400px;position:relative;z-index:2;min-width:0;align-self:center}
.f{display:flex;flex-direction:column;gap:12px}
.hint{font-size:11px;color:var(--dim);line-height:1.8;margin-top:14px}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">Auth Required</div>
  </div>
  <div class="body">
    <form class="f" onsubmit="return go(event)">
      <input type="password" id="p" placeholder="PASSWORD" autofocus autocomplete="current-password">
      <button type="submit">进入</button>
    </form>
    <div id="msg"></div>
    <div class="hint">连续失败 8 次会锁定 15 分钟。</div>
  </div>
</div></div>
<script>
async function go(e){
  e.preventDefault();
  const b=document.querySelector('button'), m=document.getElementById('msg');
  b.disabled=true; m.textContent='> 验证中…'; m.style.color='var(--yellow)';
  try{
    const r=await fetch('/login',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:document.getElementById('p').value})});
    const j=await r.json();
    if(j.ok){m.textContent='> 通过';m.style.color='var(--mint)';location.reload();}
    else{m.textContent='> '+j.error;m.style.color='var(--red)';b.disabled=false;}
  }catch(err){m.textContent='> '+err.message;m.style.color='var(--red)';b.disabled=false;}
  return false;
}
</script>
</body></html>`;
}

export function renderUI(state, host, sp, token, cred, pushToken, protonCred, windUsage) {
  const s = state || {};
  const warp = s.warp || {};
  const stat = s.stats || {};
  const updated = s.updatedAt ? new Date(s.updatedAt) : null;
  const ago = updated ? Math.floor((Date.now() - updated.getTime()) / 60000) : null;
  const exp = s.expiresAt ? new Date(s.expiresAt) : null;
  const left = exp ? Math.floor((exp.getTime() - Date.now()) / 60000) : null;
  const leftTxt = left === null ? "—"
    : left <= 0 ? "已过期，下次访问订阅时自动重建"
    : `${Math.floor(left / 60)} 小时 ${left % 60} 分后过期`;
  const fmt = (d) => d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
  const sub = `https://${host}${sp}?token=${token}`;
  const pushUrl = pushToken ? `https://${host}/push/${pushToken}` : "";
  const pExp = protonCred && protonCred.expiresAt
    ? new Date(protonCred.expiresAt * 1000) : null;
  const windInfo = s.wind || null;
  const windPct = windUsage && windUsage.max
    ? Math.round((windUsage.used / windUsage.max) * 100) : 0;
  const gb = (n) => (n / 1073741824).toFixed(2) + " GB";
  const windUsageTxt = windUsage && windUsage.max
    ? `${gb(windUsage.used)} / ${gb(windUsage.max)}（${windPct}%）` : null;
  const pLeft = pExp ? Math.floor((pExp.getTime() - Date.now()) / 86400000) : null;

  const row = (k, v, cls = "") =>
    `<div class="row"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="https://img.520jacky.dpdns.org/i/2026/09/12/009586.svg">
<title>ZQ-WARP</title>
<style>${CSS}
.wrap{width:100%;max-width:880px;position:relative;z-index:2;min-width:0}
.sec{margin-bottom:26px;min-width:0}
.sec:last-child{margin-bottom:0}
.sec-t{
  color:var(--pink);font-size:11px;letter-spacing:.22em;text-transform:uppercase;
  margin-bottom:12px;text-shadow:0 0 6px var(--pink);
}
.sec-t::before{content:"▍";color:var(--cyan);margin-right:6px}
.row{
  display:flex;justify-content:space-between;align-items:baseline;gap:16px;
  padding:7px 0;border-bottom:1px dashed rgba(0,240,255,.14);font-size:13px;
}
.row:last-child{border-bottom:none}
.k{color:var(--dim);letter-spacing:.06em;white-space:nowrap}
.v{color:var(--cyan);text-align:right;word-break:break-all}
.v.ok{color:var(--mint);text-shadow:0 0 6px var(--mint)}
.v.warn{color:var(--yellow);text-shadow:0 0 6px var(--yellow)}
.v.err{color:var(--red);text-shadow:0 0 6px var(--red)}
.grid{display:grid;min-width:0;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.cell{
  border:1px solid rgba(0,240,255,.3);padding:12px 14px;
  background:rgba(0,240,255,.04);min-width:0;
}
.cell .n{font-size:26px;font-weight:700;color:var(--cyan);text-shadow:0 0 10px var(--cyan);line-height:1.1}
.cell .l{font-size:10px;color:var(--dim);letter-spacing:.14em;text-transform:uppercase;margin-top:6px;
  overflow-wrap:anywhere}
.sub{display:flex;gap:8px;align-items:stretch;margin-top:4px;flex-wrap:wrap}
.sub input{flex:1;min-width:0}
.pw{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-top:4px}
.pw input{min-width:0}
@media(max-width:700px){.pw{grid-template-columns:1fr}}
.note{font-size:11px;color:var(--dim);line-height:1.85;margin-top:12px;
  overflow-wrap:anywhere;word-break:break-word}
.note b{color:var(--yellow);font-weight:400}
.foot{
  margin-top:18px;text-align:center;font-size:10px;color:var(--dim);
  letter-spacing:.2em;text-transform:uppercase;
}
.foot a{color:var(--purple);text-decoration:none}
.foot a:hover{color:var(--pink)}
.head{position:relative}
.out{
  margin-left:auto;font-size:10px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--dim);text-decoration:none;border:1px solid rgba(122,169,196,.4);
  padding:4px 10px;transition:.15s;
}
.out:hover{color:var(--red);border-color:var(--red);text-shadow:0 0 6px var(--red)}
@media(max-width:560px){
  body{padding:18px 10px 40px}
  .row{flex-direction:column;gap:2px;font-size:12px}
  .v{text-align:left}
  .sub{flex-direction:column}
  button{width:100%}
  .grid{grid-template-columns:1fr 1fr;gap:8px}
  .body{padding:16px 12px}
  .note{letter-spacing:0;font-size:11px}
  .title{font-size:10px;letter-spacing:.12em}
  .k,.v{letter-spacing:0}
  .cell .n{font-size:22px}
  .cell .l{letter-spacing:.08em;font-size:9px}
  .sec-t{letter-spacing:.14em}
}
@media(max-width:360px){
  .grid{grid-template-columns:1fr}
}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">Opera over MASQUE</div>
    <a class="out" href="/logout">退出</a>
  </div>
  <div class="body">

    <div class="sec">
      <div class="sec-t">订阅</div>
      <div class="sub">
        <input id="u" value="${sub}" readonly>
        <button onclick="cp('u')">复制</button>
        <button class="gh" onclick="location.href=document.getElementById('u').value">下载</button>
      </div>
      <div class="note">
        一份聚合，导进去有两类线路可切：<br>
        <b>亚洲/欧洲/美洲线路</b> — 走 MASQUE 再落 Opera，能换出口国家，但多一跳会慢些。<br>
        <b>WARP直连</b> — 只走 MASQUE，出口是 Cloudflare 自己的 IP，快但选不了国家。<br>
        <b>Proton线路</b> — MASQUE 打底 + Proton WireGuard 落地，10 个国家（配置后出现）。<br>
        <b>Windscribe线路</b> — MASQUE 打底 + Windscribe 落地，13 个地区，有香港（配置后出现）。<br>
        套娃线路超时或落地挂了，切 WARP直连顶上。
      </div>
      <div id="msg"></div>
    </div>

    <div class="sec">
      <div class="sec-t">节点</div>
      <div class="grid">
        <div class="cell"><div class="n">${stat.combos ?? "—"}</div><div class="l">组合节点</div></div>
        <div class="cell"><div class="n">${stat.entries ?? "—"}</div><div class="l">MASQUE 接入点</div></div>
        <div class="cell"><div class="n">${stat.landings ?? "—"}</div><div class="l">Opera 落地</div></div>
        <div class="cell"><div class="n">${stat.entries ?? "—"}</div><div class="l">WARP 直连</div></div>
        <div class="cell"><div class="n">${stat.proton || "—"}</div><div class="l">Proton 落地</div></div>
        <div class="cell"><div class="n">${stat.wind || "—"}</div><div class="l">Windscribe 落地</div></div>
      </div>
      <div class="note">
        每个落地和每个接入点都组合一遍，任一环失效都还有别的路走。<br>
        节点名 <b>欧洲1@198.1-443</b> = 欧洲第 1 个落地，经 162.159.198.1:443 接入。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">状态</div>
      ${row("上次更新", updated ? `${fmt(updated)}（${ago} 分钟前）` : "尚未生成",
             updated ? (ago > 250 ? "warn" : "ok") : "err")}
      ${row("凭据剩余", leftTxt, left === null ? "" : left <= 0 ? "warn" : "ok")}
      ${row("到期时间", fmt(exp))}
      ${row("密码更新于", cred && cred.updatedAt ? fmt(new Date(cred.updatedAt)) : "—")}
      ${row("WARP 设备", warp.deviceId ? warp.deviceId.slice(0, 8) + "…" : "—")}
      ${row("WARP 注册于", warp.registeredAt ? fmt(new Date(warp.registeredAt)) : "—")}
      ${row("内网地址", warp.ipv4 || "—")}
    </div>

    <div class="sec">
      <div class="sec-t">操作</div>
      <div class="sub">
        <button onclick="go('/api/refresh')">刷新 Opera 凭据</button>
        <button class="gh" onclick="go('/api/reset-warp')">重注册 WARP 设备</button>
      </div>
      <div class="note">
        Opera 凭据 4 小时到期。<b>不用定时任务</b>——订阅被访问时才检查，
        没过期直接给缓存，过期了才重新注册。<br>
        想提前换一份就点刷新。<br>
        WARP 设备信息存在 KV 里复用，<b>一般不用重注册</b>，除非 MASQUE 整体连不上。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">Proton 落地</div>
      ${protonCred ? `
      <div class="row"><span class="k">状态</span><span class="v ok">已配置 ${
        protonCred.servers.length} 台</span></div>
      <div class="row"><span class="k">证书剩余</span><span class="v ${
        pLeft <= 1 ? "warn" : "ok"}">${pLeft} 天（${
        pExp.toISOString().slice(0, 10)} 到期）</span></div>
      ` : `
      <div class="row"><span class="k">状态</span><span class="v warn">未配置</span></div>
      `}
      <div class="note" style="margin-bottom:10px">
        Proton 要账号登录，Worker 里做会被风控拦，所以走 GitHub Actions 取证书再推过来。
        证书<b>最长 7 天</b>，到期重跑一次流水线即可。
      </div>
      <div class="sub">
        <input id="pu" value="${pushUrl || "点右边生成"}" readonly>
        <button onclick="cp('pu')">复制</button>
        <button class="gh" onclick="go('/api/proton/token')">${
          pushToken ? "换一个" : "生成"}</button>
      </div>
      <div class="note">
        把这个地址填进 GitHub 仓库 Secrets 的 <b>WORKER_PUSH_URL</b>，就这一个。<br>
        然后跑 <b>取 Proton 凭据</b> 流水线，之后每 3 天自动续，不用再管。<br>
        <b>取 Windscribe 账号</b> 那条也用同一个地址，它会自己在末尾加 <code>/wind</code>。<br>
        地址里带令牌，只能写 Proton 凭据、动不了管理页；泄露了点「换一个」。
        ${protonCred ? '<br><a href="#" onclick="go(\'/api/proton/clear\');return false" ' +
          'style="color:var(--red)">清除 Proton 凭据</a>' : ""}
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">Windscribe 落地</div>
      ${windInfo ? `
      <div class="row"><span class="k">状态</span><span class="v ok">已注册 ${
        windInfo.servers} 台</span></div>
      <div class="row"><span class="k">账号</span><span class="v">${windInfo.userId}</span></div>
      ${windUsageTxt ? `<div class="row"><span class="k">本月流量</span><span class="v ${
        windPct > 90 ? "warn" : "ok"}">${windUsageTxt}</span></div>` : ""}
      ` : `
      <div class="row"><span class="k">状态</span><span class="v warn">未启用</span></div>
      `}
      <div class="note">
        免费额度 <b>每月 2GB</b>，落地是机房 IP（M247 为主），
        13 个地区里<b>亚洲只有香港</b>。<br>
        账号走 GitHub Actions 开 —— Worker 自己开不出能用的号，
        Cloudflare 的出口 IP 是共享的，早被人用过，
        Windscribe 只会发 1MB 的降额号，那种号连代理凭据都取不到。<br>
        跑一次 <b>取 Windscribe 账号</b> 流水线就行，用的是上面那个推送地址。
        额度用完了再跑一次换个号。
        ${windInfo ? '<br><a href="#" onclick="go(\'/api/wind/clear\');return false" ' +
          'style="color:var(--red)">清除 Windscribe 账号</a>' : ""}
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">订阅路径</div>
      <div class="sub">
        <input id="sp" value="${sp.replace(/^\//, "")}" spellcheck="false"
               placeholder="字母数字和 - _">
        <button onclick="setPath('sp')">保存</button>
      </div>
      <div class="note">
        改成难猜的字符串，等于在密码之外多一层。改完上面的订阅链接要重新复制。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">修改密码</div>
      <div class="pw">
        <input type="password" id="c0" placeholder="当前密码" autocomplete="current-password">
        <input type="password" id="c1" placeholder="新密码（>= 8）" autocomplete="new-password">
        <input type="password" id="c2" placeholder="确认新密码" autocomplete="new-password">
        <button onclick="setPw()">修改</button>
      </div>
      <div class="note">
        改完<b>所有旧订阅链接立刻失效</b>，因为 token 是用密码哈希签的。
        链接泄露了就靠这个补救。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">须知</div>
      <div class="note">
        必须用 <b>mihomo Alpha</b> 内核，masque 出站和 dialer-proxy 稳定版都不支持。<br>
        可用客户端：Clash Verge Rev（内核切 Alpha）、ClashMi、FlClash。<br>
        Shadowrocket、Stash 不认 dialer-proxy，导进去只有 WARP直连 那组能用。<br>
        订阅链接里的 token 就是访问凭证，<b>别外传</b>，泄露了改密码即可全部失效。<br>
        配置里的 private-key 等同 WARP 账号凭据。<br>
        免费代理的流量对提供方可见，别走支付和敏感数据。
      </div>
    </div>

  </div></div>
  <div class="foot">
    Cloudflare Worker ・
    <a href="https://github.com/bayueqi/ZQ-WARP">GitHub</a>
  </div>
</div>
<script>
function cp(id){
  const el=document.getElementById(id||'u');
  navigator.clipboard.writeText(el.value).then(
    ()=>say('已复制到剪贴板','var(--mint)'),
    ()=>{el.select();document.execCommand('copy');say('已复制','var(--mint)')});
}
function say(t,c){
  const m=document.getElementById('msg');
  m.textContent='> '+t; m.style.color=c;
  setTimeout(()=>{m.textContent=''},4000);
}
async function post(url,body,okmsg){
  const bs=document.querySelectorAll('button');
  bs.forEach(b=>b.disabled=true);
  say('执行中…','var(--yellow)');
  try{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
                            body:JSON.stringify(body)});
    const j=await r.json();
    if(j.ok){say((j.msg||okmsg)+'，即将刷新','var(--mint)');setTimeout(()=>location.reload(),1400);}
    else{say('失败: '+j.error,'var(--red)');bs.forEach(b=>b.disabled=false);}
  }catch(e){say('失败: '+e.message,'var(--red)');bs.forEach(b=>b.disabled=false);}
}
function setPath(id){
  const v=document.getElementById(id||'sp').value.trim();
  if(!v){say('路径不能为空','var(--red)');return;}
  post('/api/sub-path',{path:v},'已保存');
}
function setPw(){
  const c0=document.getElementById('c0').value;
  const c1=document.getElementById('c1').value;
  const c2=document.getElementById('c2').value;
  if(!c0||!c1){say('把三个框都填了','var(--red)');return;}
  if(c1!==c2){say('两次输入不一致','var(--red)');return;}
  if(c1.length<8){say('新密码至少 8 位','var(--red)');return;}
  post('/api/password',{current:c0,password:c1,confirm:c2},'已修改');
}
async function go(p){
  const bs=document.querySelectorAll('button');
  bs.forEach(b=>b.disabled=true);
  say('执行中…','var(--yellow)');
  try{
    const r=await fetch(p,{method:'POST'});
    const j=await r.json();
    if(j.ok){say(j.msg+'，即将刷新','var(--mint)');setTimeout(()=>location.reload(),1200);}
    else{say('失败: '+j.error,'var(--red)');bs.forEach(b=>b.disabled=false);}
  }catch(e){say('失败: '+e.message,'var(--red)');bs.forEach(b=>b.disabled=false);}
}
</script>
</body></html>`;
}
