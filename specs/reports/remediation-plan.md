# Remediation Plan

- **Scope**: `eng-review-fix` review of the current uncommitted override/configuration changes
- **Target**: `override.js`, test/build/verification/privacy scripts, generated configs, README
- **Review limitation**: one independent correctness reviewer failed because the agent service was overloaded. Security and tooling reviewers returned findings; all final findings below are grounded in local source inspection, adversarial boundary probes, reviewer reports, and validation commands.
- **Plan status**: all actionable items resolved; see `validation-report.md` for evidence and the mihomo runtime hand-off.

## Risk-ranked findings

### R1 — Critical / Security + configuration correctness: invalid `config`/`options` types are accepted as empty
- **File**: `override.js:9-15,41-49`
- **Observed**: `config` is accepted when it is any object, while `config.proxies` and `config["proxy-providers"]` are silently treated as empty when they have the wrong type. A malformed object such as `{ proxies: "not-an-array" }` can reach the empty-template return path and is returned unchanged. `options` is also accepted as any object, including objects with inherited control properties.
- **Root cause**: configuration boundary validates presence but not shape, then uses permissive fallback defaults.
- **Minimal fix**: add own-property option reads and validate present `proxies`, `proxy-providers`, and `listeners` types before the empty-template return. Throw a clear configuration error on malformed types.
- **Regression test**: malformed `proxies`, `proxy-providers`, `listeners`, and inherited `PROXY_PASS`/`DOCKER_PORT` options.
- **Change risk**: low; rejects malformed inputs that cannot be safely interpreted.

### R2 — Critical / Security + correctness: provider-only fallback can silently become DIRECT when empty
- **File**: `override.js:353-362`
- **Observed**: mihomo's empty-group compatibility path falls back to DIRECT. A provider-only group that filters every provider node therefore becomes a direct-egress route, despite MAIN not listing `DIRECT`.
- **Root cause**: provider-only fallback had no explicit empty fallback and an earlier attempted fix removed the deny filter, which would have reintroduced banned regions and metadata nodes.
- **Minimal fix**: retain `exclude-filter: providerDenyFilter` and set `empty-fallback: REJECT`.
- **Regression test**: provider-only output must contain both the deny filter and `empty-fallback: REJECT`.
- **Change risk**: low; empty provider pools now fail closed instead of leaking direct traffic.

### R3 — High / Reliability: generated temporary files leak on failure
- **Files**: `scripts/strip-comments.js:99-120`, `scripts/gen-verify-config.js:20-55`
- **Observed**: `strip-comments.js` writes two temp modules and removes them only after all requires, fixture comparisons, idempotency, and output write succeed. `gen-verify-config.js` removes its temp module only after both JSON writes succeed. A syntax error, failed fixture, permission error, or disk-full event leaves executable temporary source files behind.
- **Root cause**: cleanup is linear rather than `try/finally` guarded.
- **Minimal fix**: wrap build/verification work in `try/finally`; remove only fixed, allowlisted temp paths in the finally block. Do not claim output success after a failed write.
- **Regression test**: add a small cleanup helper test or invoke scripts with a forced validation failure and assert temp files are absent.
- **Change risk**: low; cleanup is additive.

### R4 — Medium / Reliability: test runner leaves its temp module on setup/require failure
- **File**: `test/test-override.js:23-26,~300`
- **Observed**: the temp module is deleted only at the end. If `require` fails or a top-level test setup throws before the final cleanup, `.tmp-variant-main.js` remains in `test/`.
- **Root cause**: cleanup is not registered before loading the temporary module.
- **Minimal fix**: register `process.on("exit", cleanup)` immediately after the fixed path is declared, or use a `try/finally` around setup and execution.
- **Regression test**: simulate a setup failure and assert the temp file is removed on process exit.
- **Change risk**: low.

### R5 — Medium / Security boundary: options are a test-only injection path but inherited properties are honored
- **File**: `override.js:21-39`
- **Observed**: `options.PROXY_PASS`, `options.DOCKER_PORT`, and other controls use `!== undefined`, so inherited properties from an object prototype are accepted. The local adversarial probe demonstrated an inherited `PROXY_PASS` is used.
- **Root cause**: options are treated as a plain map without own-property checks.
- **Minimal fix**: use a helper based on `Object.prototype.hasOwnProperty.call(options, key)` for every option read.
- **Regression test**: `Object.create({ PROXY_PASS: "inherited" })` must not override the default placeholder and must fail closed.
- **Change risk**: low; makes the documented injection surface explicit.

## Additional security controls applied during remediation

- Reject proxy names over 1024 characters, generated-group name collisions, and built-in direct/reject/dns/compatible proxy types before regex filtering.
- Detect top-level port collisions as well as listener collisions before mutating the caller config.
- Preserve provider deny filtering and force `empty-fallback: REJECT` for provider-only routing.
- Treat inherited `options` properties as absent; only own properties can override test controls.
- Preserve global auth for retained listeners by removing explicit empty `users: []` arrays.

## Clean / no-finding areas

- Proxy names are deduplicated with `Object.create(null)` and are not used as executable code.
- Port conflict detection handles numeric strings, top-level ports, and preserves non-conflicting listeners.
- Password placeholder, whitespace-padded placeholder, and inherited-option behavior are covered by tests.
- `override.min.js` is generated and parity-checked across six representative cases, not hand-edited.
- Privacy scan passes after excluding the local `.mimosa/` report directory and adding the reserved network ranges used by the rules.

## Out of scope / hand-off

- A real `mihomo -t` validation remains environment-dependent because `mihomo` is not installed on this host. The generated configs were inspected structurally but not accepted as kernel validation.
- Runtime behavior of provider health checks and actual process-name matching requires a live FlClash/mihomo environment.
