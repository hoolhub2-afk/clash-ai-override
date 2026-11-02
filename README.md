# clash-ai-override

FlClash / Clash Verge(mihomo 内核)覆写脚本:**AI 专属分组 + 整机出口 IP 一致 + Docker 流量锁 JP/SG + 防 DNS 泄露 + 局域网接入鉴权**。经 EALC 工程流程加固:对抗式代码评审(12 条 ISSUE)→ 逐条修复 → mihomo v1.19.29 真内核 `-t` 实机验证。

## 特性

- **IP 一致性**:全局代理默认跟随「🤖 AI 专属」组——整机出口 IP 与 ChatGPT/Claude/Gemini 完全一致。AI 自动组用 **fallback 稳态模式**:按固定顺序取第一个存活节点,只有节点失效才切换,出口 IP 不因延迟波动漂移。稳态的边界:节点宕机或被风控(健康检查 403)时自动组仍会切换、IP 随之变化;要钉死某个 IP 就在 AI 专属里手动指定节点。
- **AI 分流**:ChatGPT / Claude / Gemini / Grok / Perplexity / Copilot 等 30 个域名走美/日/新/韩专属池;测速探测点用 `chatgpt.com/cdn-cgi/trace`(`expected-status: 200`),命中风控的节点自动淘汰。
- **Docker 锁定**:7895 专属监听端口 + Docker 进程名的规则排在国内直连之前,容器流量(含国内镜像)强制走 JP/SG。
- **防泄露**:国内域名走国内 DoH、其余走经代理的境外 DoH(DoH 服务器 IP 锁经代理);阻断海外 QUIC(UDP 443)与 DoT(853)旁路;内网域名交还系统 DNS。
- **接入安全**:入站鉴权——只有本机回环免密,局域网设备与 Docker 容器都必须带凭据,不再是开放代理;`PROXY_PASS` 还是占位符时脚本直接报错,不会带着 `CHANGE_ME` 运行。
- **加载健壮**:任何订阅形态(含纯港节点、纯 provider)都不产生空成员组,配置必定可加载;纯 provider 订阅的「🌐 全局代理」默认落在订阅源测速组上,不会默认直连出网;中英文订阅提示节点(到期/Expire/Traffic Reset/流量条)自动过滤;`DOCKER_PORT` 被别的监听占用时显式报错,不会静默删掉你的配置。

## 使用

1. 把 [`override.js`](override.js) 全文粘贴进 FlClash 的「覆写」或 Clash Verge 的扩展脚本;也可以用无注释版 [`override.min.js`](override.min.js)(由 `node scripts/strip-comments.js` 从源生成,构建时自动做行为等价与零注释校验,两者任选其一)。
2. **先把 `PROXY_PASS` 的 `CHANGE_ME` 改成自己的密码**,再保存;没改就加载会直接报错(安全停止),不会用占位密码跑起来。
3. 在「🤖 AI 专属」里选一个节点(手动指定最稳);「🌐 全局代理」保持默认(自动跟随 AI 专属)。
4. 局域网设备 / Docker 容器接入时: `http://lan:<你的密码>@<本机IP>:7895`(只有本机回环免密;容器走 `host.docker.internal:7895` 同样要带凭据)。
5. 提示:覆写重载(改配置、切订阅、重启客户端)可能重置分组的手动选择,重载后到各策略组确认一下当前选中节点。

## 配置开关

客户端只把订阅配置传给 `main(config)`,所以**改默认值就是改源码里的常量**。函数同时接受可选的第二参数 `options`,同名键会覆盖默认值——它只给单元测试和本地校验用,客户端不会传。

| 常量 | 默认 | 说明 |
|---|---|---|
| `ENABLE_TUN` | `true` | 开 TUN;若在客户端界面手动关 TUN,需改 `false` |
| `LOCK_STRICT_ROUTE` | `false` | Windows 下保持 false,防切换节点断流 |
| `DOCKER_PORT` | `7895` | Docker 专属混合监听端口;被其他 listener 占用时脚本报错而不是静默删除 |
| `DOCKER_HUB_VIA_PROXY` | `true` | Docker Hub 走 JP/SG 容器代理;`false` 为国内直连(大陆对 registry-1.docker.io 长期不稳定,建议保持 true) |
| `PROXY_USER` / `PROXY_PASS` | `lan` / `CHANGE_ME` | 局域网与容器接入凭据;**密码必须修改**,仍是占位符时脚本直接报错 |
| `UNIFY_AI_AND_GLOBAL` | `false` | `true` = 取消 AI 独立分组,AI 域名并入全局 |

## 测试与验证

