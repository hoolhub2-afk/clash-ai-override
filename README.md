# clash-ai-override

FlClash / Clash Verge(mihomo 内核)覆写脚本:**AI 专属分组 + 整机出口 IP 一致 + Docker 流量锁 JP/SG + 防 DNS 泄露 + 局域网接入鉴权**。

## 特性

- **IP 一致性**:全局代理默认跟随「🤖 AI 专属」组——整机出口 IP 与 ChatGPT/Claude/Gemini 完全一致。AI 自动组用 **fallback 稳态模式**:按固定顺序取第一个存活节点,只有节点失效才切换,出口 IP 不因延迟波动漂移。稳态的边界:节点宕机或被风控(健康检查 403)时自动组仍会切换、IP 随之变化;要钉死某个 IP 就在 AI 专属里手动指定节点。
- **AI 分流**:ChatGPT / Claude / Gemini / Grok / Perplexity / Copilot 等 30 个域名走美/日/新/韩/加专属池(支持 Canada / 🇨🇦 / CA / CAN / 加拿大 / 多伦多 / Vancouver 等写法);测速探测点用 `chatgpt.com/cdn-cgi/trace`(`expected-status: 200`),命中风控的节点自动淘汰。
- **Docker 锁定**:7895 专属监听端口 + Docker 进程名的规则排在国内直连之前,容器流量(含国内镜像)强制走 JP/SG;没有可用 JP/SG 节点时容器流量拒绝,避免意外直连或混用其他出口。
- **防泄露**:国内域名走国内 DoH、其余走经代理的境外 DoH(DoH 服务器 IP 锁经代理);阻断海外 QUIC(UDP 443)与 DoT(853)旁路;内网域名交还系统 DNS。
- **接入安全**:入站鉴权——只有本机回环免密,局域网设备与 Docker 容器都必须带凭据,不再是开放代理;`PROXY_PASS` 还是占位符时脚本直接报错,不会带着 `CHANGE_ME` 运行。
- **加载健壮**:任何订阅形态(含纯港节点、纯 provider)都不产生空成员组,配置必定可加载;纯 provider 订阅的「🌐 全局代理」默认落在订阅源测速组上,不会默认直连出网;中英文订阅提示节点(到期/Expire/Traffic Reset/流量条)自动过滤;`DOCKER_PORT` 被别的监听占用时显式报错,不会静默删掉你的配置。

## 使用

1. 把 [`override.js`](override.js) 全文粘贴进 FlClash 的「覆写」或 Clash Verge 的扩展脚本;也可以用无注释版 [`override.min.js`](override.min.js)(由 `node scripts/strip-comments.js` 从源生成,构建时自动做行为等价与零注释校验);若需要 Provider 专属独立测速与 Go RE2 正则支持,也可选用加固版 [`override-v1.3.2.js`](override-v1.3.2.js)。
2. **先把 `PROXY_PASS` 的 `CHANGE_ME` 改成自己的密码**,再保存;没改就加载会直接报错(安全停止),不会用占位密码跑起来。
3. 在「🤖 AI 专属」里选一个节点(手动指定最稳);「🌐 全局代理」保持默认(自动跟随 AI 专属)。
4. 局域网设备 / Docker 容器接入时:先把 `ALLOW_LAN_ACCESS` 改为 `true`,再使用 `http://lan:<你的密码>@<本机IP>:7895`(只有本机回环免密;容器走 `host.docker.internal:7895` 同样要带凭据)。
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
| `ALLOW_LAN_ACCESS` | `false` | `true` 才绑定 `0.0.0.0` 接受局域网/容器接入;默认仅本机回环,且密码必须满足强度要求 |
| `UNIFY_AI_AND_GLOBAL` | `false` | `true` = 取消 AI 独立分组,AI 域名并入全局 |

*注: `override-v1.3.2.js` 生产加固版额外支持 `INCLUDE_WSL_IN_DOCKER`(默认 `false`, 防误伤通用 WSL2)与 `GLOBAL_ALL`(默认 `false`)开关。两版均支持 `ALLOW_LAN_ACCESS`(默认 `false`, 局域网监听显式放行控制)。*

## 测试与验证

```bash
# 结构回归: 48 条断言(空组、纯 provider 默认出口、凭据 fail closed、端口冲突、Cloudflare 管理面板直连、规则顺序、循环引用、鉴权字段、过滤器、空池兜底、加拿大 AI 池、Docker Hub 开关优先级等)
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
override.js              覆写脚本源码(主干维护源)
override.min.js          无注释构建产物(node scripts/strip-comments.js 生成, 勿手改)
override-v1.3.2.js       生产加固版源码(支持 Provider _ai 独立测速与 RE2 正则)
CLAUDE.md                Claude Code 智能体项目指引与架构规范
test/test-override.js    结构回归测试(48 条断言, 支持 TEST_TARGET 多目标验证)
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
- **Linux**:Linux 环境(如 FlClash / Clash Verge Rev Linux 端)原生运行 Docker 时,容器可配置 `--add-host=host.docker.internal:host-gateway` 或通过 `172.17.0.1:7895` 带凭据接入。
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
