// EALC 修复回归测试: 对覆写脚本 main() 做结构级断言
// 被测脚本为仓库根目录的 override.js(白名单校验)。
// 每条断言对应评审 ISSUE 或后续修订: 修复前必须 FAIL, 修复后必须 PASS。
// 开关通过 main 的第二参数 options 注入(客户端不传 options, 只传 config),
// 不再对源码做字符串替换 —— 锚点一变测试就整份崩溃。
// 用法: node test/test-override.js
"use strict";
const fs = require("fs");
const path = require("path");
const TESTDIR = __dirname;
const ROOT = path.resolve(__dirname, "..");

// 被测脚本: 白名单 + 目录边界校验, 禁止越出仓库根目录。
const ALLOWED_TARGETS = ["override.js", "override-v1.3.2.js"];
const TARGET = process.env.TEST_TARGET || "override.js";
if (ALLOWED_TARGETS.indexOf(TARGET) === -1) throw new Error("target not in whitelist");
const targetAbs = path.resolve(ROOT, TARGET);
if (!targetAbs.startsWith(ROOT + path.sep)) throw new Error("target outside root");
if (path.basename(targetAbs) !== TARGET) throw new Error("basename mismatch");
if (!fs.existsSync(targetAbs)) throw new Error("target not found: " + TARGET);

// 固定临时文件 + 字面量 require(不使用 eval/new Function/变量路径 require); 用毕清理。
const variantPath = path.join(TESTDIR, ".tmp-variant-main.js");
function cleanupVariant() {
  try { fs.unlinkSync(variantPath); } catch (_) { /* absent */ }
}
process.on("exit", cleanupVariant);
fs.writeFileSync(variantPath,
  fs.readFileSync(targetAbs, "utf8") + '\nif (typeof module !== "undefined") module.exports = main;');
const main = require("./.tmp-variant-main.js");

const results = [];
function check(id, desc, fn) {
  try {
    results.push({ id, desc, ok: !!fn() });
  } catch (e) {
    results.push({ id, desc, ok: false, err: String((e && e.message) || e) });
  }
}

const MAIN = "🌐 全局代理", AI = "🤖 AI 专属 (美/日/新/韩)";
const DOCKER = "🐳 容器专属 (JP/SG)";
const AI_AUTO = "🤖 AI 自动 (稳态)";
const BEST_AUTO = "⚡ 优选自动 (美/日/新/韩)";
const PROVIDER_AUTO = "⚡ 订阅源自动 (全部)";
const AI_TEST_URL = "https://chatgpt.com/cdn-cgi/trace";

// 客户端只传 config, 所以真实使用必须改源码里的占位符; 测试用 options 注入。
const OPTS = { PROXY_PASS: "fixture-pass" };
function opts(extra) { return Object.assign({}, OPTS, extra || {}); }

function node(name) { return { name: name, type: "ss", server: "203.0.113.1", port: 443 }; }
const S1_PROXIES = [
  "HK IEPL 01", "US Los Angeles 01", "US San Jose 02", "JP Tokyo 01",
  "JP Osaka 02", "SG Lion 01", "KR Seoul 01", "TR Istanbul 01",
  "剩余流量：10GB", "US Los Angeles 01",
  "Expire Date: 2027-03-02", "Traffic Reset: 9 Days Left", "221.06 GB | 850 GB"
].map(node);
const PROVIDERS = { sub1: { type: "http", url: "https://example.com/sub" } };

function run(proxies, providers, extraOpts) {
  const cfg = { proxies: JSON.parse(JSON.stringify(proxies || [])) };
  if (providers) cfg["proxy-providers"] = JSON.parse(JSON.stringify(providers));
  return { cfg, out: main(cfg, opts(extraOpts)) };
}
function throwsWith(fn, pattern) {
  try { fn(); return false; } catch (e) { return pattern.test(String((e && e.message) || e)); }
}

