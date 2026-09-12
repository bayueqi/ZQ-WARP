// 鉴权底层测试。跑: node test/auth.test.mjs
import {
  safeEqual, makeCred, checkPassword, signToken, verifyToken,
  rateLimit, clearRateLimit, normalizePath,
} from "../src/auth.js";

let pass = 0, fail = 0;
const t = (n, c) => { c ? (pass++, console.log("  ✓", n)) : (fail++, console.log("  ✗", n)); };

t("相同串相等", safeEqual("abc", "abc"));
t("不同串不等", !safeEqual("abc", "abd"));
t("长度不同不等", !safeEqual("abc", "abcd"));
t("空值不等", !safeEqual("", "x"));

const cred = await makeCred("correct-horse-battery");
t("密码记录不含明文", !JSON.stringify(cred).includes("correct-horse-battery"));
t("盐是随机的", (await makeCred("same")).salt !== (await makeCred("same")).salt);
t("正确密码通过", await checkPassword(cred, "correct-horse-battery"));
t("错误密码不通过", !(await checkPassword(cred, "wrong")));
t("空密码不通过", !(await checkPassword(cred, "")));
t("空记录不通过", !(await checkPassword(null, "x")));

const tok = await signToken(cred);
t("签发的 token 通过", await verifyToken(cred, tok));
t("篡改签名不通过", !(await verifyToken(cred, tok.slice(0, -2) + "xy")));
t("伪造时间戳不通过", !(await verifyToken(cred, "99999999999999." + tok.split(".")[1])));
t("过期 token 不通过", !(await verifyToken(cred, "1000000000000.abc")));
t("空 token 不通过", !(await verifyToken(cred, "")));
t("无点号不通过", !(await verifyToken(cred, "garbage")));

const cred2 = await makeCred("new-password-here");
t("改密码后旧 token 失效", !(await verifyToken(cred2, tok)));

t("路径: 正常值", normalizePath("a8f3d91c") === "a8f3d91c");
t("路径: 去掉斜杠", normalizePath("/my-sub/") === "my-sub");
t("路径: 空值拒绝", normalizePath("") === null);
t("路径: 含斜杠拒绝", normalizePath("a/b") === null);
t("路径: 含空格拒绝", normalizePath("a b") === null);
t("路径: 保留字拒绝", normalizePath("api") === null);
t("路径: 保留字大小写不敏感", normalizePath("LOGIN") === null);
t("路径: 超长拒绝", normalizePath("x".repeat(65)) === null);

const kv = { m: new Map(),
  async get(k) { return this.m.get(k); },
  async put(k, v) { this.m.set(k, v); },
  async delete(k) { this.m.delete(k); } };
let allowed = 0;
for (let i = 0; i < 12; i++) if (await rateLimit({ KV: kv }, "1.2.3.4")) allowed++;
t(`限速第 8 次后拦截 (放行 ${allowed} 次)`, allowed === 8);
await clearRateLimit({ KV: kv }, "1.2.3.4");
t("登录成功后重置限速", await rateLimit({ KV: kv }, "1.2.3.4"));

console.log(`\n通过 ${pass} 失败 ${fail}`);
if (fail) process.exit(1);
