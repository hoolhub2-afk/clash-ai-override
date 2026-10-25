// 实机校验配套: 用 override.js 的 main() 生成两份完整配置(JSON),
// 供 mihomo/verge-mihomo -t 做真内核校验。安全模式与 test-override.js 相同:
// 白名单目标 + 固定临时文件 + 字面量 require, 不使用 eval/动态路径。
// 用法: node gen-verify-config.js   (输出 verify/config.json 与 verify/config-b.json)
// 内核校验: mihomo -t -d <含 geosite.dat/geoip.dat 的目录> -f verify/config.json
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;

const ALLOWED_TARGETS = ["override.js"];
const TARGET = "override.js";
if (ALLOWED_TARGETS.indexOf(TARGET) === -1) throw new Error("target not in whitelist");
const targetAbs = path.resolve(ROOT, TARGET);
if (!targetAbs.startsWith(ROOT + path.sep)) throw new Error("target outside root");
if (path.basename(targetAbs) !== TARGET) throw new Error("basename mismatch");
if (!fs.existsSync(targetAbs)) throw new Error("target not found: " + TARGET);

fs.writeFileSync(path.join(ROOT, ".tmp-gen-main.js"),
  fs.readFileSync(targetAbs, "utf8") + '\nif (typeof module !== "undefined") module.exports = main;');
const main = require("./.tmp-gen-main.js");

function node(name) { return { name: name, type: "ss", server: "203.0.113.1", port: 443, cipher: "aes-128-gcm", password: "fixture" }; }

const BASE = { "mixed-port": 7890, mode: "rule", "log-level": "info" };

// 场景 A: 常规订阅(静态节点, 美/日/新/韩/港/土混合 + 中英文提示节点)
const cfgA = main(Object.assign({}, BASE, {
  proxies: [
    "HK IEPL 01", "US Los Angeles 01", "US San Jose 02", "JP Tokyo 01",
    "JP Osaka 02", "SG Lion 01", "KR Seoul 01", "TR Istanbul 01",
    "剩余流量：10GB", "US Los Angeles 01",
    "Expire Date: 2027-03-02", "Traffic Reset: 9 Days Left", "221.06 GB | 850 GB"
  ].map(node)
}));

// 场景 B: 纯港静态节点 + 本地 file provider(ISSUE-02 的实机复现场景)
const cfgB = main(Object.assign({}, BASE, {
  proxies: ["HK HKG 01", "HK 尖沙咀 02"].map(node),
  "proxy-providers": {
    sub1: {
      type: "file",
      path: "provider-test.yaml",
      "health-check": { enable: true, url: "http://cp.cloudflare.com/generate_204", interval: 300 }
    }
  }
}));

const outDir = path.join(ROOT, "verify");
fs.writeFileSync(path.join(outDir, "config.json"), JSON.stringify(cfgA, null, 2));
fs.writeFileSync(path.join(outDir, "config-b.json"), JSON.stringify(cfgB, null, 2));
fs.unlinkSync(path.join(ROOT, ".tmp-gen-main.js"));
console.log("written: verify/config.json (static), verify/config-b.json (hk-only+provider)");