function ruleTarget(rule) {
  if (rule.startsWith("AND,")) return rule.endsWith(",REJECT") ? "REJECT" : null;
  const parts = rule.split(",");
  return parts[parts.length - 1] === "no-resolve" ? parts[parts.length - 2] : parts[parts.length - 1];
}
function idxOf(rules, prefix) { return rules.findIndex(r => r.startsWith(prefix)); }
function findGroup(groups, name) { return groups.find(g => g.name === name); }
// 成员可以来自 proxies 列表, 也可以来自 use 引入的 provider 节点。
function everyGroupOk(groups) {
  return groups.every(g =>
    (Array.isArray(g.proxies) && g.proxies.length > 0) ||
    (Array.isArray(g.use) && g.use.length > 0));
}

// --- ISSUE-01 局域网开放代理无鉴权 ---
check("ISSUE-01", "authentication + skip-auth(含回环) + docker-in 监听 users(对象格式)", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const auth = out["authentication"];
  const skip = out["skip-auth-prefixes"];
  const lis = (out.listeners || []).find(l => l.name === "docker-in");
  return Array.isArray(auth) && auth.length === 1 && /^[^:]+:/.test(auth[0])
    && Array.isArray(skip) && skip.indexOf("127.0.0.1/32") !== -1
    && !!lis && Array.isArray(lis.users) && lis.users.length === 1
    && !!lis.users[0] && typeof lis.users[0] === "object"
    && typeof lis.users[0].username === "string" && typeof lis.users[0].password === "string";
});
check("AUTH-2", "skip-auth-prefixes 只含回环, 不再对整个 172.16/12 免密", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const skip = out["skip-auth-prefixes"];
  return Array.isArray(skip) && skip.length === 2
    && skip.indexOf("172.16.0.0/12") === -1 && skip.indexOf("192.168.65.0/24") === -1;
});

// --- 凭据 fail closed ---
check("PW-1", "未替换 CHANGE_ME 时直接报错, 不生成弱密码配置", () => {
  const cfg = { proxies: [node("US 01")] };
  return throwsWith(() => main(cfg), /CHANGE_ME/);
});
check("PW-2", "PROXY_PASS 为空/纯空白时报错", () => {
  const cfg = { proxies: [node("US 01")] };
  return throwsWith(() => main(JSON.parse(JSON.stringify(cfg)), { PROXY_PASS: "  " }), /PROXY_PASS/);
});
check("PW-PLACEHOLDER", "空白包裹的 CHANGE_ME 仍然被拒绝", () => {
  return ["CHANGE_ME ", " CHANGE_ME", "\tCHANGE_ME\n"].every(pass =>
    throwsWith(() => main({ proxies: [node("US 01")] }, { PROXY_PASS: pass }), /CHANGE_ME/));
});
check("PW-INHERITED", "继承的 PROXY_PASS 不得绕过占位符校验", () => {
  const inherited = Object.create({ PROXY_PASS: "inherited-pass" });
  return throwsWith(() => main({ proxies: [node("US 01")] }, inherited), /CHANGE_ME/);
});
check("CFG-TYPES", "错误的 config 字段类型直接报错", () => {
  return throwsWith(() => main({ proxies: "US 01" }, opts()), /proxies/)
    && throwsWith(() => main({ "proxy-providers": [] }, opts()), /proxy-providers/)
    && Array.isArray(main({ listeners: {}, proxies: [node("US 01")] }, opts()).listeners);
});
check("PORT-ATOMIC", "端口冲突时报错且不修改输入配置", () => {
  const cfg = { proxies: [node("US 01")], listeners: [{ name: "other", port: 7895 }] };
  const before = JSON.stringify(cfg);
  return throwsWith(() => main(cfg, opts()), /7895/) && JSON.stringify(cfg) === before;
});
check("PW-3", "DOCKER_PORT 非法时报错", () => {
  const cfg = { proxies: [node("US 01")] };
  return throwsWith(() => main(JSON.parse(JSON.stringify(cfg)), opts({ DOCKER_PORT: 70000 })), /DOCKER_PORT/);
});

