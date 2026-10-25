// EALC 修复回归测试: 对覆写脚本 main() 做结构级断言
// 被测脚本为仓库根目录的 override.js(白名单校验)。
// 每条断言对应评审 ISSUE: 修复前必须 FAIL, 修复后必须 PASS。
// 用法: node test/test-override.js
"use strict";
const fs = require("fs");
const path = require("path");
const TESTDIR = __dirname;
const ROOT = path.resolve(__dirname, "..");

// 被测脚本: 白名单 + 目录边界校验, 禁止越出仓库根目录。
const ALLOWED_TARGETS = ["override.js"];
const TARGET = "override.js";
if (ALLOWED_TARGETS.indexOf(TARGET) === -1) throw new Error("target not in whitelist");
const targetAbs = path.resolve(ROOT, TARGET);
if (!targetAbs.startsWith(ROOT + path.sep)) throw new Error("target outside root");
if (path.basename(targetAbs) !== TARGET) throw new Error("basename mismatch");
if (!fs.existsSync(targetAbs)) throw new Error("target not found: " + TARGET);

// 开关变体: 把目标源码中的开关常量替换后写入固定临时文件(本测试目录内),
// 以字面量 require 加载。不使用 eval/new Function/变量路径 require; 用毕清理。
const UNIFY_PATCH = ["var UNIFY_AI_AND_GLOBAL = false;", "var UNIFY_AI_AND_GLOBAL = true;"];
const DOCKER_PATCH = ["var DOCKER_HUB_VIA_PROXY = true;", "var DOCKER_HUB_VIA_PROXY = false;"];

function prepareVariant(file, patches) {
  let source = fs.readFileSync(targetAbs, "utf8");
  for (const [from, to] of patches || []) {
    if (source.indexOf(from) === -1) throw new Error("patch anchor missing: " + from);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path.join(TESTDIR, file), source + '\nif (typeof module !== "undefined") module.exports = main;');
}

function requireVariant(file) {
  if (file === ".tmp-variant-base.js") return require("./.tmp-variant-base.js");
  if (file === ".tmp-variant-unify.js") return require("./.tmp-variant-unify.js");
  if (file === ".tmp-variant-docker-direct.js") return require("./.tmp-variant-docker-direct.js");
  throw new Error("unknown variant file: " + file);
}

function cleanupVariants() {
  for (const f of [".tmp-variant-base.js", ".tmp-variant-unify.js", ".tmp-variant-docker-direct.js"]) {
    try { fs.unlinkSync(path.join(TESTDIR, f)); } catch (_) { /* absent */ }
  }
}

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
const AI_TEST_URL = "https://chatgpt.com/cdn-cgi/trace";

function node(name) { return { name: name, type: "ss", server: "203.0.113.1", port: 443 }; }
const S1_PROXIES = [
  "HK IEPL 01", "US Los Angeles 01", "US San Jose 02", "JP Tokyo 01",
  "JP Osaka 02", "SG Lion 01", "KR Seoul 01", "TR Istanbul 01",
  "剩余流量：10GB", "US Los Angeles 01",
  "Expire Date: 2027-03-02", "Traffic Reset: 9 Days Left", "221.06 GB | 850 GB"
].map(node);
const PROVIDERS = { sub1: { type: "http", url: "https://example.com/sub" } };

function run(mod, proxies, providers) {
  const cfg = { proxies: JSON.parse(JSON.stringify(proxies || [])) };
  if (providers) cfg["proxy-providers"] = providers;
  return { cfg, out: mod(cfg) };
}

function ruleTarget(rule) {
  if (rule.startsWith("AND,")) return rule.endsWith(",REJECT") ? "REJECT" : null;
  const parts = rule.split(",");
  return parts[parts.length - 1] === "no-resolve" ? parts[parts.length - 2] : parts[parts.length - 1];
}
function idxOf(rules, prefix) { return rules.findIndex(r => r.startsWith(prefix)); }
function findGroup(groups, name) { return groups.find(g => g.name === name); }
function everyGroupOk(groups) {
  return groups.every(g => Array.isArray(g.proxies) && g.proxies.length > 0);
}

prepareVariant(".tmp-variant-base.js", []);
prepareVariant(".tmp-variant-unify.js", [UNIFY_PATCH]);
prepareVariant(".tmp-variant-docker-direct.js", [DOCKER_PATCH]);
const M = {
  base: requireVariant(".tmp-variant-base.js"),
  unify: requireVariant(".tmp-variant-unify.js"),
  dockerDirect: requireVariant(".tmp-variant-docker-direct.js")
};

