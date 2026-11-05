"use strict";

// v1.5.2 行为回归测试。唯一实现基线是仓库根目录的 override.js。
const assert = require("assert");
const main = require("../override.js");

const MAIN = "🌐 全局代理";
const AI = "🤖 AI 专属 (低延迟候选)";
const AI_AUTO = "🤖 AI 自动 (稳态)";
const DOCKER = "🐳 容器专属 (JP/SG)";
const DOCKER_AUTO = "🐳 容器自动测速";
const PROVIDER_AUTO = "⚡ 订阅源自动 (全部)";
const AI_URL = "https://chatgpt.com/cdn-cgi/trace";
const TEST_URL = "https://cp.cloudflare.com/generate_204";
const PASS = "fixture-pass";

function node(name) {
  return { name, type: "ss", server: "203.0.113.1", port: 443 };
}
function config(proxies, providers) {
  const out = { proxies: proxies.map(node) };
  if (providers) out["proxy-providers"] = JSON.parse(JSON.stringify(providers));
  return out;
}
function group(out, name) {
  return (out["proxy-groups"] || []).find(item => item.name === name);
}
function ruleIndex(out, text) {
  return (out.rules || []).indexOf(text);
}
function expectThrow(fn, text) {
  assert.throws(fn, error => String(error.message).includes(text));
}
function check(name, fn) {
  try {
    fn();
    console.log("PASS  " + name);
  } catch (error) {
    console.error("FAIL  " + name + "\n      " + error.message);
    process.exitCode = 1;
  }
}

const mixedNodes = [
  "Canada Toronto 01", "Taiwan Taipei 01", "United Kingdom London 01", "France Paris 01",
  "Germany Frankfurt 01", "Philippines Manila 01", "Netherlands Amsterdam 01", "Turkey Istanbul 01",
  "Vietnam Hanoi 01", "Malaysia Kuala Lumpur 01", "Thailand Bangkok 01", "Japan Tokyo 01",
  "Singapore Lion 01", "Korea Seoul 01", "United States Los Angeles 01", "HK IEPL 01",
  "US CN2 GIA 01", "剩余流量：10GB", "Expire Date: 2027-03-02"
];
const providers = {
  sub1: { type: "http", url: "https://example.com/sub", path: "./providers/sub.yaml" },
  file1: { type: "file", path: "./providers/file.yaml" }
};

check("AI 自动组使用 url-test 与 AI 探测", () => {
  const out = main(config(mixedNodes, providers));
  const aiAuto = group(out, AI_AUTO);
  assert(aiAuto);
  assert.strictEqual(aiAuto.type, "url-test");
  assert.strictEqual(aiAuto.url, AI_URL);
  assert.strictEqual(aiAuto.interval, 120);
  assert.strictEqual(aiAuto.timeout, 5000);
  assert.strictEqual(aiAuto["expected-status"], 200);
  assert(aiAuto.proxies.includes("Canada Toronto 01"));
  assert(aiAuto.proxies.includes("Taiwan Taipei 01"));
  assert(!aiAuto.proxies.includes("HK IEPL 01"));
});

check("AI 扩展地区进入 AI 池但不进入 Docker 池", () => {
  const out = main(config(mixedNodes, providers));
  const ai = group(out, AI);
  const docker = group(out, DOCKER);
  ["Canada Toronto 01", "Taiwan Taipei 01", "United Kingdom London 01", "Philippines Manila 01", "Netherlands Amsterdam 01", "Thailand Bangkok 01"]
    .forEach(name => assert(ai.proxies.includes(name)));
  ["Canada Toronto 01", "Taiwan Taipei 01", "United Kingdom London 01"].forEach(name => assert(!docker.proxies.includes(name)));
  assert(docker.proxies.includes("Japan Tokyo 01"));
  assert(docker.proxies.includes("Singapore Lion 01"));
});

check("默认空密码保持本机安全模式", () => {
  const out = main(config(["US Los Angeles 01"]));
  assert.strictEqual(out["allow-lan"], false);
  assert.strictEqual(out["bind-address"], "127.0.0.1");
  assert(!Object.prototype.hasOwnProperty.call(out, "authentication"));
  const listener = out.listeners.find(item => item.name === "docker-in");
  assert(listener);
  assert.strictEqual(listener.listen, "127.0.0.1");
  assert(!Object.prototype.hasOwnProperty.call(listener, "users"));
});