// --- 监听端口冲突与 listener 清理 ---
check("PORT-1", "其他 listener 占用 DOCKER_PORT(数字字符串)时显式报错", () => {
  const cfg = { proxies: [node("US 01")], listeners: [{ name: "other", type: "mixed", port: "7895" }] };
  return throwsWith(() => main(cfg, opts()), /7895/);
});
check("PORT-TOP", "顶层 mixed-port 与 DOCKER_PORT 冲突时显式报错", () => {
  const cfg = { "mixed-port": 7895, proxies: [node("US 01")] };
  const before = JSON.stringify(cfg);
  return throwsWith(() => main(cfg, opts()), /mixed-port/)
    && JSON.stringify(cfg) === before;
});
check("PORT-2", "已存在的 docker-in 被替换而不是重复追加", () => {
  const cfg = {
    proxies: [node("US 01")],
    listeners: [{ name: "docker-in", type: "mixed", port: 7895, users: [{ username: "old", password: "old" }] }]
  };
  const out = main(cfg, opts({ DOCKER_PORT: 7900 }));
  const dockerIns = out.listeners.filter(l => l.name === "docker-in");
  return dockerIns.length === 1 && dockerIns[0].port === 7900;
});
check("LIS-1", "listeners 里的 null/非对象条目被丢弃", () => {
  const cfg = { proxies: [node("US 01")], listeners: [null, "junk", { name: "keep", type: "socks", port: 7890 }] };
  const out = main(cfg, opts());
  return out.listeners.length === 2
    && out.listeners.every(l => l && typeof l === "object")
    && out.listeners.some(l => l.name === "keep");
});

// --- ISSUE-02 空成员组导致加载失败 / 纯 provider 默认直连 ---
check("ISSUE-02", "纯港订阅+provider: 无空成员组, MAIN 由 provider 测速组兜底", () => {
  const { out } = run(["HK 01", "HK 02"].map(node), PROVIDERS);
  const groups = out["proxy-groups"] || [];
  const mainG = findGroup(groups, MAIN);
  return everyGroupOk(groups) && !!mainG
    && mainG.proxies[0] === PROVIDER_AUTO
    && mainG.proxies.indexOf("DIRECT") === -1;
});
check("ISSUE-02b", "常规订阅: 所有策略组成员非空(含 use)", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  return everyGroupOk(out["proxy-groups"] || []);
});
check("PROV-1", "纯 provider 订阅(无静态节点): MAIN 默认不是 DIRECT", () => {
  const { out } = run([], PROVIDERS);
  const groups = out["proxy-groups"] || [];
  const mainG = findGroup(groups, MAIN);
  const autoG = findGroup(groups, PROVIDER_AUTO);
  return everyGroupOk(groups) && !!mainG && mainG.proxies[0] !== "DIRECT"
    && !!autoG && Array.isArray(autoG.use) && autoG.use.indexOf("sub1") !== -1
    && typeof autoG["exclude-filter"] === "string" && autoG["empty-fallback"] === "REJECT";
});
check("PROV-DENY", "provider-only fallback 保留 deny filter 并拒绝空池", () => {
  const providers = { sub1: { type: "file", path: "provider-test.yaml" } };
  const { out } = run([], providers);
  const autoG = findGroup(out["proxy-groups"] || [], PROVIDER_AUTO);
  return !!autoG && typeof autoG["exclude-filter"] === "string"
    && autoG["empty-fallback"] === "REJECT";
});
check("PROV-2", "有静态节点时 provider 仍参与组级测速(use 未被移除)", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const g = findGroup(out["proxy-groups"] || [], BEST_AUTO);
  return !!g && Array.isArray(g.use) && g.use.indexOf("sub1") !== -1 && !!g.filter;
});
check("HC-1", "provider health-check 补默认值且保留显式 enable:false", () => {
  const providers = {
    sub1: { type: "http", url: "https://example.com/sub", "health-check": { enable: false, interval: 300 } }
  };
  const { out } = run(S1_PROXIES, providers);
  const hc = out["proxy-providers"].sub1["health-check"];
  return hc.enable === false && hc.interval === 300
    && typeof hc.url === "string" && hc.timeout === 5000 && hc["expected-status"] === 204;
});