// --- ISSUE-01 局域网开放代理无鉴权 ---
check("ISSUE-01", "authentication + skip-auth(含回环) + docker-in 监听 users(对象格式)", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const auth = out["authentication"];
  const skip = out["skip-auth-prefixes"];
  const lis = (out.listeners || []).find(l => l.name === "docker-in");
  return Array.isArray(auth) && auth.length === 1 && /^[^:]+:/.test(auth[0])
    && Array.isArray(skip) && skip.indexOf("127.0.0.1/32") !== -1
    && !!lis && Array.isArray(lis.users) && lis.users.length === 1
    && !!lis.users[0] && typeof lis.users[0] === "object"
    && typeof lis.users[0].username === "string" && typeof lis.users[0].password === "string";
});

// --- ISSUE-02 空成员组导致加载失败 ---
check("ISSUE-02", "纯港订阅+provider: 无空成员组, MAIN 兜底 DIRECT", () => {
  const { out } = run(M.base, ["HK 01", "HK 02"].map(node), PROVIDERS);
  const groups = out["proxy-groups"] || [];
  return everyGroupOk(groups)
    && findGroup(groups, MAIN).proxies.indexOf("DIRECT") !== -1;
});
check("ISSUE-02b", "常规订阅: 所有策略组静态成员非空", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  return everyGroupOk(out["proxy-groups"] || []);
});

// --- ISSUE-03 Docker 锁定规则顺序 ---
check("ISSUE-03", "IN-PORT/Docker 进程规则位于 GEOSITE,cn 之前", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  const inPort = idxOf(rules, "IN-PORT," + 7895);
  const proc = idxOf(rules, "PROCESS-NAME,com.docker.backend.exe");
  const cn = idxOf(rules, "GEOSITE,cn,DIRECT");
  return inPort !== -1 && proc !== -1 && cn !== -1 && inPort < cn && proc < cn;
});

// --- ISSUE-04 AI 测速不测 AI 可用性 + IP 一致性(稳态 fallback) ---
check("ISSUE-04", "AI 自动组为 fallback, chatgpt trace, expected-status 200", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const g = findGroup(out["proxy-groups"] || [], AI_AUTO);
  return !!g && g.type === "fallback" && g.url === AI_TEST_URL && g["expected-status"] === 200;
});

// --- ISSUE-05 空池兜底混入任意地区 ---
check("ISSUE-05", "无 AI 地区节点时 AI 组回退 MAIN, 不混入其他地区", () => {
  const { out } = run(M.base, ["HK 01", "TR Istanbul 01"].map(node));
  const g = findGroup(out["proxy-groups"] || [], AI);
  return !!g && g.proxies.join("|") === MAIN;
});

// --- ISSUE-06 内网 DNS 被劫持 ---
check("ISSUE-06", "内网域名解析走系统 DNS", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const pol = (out.dns || {})["nameserver-policy"] || {};
  const key = Object.keys(pol).find(k => k.indexOf("private") !== -1 || k.indexOf(".lan") !== -1);
  return !!key && [].concat(pol[key]).indexOf("system") !== -1;
});

// --- ISSUE-07 UNIFY 时孤儿测速组 ---
check("ISSUE-07", "UNIFY=true: 不创建 AI 测速组/AI 组, AI 域名指向 MAIN", () => {
  const { out } = run(M.unify, S1_PROXIES, PROVIDERS);
  const names = (out["proxy-groups"] || []).map(g => g.name);
  return names.indexOf(AI_AUTO) === -1 && names.indexOf(AI) === -1
    && (out.rules || []).indexOf("DOMAIN-SUFFIX,claude.ai," + MAIN) !== -1;
});

// --- ISSUE-08 AI 域名清单缺口 ---
check("ISSUE-08", "清单补齐 githubcopilot/notebooklm/huggingface/pplx/character/sora", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  return ["githubcopilot.com", "notebooklm.google.com", "huggingface.co", "pplx.ai", "character.ai", "sora.com"]
    .every(d => rules.indexOf("DOMAIN-SUFFIX," + d + "," + AI) !== -1);
});

// --- F2 Docker 进程覆盖加宽 ---
check("FIX-D2", "build/dev-envs 进程已入容器组规则", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  return rules.indexOf("PROCESS-NAME,com.docker.build.exe," + DOCKER) !== -1
    && rules.indexOf("PROCESS-NAME,com.docker.dev-envs.exe," + DOCKER) !== -1;
});