```bash
# 结构回归: 37 条断言(空组、纯 provider 默认出口、凭据 fail closed、端口冲突、Cloudflare 管理面板直连、规则顺序、循环引用、鉴权字段、过滤器等)
node test/test-override.js

# 构建无注释版 override.min.js(含行为等价 + 零注释幂等自检)
node scripts/strip-comments.js

# 真内核校验: 从 FlClash/Clash Verge 数据目录拷贝 geosite.dat、geoip.dat、
# Country.mmdb 进 verify/(缺 mmdb 时 GEOIP 规则会尝试联网下载而失败)
node scripts/gen-verify-config.js
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

## 仓库结构

```
override.js              覆写脚本源码(唯一需要人工维护的文件)
override.min.js          无注释构建产物(node scripts/strip-comments.js 生成, 勿手改)
test/test-override.js    结构回归测试(37 条断言)
scripts/strip-comments.js       无注释构建工具
scripts/gen-verify-config.js    真内核校验配置生成
scripts/privacy-scan.sh         推送前隐私泄露扫描
verify/                  真内核校验样例配置与 provider 夹具
archive/                 原始脚本留档(勿直接使用)
```

## 平台说明

一套脚本同时适配 Windows 与 macOS(FlClash / Clash Verge Rev 双端),无需分开维护:

- **Windows**:默认即用;`LOCK_STRICT_ROUTE` 保持 `false`,防切换节点断流。
- **macOS**:国内应用直连规则使用 macOS 应用进程名(WeChat / wpsoffice / BaiduNetdisk / WeChatAppEx 等,与 Windows 名单合并维护);fake-ip 白名单已加入 `captive.apple.com` 与 `+.apple.com`,避免系统联网检测误判与 App Store / iCloud 异常;首次开 TUN 需在系统弹窗中允许客户端安装辅助工具;macOS 无 Windows 的断流问题,`LOCK_STRICT_ROUTE` 可改为 `true` 获得更严谨的防泄露。
- 进程名匹配依赖 `find-process-mode: strict`(已内置);两平台共用同一份覆写与同一个 7895 容器端口。

## 隐私与发布纪律

本仓库禁止出现任何隐私内容:真实姓名、账号、邮箱、密码、订阅信息、真实节点/服务器地址。发布前已做全量审计(文件内容、IP 归属、git 作者/提交者元数据),并固化为可重复执行的推送前检查:

```bash
bash scripts/privacy-scan.sh
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

### 修订记录(2026-10-28)

对桌面改稿做对照复核后合并回仓库,并修掉复核发现的问题:

- **纯 provider 订阅默认直连**:`preferredNames` 只统计静态节点,纯 provider 订阅会让「🌐 全局代理」兜底成 `DIRECT` 并默认直连出网。现在新增「⚡ 订阅源自动 (全部)」组(只挂 `exclude-filter`,避免按地区过滤成空组),由它做 MAIN 的首选成员。容器组仍保留 `DIRECT` 兜底:订阅不含 JP/SG 时无法兑现"锁死"语义,此时需在「🐳 容器专属」手动选 provider 节点。
- **provider 组级测速被移除**:改稿把 `use` 从优选/容器/AI 自动组上去掉,provider 节点不再参与组级测速。已恢复 `use`,与 provider 自身 health-check 并存。
- **监听器空条目**:改稿的过滤条件保留了 `null` 条目,会让 YAML 解析失败;现在丢弃空/非对象条目。
- **端口冲突**:`DOCKER_PORT` 被其他 listener 占用时改为显式报错(此前是静默删除该 listener)。
- **入站鉴权收紧**:`skip-auth-prefixes` 只保留回环,不再对整个 `172.16/12` 与 `192.168.65/24` 免密;容器走 7895 时用 `users` 凭据。
- **凭据 fail closed**:`PROXY_PASS` 仍是 `CHANGE_ME`、`PROXY_USER` 为空、端口非法时直接报错。
- **provider health-check 兜底**:缺 `url/interval/timeout/expected-status` 时补默认值,显式 `enable: false` 保留。
- **工具链**:开关改为可选第二参数 `options`,测试不再做源码字符串替换(改稿的写法会让 `test-override.js` 直接崩在锚点缺失上);`strip-comments.js` / `gen-verify-config.js` 同步改为注入测试凭据。
- **规则顺序**:`169.254/16`、`100.64/10`、`GEOSITE,private`、`GEOIP,private` 一并提到 QUIC/DoT 阻断之前。

本轮 `node test/test-override.js` 30 条断言全绿,`override.min.js` 重建通过行为等价与零注释自检;`mihomo -t` 真内核复验需在装有内核的机器上执行(本次复核环境未安装 mihomo)。