// --- ISSUE-03 Docker 锁定规则顺序 ---
check("ISSUE-03", "IN-PORT/Docker 进程规则位于 GEOSITE,cn 之前", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  const inPort = idxOf(rules, "IN-PORT," + 7895);
  const proc = idxOf(rules, "PROCESS-NAME,com.docker.backend.exe");
  const cn = idxOf(rules, "GEOSITE,cn,DIRECT");
  return inPort !== -1 && proc !== -1 && cn !== -1 && inPort < cn && proc < cn;
});

// --- ISSUE-04 AI 测速不测 AI 可用性 + IP 一致性(稳态 fallback) ---
check("ISSUE-04", "AI 自动组为 fallback, chatgpt trace, expected-status 200", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const g = findGroup(out["proxy-groups"] || [], AI_AUTO);
  return !!g && g.type === "fallback" && g.url === AI_TEST_URL && g["expected-status"] === 200;
});

// --- ISSUE-05 空池兜底混入任意地区 ---
check("ISSUE-05", "无 AI 地区节点时 AI 组回退 MAIN, 不混入其他地区", () => {
  const { out } = run(["HK 01", "TR Istanbul 01"].map(node));
  const g = findGroup(out["proxy-groups"] || [], AI);
  return !!g && g.proxies.join("|") === MAIN;
});

// --- ISSUE-06 内网 DNS 被劫持 ---
check("ISSUE-06", "内网域名解析走系统 DNS", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const pol = (out.dns || {})["nameserver-policy"] || {};
  const key = Object.keys(pol).find(k => k.indexOf("private") !== -1 || k.indexOf(".lan") !== -1);
  return !!key && [].concat(pol[key]).indexOf("system") !== -1;
});

// --- ISSUE-07 UNIFY 时孤儿测速组 ---
check("ISSUE-07", "UNIFY=true: 不创建 AI 测速组/AI 组, AI 域名指向 MAIN", () => {
  const { out } = run(S1_PROXIES, PROVIDERS, { UNIFY_AI_AND_GLOBAL: true });
  const names = (out["proxy-groups"] || []).map(g => g.name);
  return names.indexOf(AI_AUTO) === -1 && names.indexOf(AI) === -1
    && (out.rules || []).indexOf("DOMAIN-SUFFIX,claude.ai," + MAIN) !== -1;
});

// --- ISSUE-08 AI 域名清单缺口 ---
check("ISSUE-08", "清单补齐 githubcopilot/notebooklm/huggingface/pplx/character/sora", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  return ["githubcopilot.com", "notebooklm.google.com", "huggingface.co", "pplx.ai", "character.ai", "sora.com"]
    .every(d => rules.indexOf("DOMAIN-SUFFIX," + d + "," + AI) !== -1);
});

// --- F2 Docker 进程覆盖加宽 ---
check("FIX-D2", "build/dev-envs 进程已入容器组规则", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  return rules.indexOf("PROCESS-NAME,com.docker.build.exe," + DOCKER) !== -1
    && rules.indexOf("PROCESS-NAME,com.docker.dev-envs.exe," + DOCKER) !== -1;
});

// --- ISSUE-09 QUIC 阻断误伤私网 ---
check("ISSUE-09", "私网直连先于 QUIC/DoT 阻断", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  const lan = idxOf(rules, "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve");
  const geoSite = idxOf(rules, "GEOSITE,private,DIRECT");
  const quic = rules.findIndex(r => r.startsWith("AND,((NETWORK,UDP),(DST-PORT,443)"));
  return lan !== -1 && geoSite !== -1 && quic !== -1 && lan < quic && geoSite < quic;
});