// --- ISSUE-09 QUIC 阻断误伤私网 ---
check("ISSUE-09", "局域网直连先于 QUIC/DoT 阻断", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  const lan = idxOf(rules, "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve");
  const quic = rules.findIndex(r => r.startsWith("AND,((NETWORK,UDP),(DST-PORT,443)"));
  return lan !== -1 && quic !== -1 && lan < quic;
});

// --- ISSUE-10 直连 docker.io 不可靠 (Accepted, 仅断言开关行为保留) ---
check("ISSUE-10", "DOCKER_HUB_VIA_PROXY=false 时 docker.io 直连行为保留", () => {
  const { out } = run(M.dockerDirect, S1_PROXIES, PROVIDERS);
  return (out.rules || []).indexOf("DOMAIN-SUFFIX,docker.io,DIRECT") !== -1;
});

// --- ISSUE-11 死常量 ---
check("ISSUE-11", "HARK/MANUAL/IP_CHECK/BEST_GLOBAL 死常量已删除", () => {
  const source = fs.readFileSync(targetAbs, "utf8");
  return ["HARK_GROUP", "MANUAL_GROUP", "IP_CHECK_GROUP", "BEST_GLOBAL_GROUP"]
    .every(s => source.indexOf(s) === -1);
});

// --- F1 英文提示节点过滤 ---
check("FIX-F1", "英文提示节点(Expire/Traffic Reset/GB)被过滤", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const names = (out.proxies || []).map(p => p.name);
  const groupStr = JSON.stringify(out["proxy-groups"] || []);
  return ["Expire Date: 2027-03-02", "Traffic Reset: 9 Days Left", "221.06 GB | 850 GB"]
    .every(n => names.indexOf(n) === -1 && groupStr.indexOf(n) === -1);
});

// --- IP 一致性: 全局默认跟随 AI ---
check("IP-CONS", "全局代理第一成员为 AI 专属", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const groups = out["proxy-groups"] || [];
  const mainG = findGroup(groups, MAIN);
  return !!mainG && mainG.proxies[0] === AI;
});
check("IP-CONS2", "无循环引用: MAIN 引用 AI 时 AI 不得引用 MAIN", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const groups = out["proxy-groups"] || [];
  const mainG = findGroup(groups, MAIN);
  if (!mainG || mainG.proxies.indexOf(AI) === -1) return true;
  const aiG = findGroup(groups, AI);
  return !!aiG && aiG.proxies.indexOf(MAIN) === -1;
});

// --- 跨平台: macOS 进程与 Apple fake-ip 白名单 ---
check("MACOS-1", "macOS 进程名(wpsoffice/WeChatAppEx/BaiduNetdisk)已入直连规则", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  return ["wpsoffice", "WeChatAppEx", "BaiduNetdisk", "SunloginClient"]
    .every(p => rules.indexOf("PROCESS-NAME," + p + ",DIRECT") !== -1);
});
check("MACOS-2", "fake-ip 白名单含 captive.apple.com 与 +.apple.com", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const f = (out.dns || {})["fake-ip-filter"] || [];
  return f.indexOf("captive.apple.com") !== -1 && f.indexOf("+.apple.com") !== -1;
});

// --- 通用不变量 ---
check("GEN-1", "所有规则目标可解析, MATCH 收尾", () => {
  const { out } = run(M.base, S1_PROXIES, PROVIDERS);
  const rules = out.rules || [];
  const valid = new Set(["DIRECT", "REJECT"].concat((out["proxy-groups"] || []).map(g => g.name)));
  return rules.every(r => valid.has(ruleTarget(r)))
    && rules[rules.length - 1] === "MATCH," + MAIN;
});
check("GEN-2", "空配置原样返回", () => {
  const { cfg, out } = run(M.base, [], null);
  return out === cfg && !("proxy-groups" in out);
});

let pass = 0, fail = 0;
for (const r of results) {
  if (r.ok) pass++; else fail++;
  console.log((r.ok ? "PASS" : "FAIL") + "  " + r.id.padEnd(10) + r.desc + (r.ok ? "" : "\n          ^ " + (r.err || "")));
}
console.log("\n" + pass + " passed, " + fail + " failed");
cleanupVariants();
process.exit(fail === 0 ? 0 : 1);
