# clash-ai-override

FlClash / Clash Verge(mihomo 内核)覆写脚本:**AI 专属分组 + 整机出口 IP 一致 + Docker 流量锁 JP/SG + 防 DNS 泄露 + 局域网接入鉴权**。经 EALC 工程流程加固:对抗式代码评审(12 条 ISSUE)→ 逐条修复 → mihomo v1.19.29 真内核 `-t` 实机验证。

## 特性

- **IP 一致性**:全局代理默认跟随「🤖 AI 专属」组——整机出口 IP 与 ChatGPT/Claude/Gemini 完全一致。AI 自动组用 **fallback 稳态模式**:按固定顺序取第一个存活节点,只有节点失效才切换,出口 IP 不因延迟波动漂移。稳态的边界:节点宕机或被风控(健康检查 403)时自动组仍会切换、IP 随之变化;要钉死某个 IP 就在 AI 专属里手动指定节点。
- **AI 分流**:ChatGPT / Claude / Gemini / Grok / Perplexity / Copilot 等 30 个域名走美/日/新/韩专属池;测速探测点用 `chatgpt.com/cdn-cgi/trace`(`expected-status: 200`),命中风控的节点自动淘汰。
- **Docker 锁定**:7895 专属监听端口 + Docker 进程名的规则排在国内直连之前,容器流量(含国内镜像)强制走 JP/SG。
- **防泄露**:国内域名走国内 DoH、其余走经代理的境外 DoH(DoH 服务器 IP 锁经代理);阻断海外 QUIC(UDP 443)与 DoT(853)旁路;内网域名交还系统 DNS。
- **接入安全**:入站鉴权——本机回环与 Docker 内部网段免密,局域网设备必须带凭据,不再是开放代理。
- **加载健壮**:任何订阅形态(含纯港节点、纯 provider)都不产生空成员组,配置必定可加载;中英文订阅提示节点(到期/Expire/Traffic Reset/流量条)自动过滤。

## 使用

1. 把 [`override.js`](override.js) 全文粘贴进 FlClash 的「覆写」或 Clash Verge 的扩展脚本。
2. **先把 `PROXY_PASS` 的 `CHANGE_ME` 改成自己的密码**,再保存。
3. 在「🤖 AI 专属」里选一个节点(手动指定最稳);「🌐 全局代理」保持默认(自动跟随 AI 专属)。
4. 局域网设备 / Docker 容器接入时: `http://lan:<你的密码>@<本机IP>:7895`(本机自身免密)。
5. 提示:覆写重载(改配置、切订阅、重启客户端)可能重置分组的手动选择,重载后到各策略组确认一下当前选中节点。

## 配置开关

| 常量 | 默认 | 说明 |
|---|---|---|
| `ENABLE_TUN` | `true` | 开 TUN;若在客户端界面手动关 TUN,需改 `false` |
| `LOCK_STRICT_ROUTE` | `false` | Windows 下保持 false,防切换节点断流 |
| `DOCKER_PORT` | `7895` | Docker 专属混合监听端口 |
| `DOCKER_HUB_VIA_PROXY` | `true` | Docker Hub 走 JP/SG 容器代理;`false` 为国内直连(大陆对 registry-1.docker.io 长期不稳定,建议保持 true) |
| `PROXY_USER` / `PROXY_PASS` | `lan` / `CHANGE_ME` | 局域网与容器接入凭据,**密码必须修改** |
| `UNIFY_AI_AND_GLOBAL` | `false` | `true` = 取消 AI 独立分组,AI 域名并入全局 |

## 测试与验证

```bash
# 结构回归: 17 条断言(空组、规则顺序、循环引用、鉴权字段、过滤器等)
node test-override.js

# 真内核校验: 从 FlClash/Clash Verge 数据目录拷贝 geosite.dat、geoip.dat、
# Country.mmdb 进 verify/(缺 mmdb 时 GEOIP 规则会尝试联网下载而失败)
node gen-verify-config.js
mihomo -t -d verify -f verify/config.json     # 场景 A: 常规静态订阅
mihomo -t -d verify -f verify/config-b.json   # 场景 B: 纯港节点 + provider
```

`verify/` 内附两份已通过校验的样例配置与 provider 夹具(节点均为文档保留段假地址)。

## 质量流程记录

评审发现 12 条 ISSUE(1 High / 3 Medium / 5 Low / 3 Nit),处置:10 Fixed / 2 Accepted,无延期。关键实机修正:mihomo 监听器 `users` 必须是 `{username, password}` 对象数组,字符串写法会被整份拒绝(`users[0] expected a map, got string`)。原始脚本留档于 [`archive/override-original.js`](archive/override-original.js),仅供对照。

已知保留项(一次性人工确认):
- `chatgpt.com/cdn-cgi/trace` 的 403=风控 语义需在客户端确认一次;
- WSL2 出口进程名覆盖需 `docker pull` 实测,若未命中容器组,把实际进程名补进 `DOCKER_PROCESSES`。