check("LAN 开启必须使用强密码并写入鉴权", () => {
  const out = main(config(["US Los Angeles 01"]), {
    ALLOW_LAN_ACCESS: true, PROXY_USER: "lan", PROXY_PASS: PASS
  });
  assert.strictEqual(out["allow-lan"], true);
  assert.strictEqual(out["bind-address"], "0.0.0.0");
  assert.deepStrictEqual(out.authentication, ["lan:" + PASS]);
  const listener = out.listeners.find(item => item.name === "docker-in");
  assert.strictEqual(listener.listen, "0.0.0.0");
  assert.deepStrictEqual(listener.users, [{ username: "lan", password: PASS }]);
  expectThrow(() => main(config(["US 01"]), { ALLOW_LAN_ACCESS: true, PROXY_PASS: "password" }), "弱密码");
});

check("TUN 强制启用 strict-route", () => {
  const out = main(config(["US Los Angeles 01"]));
  assert.deepStrictEqual(out.tun["dns-hijack"], ["any:53", "tcp://any:53"]);
  assert.strictEqual(out.tun.enable, true);
  assert.strictEqual(out.tun["strict-route"], true);
  expectThrow(() => main(config(["US 01"]), { ENABLE_TUN: false }), "ENABLE_TUN=true");
});

check("Provider 派生 _ai 并保留文件型路径", () => {
  const out = main(config([], providers));
  const all = out["proxy-providers"];
  assert(all.sub1_ai && all.file1_ai);
  assert.strictEqual(all.sub1_ai.path, "./providers/sub_ai.yaml");
  assert.strictEqual(all.file1_ai.path, "./providers/file.yaml");
  assert.strictEqual(all.sub1_ai["health-check"].url, AI_URL);
  assert.strictEqual(all.sub1_ai["health-check"]["expected-status"], 200);
  assert.strictEqual(all.sub1["health-check"].url, TEST_URL);
  assert(group(out, PROVIDER_AUTO));
  expectThrow(() => main(config([], Object.assign({}, providers, {
    sub1_ai: { type: "file", path: "./providers/existing.yaml" }
  })), {}), "Provider 名称冲突");
});

check("STUN/TURN/UDP443 规则经主代理且顺序正确", () => {
  const out = main(config(["US Los Angeles 01"]));
  const rules = out.rules;
  const stun = ruleIndex(out, "DOMAIN-SUFFIX,stun.l.google.com," + MAIN);
  const turn = ruleIndex(out, "AND,((NETWORK,UDP),(DST-PORT,5349))," + MAIN);
  const udp443 = rules.findIndex(rule => rule.startsWith("AND,((NETWORK,UDP),(DST-PORT,443)"));
  const domestic = ruleIndex(out, "GEOSITE,cn,DIRECT");
  assert(stun >= 0 && turn >= 0 && udp443 >= 0);
  assert(stun < domestic && turn < domestic && udp443 < domestic);
  assert(rules.includes("AND,((NETWORK,UDP),(DST-PORT,19302-19309))," + MAIN));
  assert(!rules.some(rule => rule.endsWith(",REJECT") && rule.includes("DST-PORT,443")));
});

check("DNS policy 隔离国内、国际、私有域名", () => {
  const out = main(config(["US Los Angeles 01"]));
  assert.deepStrictEqual(out.dns["default-nameserver"], ["tls://223.5.5.5"]);
  assert.deepStrictEqual(out.dns["proxy-server-nameserver"], ["https://223.5.5.5/dns-query", "https://doh.pub/dns-query"]);
  assert.deepStrictEqual(out.dns.nameserver, ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"]);
  assert.deepStrictEqual(out.dns["nameserver-policy"]["geosite:cn"], out.dns["proxy-server-nameserver"]);
  assert.deepStrictEqual(out.dns["nameserver-policy"]["geosite:geolocation-!cn"], out.dns.nameserver);
  assert.deepStrictEqual(out.dns["nameserver-policy"]["geosite:private"], ["system"]);
  assert.strictEqual(out.dns["respect-rules"], true);
});

check("过滤、empty-fallback 与最终 MATCH 规则保持安全", () => {
  const out = main(config(mixedNodes, providers));
  const names = out.proxies.map(item => item.name);
  assert(!names.includes("HK IEPL 01"));
  assert(!names.includes("剩余流量：10GB"));
  assert(!names.includes("Expire Date: 2027-03-02"));
  out["proxy-groups"].filter(item => item.use).forEach(item => assert.strictEqual(item["empty-fallback"], "REJECT"));
  assert.strictEqual(out.rules[out.rules.length - 1], "MATCH," + MAIN);
});

if (process.exitCode) process.exit(1);
console.log("\nAll v1.5.2 behavior checks passed.");