// --- ISSUE-10 直连 docker.io 不可靠 (Accepted, 仅断言开关行为保留) ---
check("ISSUE-10", "DOCKER_HUB_VIA_PROXY=false 时 docker.io 直连行为保留", () => {
  const { out } = run(S1_PROXIES, PROVIDERS, { DOCKER_HUB_VIA_PROXY: false });
  return (out.rules || []).indexOf("DOMAIN-SUFFIX,docker.io,DIRECT") !== -1;
});
check("CF-DIRECT", "Cloudflare 管理面板/API 直连且早于海外代理兜底", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  const fallback = idxOf(rules, "GEOSITE,geolocation-!cn," + MAIN);
  const expected = ["dash.cloudflare.com", "api.cloudflare.com"].map(d =>
    "DOMAIN-SUFFIX," + d + ",DIRECT");
  return expected.every(rule => rules.indexOf(rule) !== -1 && rules.indexOf(rule) < fallback);
});

// --- ISSUE-11 死常量 ---
check("ISSUE-11", "HARK/MANUAL/IP_CHECK/BEST_GLOBAL 死常量已删除", () => {
  const source = fs.readFileSync(targetAbs, "utf8");
  return ["HARK_GROUP", "MANUAL_GROUP", "IP_CHECK_GROUP", "BEST_GLOBAL_GROUP"]
    .every(s => source.indexOf(s) === -1);
});

// --- F1 英文提示节点过滤 ---
check("FIX-F1", "英文提示节点(Expire/Traffic Reset/GB)被过滤", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const names = (out.proxies || []).map(p => p.name);
  const groupStr = JSON.stringify(out["proxy-groups"] || []);
  return ["Expire Date: 2027-03-02", "Traffic Reset: 9 Days Left", "221.06 GB | 850 GB"]
    .every(n => names.indexOf(n) === -1 && groupStr.indexOf(n) === -1);
});

// --- IP 一致性: 全局默认跟随 AI ---
check("IP-CONS", "全局代理第一成员为 AI 专属", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const groups = out["proxy-groups"] || [];
  const mainG = findGroup(groups, MAIN);
  return !!mainG && mainG.proxies[0] === AI;
});
check("IP-CONS2", "无循环引用: MAIN 引用 AI 时 AI 不得引用 MAIN", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const groups = out["proxy-groups"] || [];
  const mainG = findGroup(groups, MAIN);
  if (!mainG || mainG.proxies.indexOf(AI) === -1) return true;
  const aiG = findGroup(groups, AI);
  return !!aiG && aiG.proxies.indexOf(MAIN) === -1;
});

// --- 跨平台: macOS 进程与 Apple fake-ip 白名单 ---
check("MACOS-1", "macOS 进程名(wpsoffice/WeChatAppEx/BaiduNetdisk)已入直连规则", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  return ["wpsoffice", "WeChatAppEx", "BaiduNetdisk", "SunloginClient"]
    .every(p => rules.indexOf("PROCESS-NAME," + p + ",DIRECT") !== -1);
});
check("MACOS-2", "fake-ip 白名单含 captive.apple.com 与 +.apple.com", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const f = (out.dns || {})["fake-ip-filter"] || [];
  return f.indexOf("captive.apple.com") !== -1 && f.indexOf("+.apple.com") !== -1;
});

// --- 通用不变量 ---
check("GEN-1", "所有规则目标可解析, MATCH 收尾", () => {
  const { out } = run(S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  const valid = new Set(["DIRECT", "REJECT"].concat((out["proxy-groups"] || []).map(g => g.name)));
  return rules.every(r => valid.has(ruleTarget(r)))
    && rules[rules.length - 1] === "MATCH," + MAIN;
});
check("GEN-2", "空配置原样返回", () => {
  const { cfg, out } = run([], null);
  return out === cfg && !("proxy-groups" in out);
});

let pass = 0, fail = 0;
for (const r of results) {
  if (r.ok) pass++; else fail++;
  console.log((r.ok ? "PASS" : "FAIL") + "  " + r.id.padEnd(10) + r.desc + (r.ok ? "" : "\n          ^ " + (r.err || "")));
}
console.log("\n" + pass + " passed, " + fail + " failed");
cleanupVariant();
process.exit(fail === 0 ? 0 : 1);
