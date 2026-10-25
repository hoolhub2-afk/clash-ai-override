// 构建工具: 从仓库根目录的 override.js 生成无注释版 override.min.js。
// 剥离器是识别字符串/正则字面量的状态机(URL 里的 // 不会被误删)。
// 落盘前两项自检: 1) 与注释版对同一组夹具生成的配置逐字节一致(行为等价);
// 2) 对产物再剥一遍结果不变(幂等, 证明零注释残留)。
// 用法: node scripts/strip-comments.js
"use strict";
const fs = require("fs");
const path = require("path");
const TOOLDIR = __dirname;
const ROOT = path.resolve(__dirname, "..");

const SRC = "override.js";
const DST = "override.min.js";
// 白名单 + 目录边界校验, 禁止越出仓库根目录
const ALLOWED_TARGETS = { "override.js": true, "override.min.js": true };
if (!ALLOWED_TARGETS[SRC] || !ALLOWED_TARGETS[DST]) throw new Error("file not in whitelist");
const srcAbs = path.resolve(ROOT, SRC);
const dstAbs = path.resolve(ROOT, DST);
if (!srcAbs.startsWith(ROOT + path.sep) || path.basename(srcAbs) !== SRC) throw new Error("bad src path");
if (!dstAbs.startsWith(ROOT + path.sep) || path.basename(dstAbs) !== DST) throw new Error("bad dst path");
if (!fs.existsSync(srcAbs)) throw new Error("source not found: " + SRC);

function stripComments(src) {
  let out = "";
  let mode = "code"; // code | squote | dquote | regex | line | block
  let prev = "";     // code 态最近一个非空白字符, 用于区分除号与正则起始
  let inClass = false;
  const regexStartOk = (p) => p === "" || "=([,!&|?{};:+".indexOf(p) !== -1;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (mode === "code") {
      if (two === "//") { mode = "line"; i += 2; continue; }
      if (two === "/*") { mode = "block"; i += 2; continue; }
      if (c === "'") { mode = "squote"; out += c; prev = c; i++; continue; }
      if (c === '"') { mode = "dquote"; out += c; prev = c; i++; continue; }
      if (c === "/" && regexStartOk(prev)) { mode = "regex"; inClass = false; out += c; prev = c; i++; continue; }
      out += c;
      if (!/\s/.test(c)) prev = c;
      i++;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; }
      i++;
      continue;
    }
    if (mode === "block") {
      if (two === "*/") { mode = "code"; out += " "; i += 2; continue; }
      i++;
      continue;
    }
    if (mode === "squote" || mode === "dquote") {
      out += c;
      if (c === "\\") { out += src[i + 1] || ""; i += 2; continue; }
      if ((mode === "squote" && c === "'") || (mode === "dquote" && c === '"')) { mode = "code"; }
      i++;
      continue;
    }
    if (mode === "regex") {
      out += c;
      if (c === "\\") { out += src[i + 1] || ""; i += 2; continue; }
      if (inClass) { if (c === "]") inClass = false; i++; continue; }
      if (c === "[") { inClass = true; i++; continue; }
      if (c === "/") { mode = "code"; }
      i++;
      continue;
    }
  }
  if (mode !== "code") throw new Error("strip aborted: unbalanced state " + mode);
  return out
    .split("\n")
    .map(function (l) { return l.replace(/[ \t]+$/, ""); })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

function node(name) { return { name: name, type: "ss", server: "203.0.113.1", port: 443, cipher: "aes-128-gcm", password: "fixture" }; }
const BASE = { "mixed-port": 7890, mode: "rule", "log-level": "info" };
const FIXTURES = [
  Object.assign({}, BASE, {
    proxies: [
      "HK IEPL 01", "US Los Angeles 01", "US San Jose 02", "JP Tokyo 01",
      "JP Osaka 02", "SG Lion 01", "KR Seoul 01", "TR Istanbul 01",
      "剩余流量：10GB", "Expire Date: 2027-03-02", "Traffic Reset: 9 Days Left", "221.06 GB | 850 GB"
    ].map(node)
  }),
  Object.assign({}, BASE, {
    proxies: ["HK HKG 01", "HK 尖沙咀 02"].map(node),
    "proxy-providers": {
      sub1: { type: "file", path: "provider-test.yaml",
        "health-check": { enable: true, url: "http://cp.cloudflare.com/generate_204", interval: 300 } }
    }
  })
];

fs.writeFileSync(path.join(TOOLDIR, ".tmp-strip-src.js"),
  fs.readFileSync(srcAbs, "utf8") + '\nif (typeof module !== "undefined") module.exports = main;');
const stripped = stripComments(fs.readFileSync(srcAbs, "utf8"));
fs.writeFileSync(path.join(TOOLDIR, ".tmp-strip-min.js"),
  stripped + '\nif (typeof module !== "undefined") module.exports = main;');
const mainA = require("./.tmp-strip-src.js");
const mainB = require("./.tmp-strip-min.js");

for (let k = 0; k < FIXTURES.length; k++) {
  const a = JSON.stringify(mainA(JSON.parse(JSON.stringify(FIXTURES[k]))));
  const b = JSON.stringify(mainB(JSON.parse(JSON.stringify(FIXTURES[k]))));
  if (a !== b) throw new Error("equivalence failed on fixture #" + k);
}

if (stripComments(stripped) !== stripped) throw new Error("idempotency failed: comments remain in output");

fs.writeFileSync(dstAbs, stripped);
fs.unlinkSync(path.join(TOOLDIR, ".tmp-strip-src.js"));
fs.unlinkSync(path.join(TOOLDIR, ".tmp-strip-min.js"));
console.log("written: " + DST + " (" + stripped.length + " bytes, 行为等价 " +
  FIXTURES.length + "/" + FIXTURES.length + ", 零注释幂等自检通过)");
