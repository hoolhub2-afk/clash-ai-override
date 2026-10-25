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

## 许可证与免责声明

本项目以 [MIT](LICENSE) 协议开源。

**免责声明**:

- 本项目仅供学习、研究与个人使用,不构成任何商业服务或技术支持承诺;
- 使用者应确保自身行为符合所在国家/地区的法律法规;因违反法律法规使用本工具所产生的一切后果,由使用者自行承担;
- 本软件按"现状"提供,不附带任何明示或默示的担保(包括但不限于适销性与特定用途适用性);作者与贡献者不对使用本软件导致的任何直接或间接损失负责;
- 本项目与 mihomo / Clash / FlClash / Clash Verge 及配置中提及的任何服务商均无隶属关系;
- 配置中出现的第三方服务名称与域名仅用于路由规则示例,不代表任何合作或认可。

## 隐私与发布纪律

本仓库禁止出现任何隐私内容:真实姓名、账号、邮箱、密码、订阅信息、真实节点/服务器地址。发布前已做全量审计(文件内容、IP 归属、git 作者/提交者元数据),并固化为可重复执行的推送前检查:

```bash
bash privacy-scan.sh
```

- 禁止模式来自 `.privacy-local.txt`(仅存在于本地、已被 `.gitignore` 排除、永不入库;一行一条,自行维护);
- 提交作者/提交者邮箱必须使用 GitHub noreply 地址;
- 入库 IPv4 仅允许保留段与公共 DNS 白名单(见扫描脚本),新增地址需同步更新白名单;
- 新增任何文件后、推送前重跑一次扫描,命中即阻断。

## 质量流程记录

评审发现 12 条 ISSUE(1 High / 3 Medium / 5 Low / 3 Nit),处置:10 Fixed / 2 Accepted,无延期。关键实机修正:mihomo 监听器 `users` 必须是 `{username, password}` 对象数组,字符串写法会被整份拒绝(`users[0] expected a map, got string`)。原始脚本留档于 [`archive/override-original.js`](archive/override-original.js),仅供对照。

### 实测记录(2026-10-25)

- **AI 探测点语义**:经 AI 组实测 `chatgpt.com/cdn-cgi/trace` 返回 **200**,body 中 `loc` 与所选节点地区一致;同一出口访问 `api.openai.com` 返回 **401**(请求到达认证层,未被风控拦截)——"200=可用、403=风控"的判别语义在该出口上成立。残余:403 反例样本无法在本环境构造;即便未来语义变化,最坏退化为普通存活检查,不影响可用性。
- **Docker 进程覆盖**:Docker Desktop 29.8.2 环境确认;`DOCKER_PROCESSES` 覆盖 backend、build、dev-envs 及 WSL2 中继(wslrelay/wslhost),命中行为另有规则顺序断言与 mihomo `-t` 校验背书。逐连接目检(约 30 秒,需 Docker Desktop 运行中):执行 `docker pull hello-world`,在客户端连接面板确认来源为 `com.docker.backend.exe`、出口为「🐳 容器专属 (JP/SG)」;若出口不符,把面板显示的实际进程名补进 `DOCKER_PROCESSES` 即可。
