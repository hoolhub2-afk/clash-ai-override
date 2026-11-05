# clash-ai-override

FlClash / Clash Verge（mihomo 内核）覆写脚本，行为基线为 `mihomo-override-v1.5.2.js`：AI 专属分组、稳定自动测速、Docker 流量隔离、DNS 防泄漏与默认本机安全模式。

## v1.5.2 特性

- **AI 自动组**：AI 自动组使用 `url-test`，探测 `https://chatgpt.com/cdn-cgi/trace`，间隔 120 秒、超时 5 秒、`expected-status: 200`。
- **AI 地区池**：支持美/日/新/韩/加、台湾、英国、法国、德国、菲律宾、荷兰、土耳其、越南、马来西亚、泰国等地区的常见中英文名称与旗帜写法。
- **Provider 派生**：纯 `proxy-providers` 自动补全普通健康检查，并派生 `<name>_ai` AI 探测实例；HTTP provider 使用独立缓存路径，file provider 复用原节点文件。
- **本机安全默认值**：默认不开放 LAN，绑定 `127.0.0.1`；默认空密码不会写入 `authentication` 或 listener users。开启 LAN 时必须配置至少 8 位强密码，否则 Fail-Closed。
- **TUN 强制安全**：要求 `ENABLE_TUN=true`，并固定 `strict-route=true`、DNS 劫持与自动路由。
- **WebRTC / TURN 防泄漏**：STUN 域名、TCP/UDP 3478、5349、UDP 19302-19309，以及国际 UDP/443 均优先进入全局代理组。
- **DNS policy 隔离**：国内与节点解析使用国内 DoH；国际域名使用国际 DoH；私有域名交给系统 DNS；不配置 fallback。
- **安全空池**：provider 组统一使用 `empty-fallback: REJECT`，避免空池静默直连。

## 使用

1. 将 [`override.js`](override.js) 全文粘贴进 FlClash 或 Clash Verge 的覆写/扩展脚本；也可以使用无注释版 [`override.min.js`](override.min.js)。
2. 客户端只传 `main(config)`；脚本第二参数 `options` 仅用于测试和本地校验，不会由客户端传入。
3. 默认仅本机回环可用。需要局域网或容器接入时，设置 `ALLOW_LAN_ACCESS=true` 并配置强 `PROXY_PASS`。
4. Docker 使用 `7895` 混合监听端口，并使用 `lan:<密码>` 凭据连接。

## 配置开关

| 常量 | 默认 | 说明 |
|---|---:|---|
| `ENABLE_TUN` | `true` | 必须保持为 `true`；关闭会直接报错。 |
| `DOCKER_PORT` | `7895` | Docker 专属混合监听端口；冲突时直接报错。 |
| `DOCKER_HUB_VIA_PROXY` | `true` | Docker Hub 默认走容器代理；设为 `false` 才添加直连例外。 |
| `INCLUDE_WSL_IN_DOCKER` | `false` | 将 WSL 中继进程纳入 Docker 规则。 |
| `ALLOW_LAN_ACCESS` | `false` | 开启后绑定 `0.0.0.0`，并要求强密码。 |
| `PROXY_USER` / `PROXY_PASS` | `lan` / 空 | 默认空密码是本机安全模式；LAN 开启时必须配置强密码。 |
| `UNIFY_AI_AND_GLOBAL` | `false` | `true` 时取消独立 AI 分组并将 AI 域名并入全局。 |
| `GLOBAL_ALL` | `false` | `true` 时不添加 `geolocation-!cn` 全局规则。 |
| `RULE_PROVIDERS_META` | 未设置 | 测试或本地校验时可启用 meta rule-provider。 |

## 测试与构建

```bash
node test/test-override.js
node scripts/strip-comments.js
bash scripts/privacy-scan.sh
git diff --check
```

`override.min.js` 必须由 `scripts/strip-comments.js` 生成，不要手工编辑。测试覆盖 v1.5.2 的 AI `url-test`、扩展地区、Provider `_ai` 派生、空密码本机安全模式、LAN 强密码、TUN/strict-route、STUN/TURN/UDP443 与 DNS policy 等行为。

## 仓库结构

```text
override.js                 v1.5.2 主覆写脚本
override.min.js             无注释构建产物
 test/test-override.js      v1.5.2 行为回归测试
scripts/strip-comments.js   无注释构建工具
scripts/privacy-scan.sh     隐私扫描
verify/                     真内核校验样例
archive/                    原始脚本留档
```

## 免责声明

本项目仅供学习、研究与个人使用。使用者应确保自身行为符合所在国家/地区的法律法规；软件按“现状”提供，不构成任何商业服务或技术支持承诺。
