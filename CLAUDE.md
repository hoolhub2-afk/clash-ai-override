# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Run regression tests**: `node test/test-override.js`
  - Runs all 44 structural and behavioral assertions (fail-closed auth, port collisions, regex filters, empty-fallback coverage, Canada AI pool, Docker Hub rule precedence, provider path derivation, group construction, rule precedence, provider fallback).
  - Uses only Node.js built-ins (`fs`, `path`); no `npm install` or external dependencies required.
- **Build comment-free bundle**: `node scripts/strip-comments.js`
  - Generates `override.min.js` from `override.js`.
  - Performs two automated self-checks before disk write: behavioral equivalence against test fixtures and zero-comment idempotence.
- **Generate mihomo verification configs**: `node scripts/gen-verify-config.js`
  - Generates `verify/config.json` (Scenario A: static nodes) and `verify/config-b.json` (Scenario B: pure HK + provider).
- **Mihomo kernel syntax & structure verification** (requires `mihomo` installed and geo databases in `verify/`):
  - `mihomo -t -d verify -f verify/config.json`
  - `mihomo -t -d verify -f verify/config-b.json`
- **Pre-push privacy audit**: `bash scripts/privacy-scan.sh`
  - Checks git metadata, email domains (only `*users.noreply.github.com` allowed), IPv4 addresses (only documentation/private/DNS whitelisted IPs allowed), and local blacklists from `.privacy-local.txt`.

## Code Architecture & Workflow

### Single Source of Truth
- `override.js` is the **only** file intended for manual modification.
- `override.min.js` and `verify/*.json` are generated build artifacts; never edit them directly. Always run `node scripts/strip-comments.js` and `node scripts/gen-verify-config.js` after modifying `override.js`.

### Entry Point & Options Interface
- Exported entry function: `main(config, options)` in `override.js`.
- Clash / FlClash clients pass only `config`. Default configuration values in `override.js` represent client defaults.
- The second parameter `options` is strictly for tests and local verification scripts.
- `options` properties are read strictly via `Object.prototype.hasOwnProperty.call(options, key)` to ignore inherited prototype properties.
- **Fail-closed credentials**: `PROXY_PASS` defaults to `"CHANGE_ME"`. The script throws an error and halts execution if `PROXY_PASS` is unchanged, empty, or whitespace.

### Pipeline Stages in `override.js`
1. **Validation & Conflict Checks**:
   - Validates shapes of `config`, `proxies`, `proxy-providers`, and `listeners`.
   - Rejects proxy names over 1024 characters, reserved system names, and built-in non-proxy types (`direct`, `reject`, `dns`, `compatible`).
   - Atomically checks port collisions (top-level port keys and existing listeners) against `DOCKER_PORT` (default 7895) before modifying any fields.
2. **Filtering & Node Pool Construction**:
   - `REGION_DENY`: Filters HK, MO, and mainland China regions from foreign proxy pools.
   - `INFO_DENY`: Filters both Chinese and English subscription notice/metadata nodes (e.g. traffic remaining, expiration dates).
   - Pools: `PREFERRED_REGION` (US, JP, SG, KR), `AI_ALLOW` (US, JP, SG, KR), `DOCKER_ALLOW` (JP, SG).
3. **Proxy Groups Creation**:
   - `🌐 全局代理` (MAIN): Defaults to following the AI dedicated group for IP consistency.
   - `🤖 AI 专属 (美/日/新/韩/加)` & `🤖 AI 自动 (稳态)`: Fallback strategy group using `https://chatgpt.com/cdn-cgi/trace` (`expected-status: 200`) for risk-control survival checks.
   - `🐳 容器专属 (JP/SG)` & `🐳 容器自动测速`: Dedicated egress for Docker containers.
   - `⚡ 优选自动`, `⚡ 备用自动`, `⚡ 全局故障回退`, `⚡ 订阅源自动 (全部)`: Provider and failover groups. Empty provider groups must include `empty-fallback: REJECT` to prevent silent fallback to DIRECT.
4. **DNS & Sniffer Configuration**:
   - `sniffer`: Enabled for HTTP, TLS, QUIC.
   - `dns`: Fake-IP mode with Apple domains whitelisted (`captive.apple.com`, `+.apple.com`). Split DNS with Chinese DoH for domestic domains and foreign DoH via proxy for foreign domains. Intranet domains mapped to `system`.
5. **Strict Routing Rule Hierarchy**:
   - Order: Local/Private IPs (no-resolve) -> Block foreign QUIC (UDP 443) & DoT (TCP/UDP 853) -> Docker port (`7895`) & container processes -> Domestic processes & Chinese domains/IPs -> Cloudflare dashboards & direct overseas endpoints -> AI domains -> Foreign fallback -> `MATCH, 🌐 全局代理`.

### Constraints & Security Guidelines
- **Zero External Dependencies**: Pure vanilla Node.js (ES5-compatible syntax inside `override.js`). Do not add external npm packages.
- **Resource Cleanup**: Scripts creating temporary files must use `try/finally` blocks and `process.on("exit")` handlers to prevent leaking executable temp files on unexpected failure.
- **Privacy & Secret Hygiene**: Never commit real IPs, credentials, or subscription URLs. Use RFC 5737 documentation IPs (`203.0.113.1`) and fixture strings. Always run `bash scripts/privacy-scan.sh` before finishing changes.
