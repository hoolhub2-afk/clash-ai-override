// ============================================================
// FlClash / Clash Verge 覆写脚本 (独立 AI 专属分组 + 客户端安全保存版)
// 修复版: EALC 评审 ART-001 的 ISSUE-01~11 已处置, 回归测试见 test-override.js
// ISSUE-12 (ENABLE_TUN 每次加载覆盖界面 TUN 开关) 为已记录的既定取舍, 未改动
// 发布版: PROXY_PASS 为占位符, 使用前必须改成自己的密码
// ============================================================

function main(config) {
  if (!config || typeof config !== "object") {
    return config;
  }

  var ENABLE_TUN = true;           // 若在客户端界面手动开 TUN，可改 false
  var LOCK_STRICT_ROUTE = false;   // Windows 下保持 false 防切换节点断流; macOS 可改 true 更严谨
  var DOCKER_PORT = 7895;          // Docker 专属代理端口
  var DOCKER_HUB_VIA_PROXY = true; // Docker Hub 拉取开关：true=走容器代理(JP/SG)；
                                   // false=国内直连 docker.io [ISSUE-10] 大陆直连
                                   // registry-1.docker.io 长期不稳定，保持 true 或改配
                                   // Docker daemon 的 registry-mirrors，勿依赖 false 分支

  // [ISSUE-01] 局域网/容器接入凭据：本机免密；局域网设备与容器需凭据。
  // 容器代理地址写法: http://<PROXY_USER>:<PROXY_PASS>@host.docker.internal:7895
  // [发布版] CHANGE_ME 是占位符，粘贴进客户端前务必改成自己的密码。
  var PROXY_USER = "lan";
  var PROXY_PASS = "CHANGE_ME";

  // [核心开关] false = 启用独立的 AI 专属分组 (ChatGPT/Claude/Gemini 走 AI 组，其余走全局代理)
  var UNIFY_AI_AND_GLOBAL = false;

  // --- 策略组名称 --- [ISSUE-11] 已删除未使用的 HARK/MANUAL/IP_CHECK/BEST_GLOBAL 四个常量
  var MAIN_GROUP = "🌐 全局代理";
  var AI_GROUP = "🤖 AI 专属 (美/日/新/韩)";
  var AI_AUTO_GROUP = "🤖 AI 自动 (稳态)";
  var DOCKER_AUTO_GROUP = "🐳 容器自动测速";
  var BEST_AUTO_GROUP = "⚡ 优选自动 (美/日/新/韩)";
  var BEST_FALLBACK_AUTO_GROUP = "⚡ 备用自动 (其他地区)";
  var BEST_FAILOVER_GROUP = "⚡ 全局故障回退";
  var DOCKER_GROUP = "🐳 容器专属 (JP/SG)";

  // --- 测速参数 ---
  var TEST_URL = "http://cp.cloudflare.com/generate_204";
  // [ISSUE-04] AI 组测速改用 ChatGPT 的 Cloudflare trace 探测点：命中风控的出口
  // 返回 403，配合 expected-status=200 会被测速淘汰。
  // [实测 2026-10-25] 经 AI 组访问 trace 返回 200 且 loc 与所选节点地区一致;
  // 同出口访问 api.openai.com 返回 401(到达认证层, 未被风控), 判别语义成立。
  // 若未来 403 语义变化, 最坏退化为普通存活检查, 不影响可用性。
  var AI_TEST_URL = "https://chatgpt.com/cdn-cgi/trace";
  var TEST_INTERVAL = 180;
  var TEST_TOLERANCE = 50;
  var TEST_TIMEOUT = 5000;

  // --- 地区与信息过滤正则 ---
  var REGION_DENY = /(Hong\s*Kong|HongKong|香港|🇭🇰|\bHK\b|\bHKG\b|\bHKT\b|\bHKBN\b|\bPCCW\b|深港|沪港|京港|广港|珠港|Macao|Macau|澳门|🇲🇴|\bMO\b|China|中国|大陆|回国|内地|🇨🇳|\bCN\b|北京|上海|广州|深圳|杭州|东莞|佛山|珠海|厦门|福州|南京|苏州|成都|重庆|武汉|长沙|郑州|西安|天津|青岛|大连|沈阳|哈尔滨|昆明|南宁|海口|三亚|乌鲁木齐|拉萨|银川|兰州|西宁|呼和浩特|太原|石家庄|济南|合肥|南昌|贵阳|长春)/i;
  // [F1 实机] 订阅提示节点有英文形态(Expire Date/Traffic Reset/221.06 GB)，
  // 仅中文关键词会漏进全局组，补英文模式
  var INFO_DENY = /(到期|剩余|流量|官网|套餐|群|重置|网址|故障|维护|expire|traffic|reset|remaining|days?\s*left|\d+(\.\d+)?\s*[tg]b\b|([2-9]|[1-9]\d+)(\.\d+)?\s*[xX倍])/i;
  var PREFERRED_REGION = /(Singapore|新加坡|狮城|🇸🇬|\bSG\b|\bSGP\b|Korea|韩国|首尔|🇰🇷|\bKR\b|\bKOR\b|Seoul|Japan|日本|东京|大阪|京都|名古屋|福冈|札幌|横滨|🇯🇵|\bJP\b|\bJPN\b|Tokyo|Osaka|Kyoto|Nagoya|Fukuoka|Sapporo|Yokohama|United\s*States|美国|洛杉矶|圣何塞|旧金山|西雅图|纽约|达拉斯|硅谷|芝加哥|波特兰|凤凰城|华盛顿|迈阿密|🇺🇸|\bUS\b|\bUSA\b|Los\s*Angeles|San\s*Jose|San\s*Francisco|Seattle|New\s*York|Dallas|Silicon\s*Valley|Chicago|Portland|Phoenix|Washington|Miami)/i;
  var AI_ALLOW = /(United\s*States|美国|🇺🇸|\bUS\b|\bUSA\b|Los\s*Angeles|San\s*Jose|San\s*Francisco|Seattle|New\s*York|Dallas|Silicon\s*Valley|Japan|日本|🇯🇵|\bJP\b|\bJPN\b|Tokyo|Osaka|Singapore|新加坡|狮城|🇸🇬|\bSG\b|Korea|韩国|首尔|🇰🇷|\bKR\b|Seoul)/i;
  var DOCKER_ALLOW = /(Japan|日本|🇯🇵|\bJP\b|\bJPN\b|Tokyo|Osaka|京都|名古屋|东京|大阪|Singapore|新加坡|狮城|🇸🇬|\bSG\b|\bSGP\b)/i;

  // --- 域名与进程列表 ---
  var HARK_DOMAINS = ["hark.com", "sanity.io"];
  var AI_DOMAINS = [
    "claude.ai", "claude.com", "anthropic.com",
    "chatgpt.com", "openai.com", "oaistatic.com", "oaiusercontent.com",
    "gemini.google.com", "generativelanguage.googleapis.com",
    "alkalimakersuite-pa.clients6.google.com",
    "ai.google.dev", "aistudio.google.com",
    "grok.com", "x.ai",
    "manus.im", "manus.ai", "manuscdn.com", "manus.space",
    "muse.ai", "meta.ai",
    "perplexity.ai", "poe.com",
    "copilot.microsoft.com", "mistral.ai",
    // [ISSUE-08] 补齐缺口：GitHub Copilot、NotebookLM、HuggingFace、
    // Perplexity 短链、Character.AI、Sora
    "githubcopilot.com", "notebooklm.google.com", "huggingface.co",
    "pplx.ai", "character.ai", "sora.com"
  ];
  var IP_CHECK_DOMAINS = [
    "ipinfo.io", "ip.sb", "ifconfig.me", "icanhazip.com", "ipapi.co",
    "whoer.net", "browserleaks.com", "ping0.cc",
    "ipleak.net", "dnsleaktest.com", "dnscheck.tools"
  ];
  var CN_DOMAINS = [
    "ipip.net", "baidu.com", "qq.com", "taobao.com", "tmall.com", "alicdn.com",
    "aliyun.com", "aliyuncs.com", "163.com", "126.net", "bilibili.com",
    "hdslb.com", "jd.com", "douyin.com", "weibo.com", "zhihu.com", "deepseek.com"
  ];
  if (!DOCKER_HUB_VIA_PROXY) {
    CN_DOMAINS.push("docker.io", "registry-1.docker.io");
  }

  var CN_PROCESSES = [
    // Windows 进程名
    "WeChat.exe", "Weixin.exe", "WeChatAppEx.exe", "WXWork.exe", "QQ.exe", "TIM.exe",
    "DingTalk.exe", "Feishu.exe", "Lark.exe", "WeMeetApp.exe", "wemeetapp.exe",
    "cloudmusic.exe", "QQMusic.exe", "KuGou.exe", "BaiduNetdisk.exe", "aDrive.exe",
    "Thunder.exe", "DownloadSDKServer.exe", "QQLive.exe", "QQLiveService.exe", "iQIYI.exe", "Youku.exe",
    "AliIM.exe", "AliWorkbench.exe", "WPS.exe", "wps.exe", "SunloginClient.exe", "ToDesk.exe",
    // macOS 进程名(与 .exe 名单一一对应, 覆盖微信小程序/办公/网盘/音乐/远程)
    "WeChat", "WeChatAppEx", "企业微信", "QQ", "DingTalk", "Feishu", "Lark", "TencentMeeting",
    "NeteaseMusic", "QQMusic", "KuGou", "BaiduNetdisk", "aDrive", "Thunder", "ToDesk",
    "wpsoffice", "SunloginClient", "iQIYI", "Youku"
  ];
  // [实测 2026-10-25] Docker Desktop 29.8.2: 镜像拉取由 com.docker.backend(.exe) 发起
  // (Windows 带 .exe, macOS 不带), WSL2 流量经 wslrelay/wslhost 中继;
  // build/dev-envs 进程也会拉基础镜像, 一并覆盖; 两平台名单合并维护
  var DOCKER_PROCESSES = [
    "com.docker.backend.exe", "com.docker.backend", "com.docker.build.exe", "com.docker.dev-envs.exe",
    "vpnkit.exe", "vpnkit-bridge.exe", "com.docker.vpnkit", "wslrelay.exe", "wslhost.exe",
    "dockerd", "containerd", "docker-proxy"
  ];

  // --- 辅助函数 ---
  function byName(a, b) {
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  }
  function suffix(list, target) {
    return list.map(function(d) { return "DOMAIN-SUFFIX," + d + "," + target; });
  }
  function makeUrlTestGroup(name, proxies, extraFields, url, expectedStatus) {
    var group = {
      name: name,
      type: "url-test",
      url: url || TEST_URL,
      interval: TEST_INTERVAL,
      tolerance: TEST_TOLERANCE,
      timeout: TEST_TIMEOUT,
      lazy: true,
      hidden: true,
      "expected-status": expectedStatus || 204
    };
    if (Array.isArray(proxies) && proxies.length > 0) {
      group.proxies = proxies;
    }
    if (extraFields) {
      for (var k in extraFields) {
        if (Object.prototype.hasOwnProperty.call(extraFields, k)) {
          group[k] = extraFields[k];
        }
      }
    }
    return group;
  }

  // 1) 提取并过滤节点
  var sourceProxies = Array.isArray(config.proxies) ? config.proxies : [];
  var providerConfig = (config["proxy-providers"] && typeof config["proxy-providers"] === "object") ? config["proxy-providers"] : {};
  var providerNames = Object.keys(providerConfig).sort();

  var seen = {};
  var unique = sourceProxies.filter(function(proxy) {
    if (!proxy || typeof proxy.name !== "string" || !proxy.name.trim()) return false;
    if (REGION_DENY.test(proxy.name) || INFO_DENY.test(proxy.name)) return false;
    if (seen[proxy.name]) return false;
    seen[proxy.name] = true;
    return true;
  });

  var preferred = unique.filter(function(p) { return PREFERRED_REGION.test(p.name); }).sort(byName);
  var others = unique.filter(function(p) { return !PREFERRED_REGION.test(p.name); }).sort(byName);
  var validProxies = preferred.concat(others);

  if (validProxies.length === 0 && providerNames.length === 0) {
    return config;
  }

  config.proxies = validProxies;
  var allNames = validProxies.map(function(p) { return p.name; });
  var preferredNames = preferred.map(function(p) { return p.name; });
  var nonPreferredNames = others.map(function(p) { return p.name; });

  // [ISSUE-02/05] 池子为空时不再回退到全部节点：避免组名与实际地区不符，
  // 也避免把不合适地区（风控更严）的节点混进 AI 组。空池的组直接不建，
  // 引用处回退到安全目标，见下方策略组构建。
  var aiPool = allNames.filter(function(name) { return AI_ALLOW.test(name); });
  var dockerPool = allNames.filter(function(name) { return DOCKER_ALLOW.test(name); });

  // 2) 基础网络与防断流配置 + 开启局域网访问
  config.ipv6 = false;
  config["allow-lan"] = true;
  config["bind-address"] = "*";
  // [ISSUE-01] 入站鉴权：回环与 Docker 内部网段(172.16/12、Docker Desktop 的
  // 192.168.65/24)免密，其余来源(局域网设备)必须带凭据，不再是无鉴权开放代理。
  config["authentication"] = [PROXY_USER + ":" + PROXY_PASS];
  config["skip-auth-prefixes"] = ["127.0.0.1/32", "::1/128", "172.16.0.0/12", "192.168.65.0/24"];
  config["find-process-mode"] = "strict";
  config["keep-alive-idle"] = 600;
  config["keep-alive-interval"] = 15;
  config["disable-keep-alive"] = false;
  config["tcp-concurrent"] = false;
  config["unified-delay"] = true;
  config.profile = Object.assign({}, config.profile || {}, {
    "store-selected": true,
    "store-fake-ip": true
  });

  // 添加 7895 端口作为 Docker 专属混合监听端口
  var existingListeners = Array.isArray(config.listeners) ? config.listeners.filter(function(l) {
    return l && l.port !== DOCKER_PORT && l.name !== "docker-in";
  }) : [];
  config.listeners = existingListeners.concat([
    {
      name: "docker-in",
      type: "mixed",
      port: DOCKER_PORT,
      listen: "0.0.0.0",
      // [ISSUE-01] 该监听独立于全局 authentication，必须自带凭据；容器侧用
      // http://<PROXY_USER>:<PROXY_PASS>@host.docker.internal:7895。
      // [实机修正] 内核要求 users 为对象数组(username/password)，不接受
      // "user:pass" 字符串(FlClash 实测: users[0] expected a map, got string)。
      users: [{ username: PROXY_USER, password: PROXY_PASS }]
    }
  ]);

  if (ENABLE_TUN) {
    config.tun = Object.assign({}, config.tun || {}, {
      enable: true,
      stack: "mixed",
      "dns-hijack": ["any:53", "tcp://any:53"],
      "auto-route": true,
      "auto-detect-interface": true,
      "strict-route": LOCK_STRICT_ROUTE,
      mtu: 1500,
      "udp-timeout": 300
    });
  }

  // 3) Provider 过滤参数
  var providerDenyFilter = "(?i)(" + REGION_DENY.source + "|" + INFO_DENY.source + ")";
  var globalProviderFields = providerNames.length > 0 ? { use: providerNames, "exclude-filter": providerDenyFilter } : {};
  var preferredProviderFields = providerNames.length > 0 ? { use: providerNames, filter: "(?i)(" + PREFERRED_REGION.source + ")", "exclude-filter": providerDenyFilter } : {};
  var aiProviderFields = providerNames.length > 0 ? { use: providerNames, filter: "(?i)(" + AI_ALLOW.source + ")", "exclude-filter": providerDenyFilter } : {};
  var dockerProviderFields = providerNames.length > 0 ? { use: providerNames, filter: "(?i)(" + DOCKER_ALLOW.source + ")", "exclude-filter": providerDenyFilter } : {};

  // 4) 自动测速组构建
  // [ISSUE-02] 只在静态池非空时创建测速组：url-test 组若只挂 use 而订阅源被
  // 过滤为空，整份配置会被内核拒绝加载。provider 节点仍会出现在有静态成员的
  // 选择组里（MAIN/AI/DOCKER 的 select 组恒有兜底成员，可安全挂 use）。
  var autoGroups = [];
  var bestSelectorName = null;

  if (preferredNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(BEST_AUTO_GROUP, preferredNames, preferredProviderFields));
    bestSelectorName = BEST_AUTO_GROUP;
  }
  if (preferredNames.length > 0 && nonPreferredNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(BEST_FALLBACK_AUTO_GROUP, nonPreferredNames, null));
    autoGroups.push({
      name: BEST_FAILOVER_GROUP,
      type: "fallback",
      proxies: [BEST_AUTO_GROUP, BEST_FALLBACK_AUTO_GROUP],
      url: TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: true,
      hidden: true,
      "expected-status": 204
    });
    bestSelectorName = BEST_FAILOVER_GROUP;
  }
  // [ISSUE-07] UNIFY 开启时不创建 AI 自动组，避免孤儿组空转测速
  // [IP 一致性] AI 自动组用 fallback 而非 url-test：按固定顺序取第一个存活节点，
  // 只有节点失效才切换，出口 IP 不会因延迟波动漂移；健康检查仍用 chatgpt trace。
  if (!UNIFY_AI_AND_GLOBAL && aiPool.length > 0) {
    autoGroups.push(Object.assign({
      name: AI_AUTO_GROUP,
      type: "fallback",
      url: AI_TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: true,
      hidden: true,
      "expected-status": 200
    }, aiProviderFields, { proxies: aiPool }));
  }
  if (dockerPool.length > 0) {
    autoGroups.push(makeUrlTestGroup(DOCKER_AUTO_GROUP, dockerPool, dockerProviderFields));
  }

  // 5) 策略组构建
  // [IP 一致性] 全局代理默认第一成员 = AI 专属：整机出口跟随 AI 组当前选中的
  // 节点，仪表盘/浏览器/检测站看到的出口 IP 与 ChatGPT/Claude/Gemini 完全一致。
  // 需要独立出口(如流媒体美区)时，在全局代理里手动选 ⚡ 全局故障回退 或具体节点。
  // 仅在 AI 池非空时启用，且此时 AI 组成员不含 MAIN，无循环引用。
  var aiPrimary = !UNIFY_AI_AND_GLOBAL && aiPool.length > 0;
  var globalProxies = (aiPrimary ? [AI_GROUP] : (bestSelectorName ? [bestSelectorName] : [])).concat(allNames);
  // [ISSUE-02] MAIN 永远至少有一个成员：provider 过滤后为空时兜底 DIRECT，
  // 保证配置一定可加载（select 组不会自动测速，DIRECT 仅作最后手段）。
  if (globalProxies.length === 0) globalProxies = ["DIRECT"];

  var aiProxies = (!UNIFY_AI_AND_GLOBAL && aiPool.length > 0) ? [AI_AUTO_GROUP].concat(aiPool) : [MAIN_GROUP];
  var dockerProxies = (dockerPool.length > 0) ? [DOCKER_AUTO_GROUP].concat(dockerPool) : ["DIRECT"];

  var visibleGroups = [
    Object.assign({ name: MAIN_GROUP, type: "select", proxies: globalProxies }, globalProviderFields),
    Object.assign({ name: DOCKER_GROUP, type: "select", proxies: dockerProxies }, dockerProviderFields)
  ];

  var EFFECTIVE_AI_TARGET = MAIN_GROUP;
  if (!UNIFY_AI_AND_GLOBAL) {
    // select 组恒含 MAIN 兜底成员，附 provider 过滤不会产生空组
    visibleGroups.splice(1, 0, Object.assign({ name: AI_GROUP, type: "select", proxies: aiProxies }, aiProviderFields));
    EFFECTIVE_AI_TARGET = AI_GROUP;
  }

  config["proxy-groups"] = visibleGroups.concat(autoGroups);

  // 6) 防泄露 DNS 配置
  var CN_DOH = ["https://223.5.5.5/dns-query", "https://1.12.12.12/dns-query"];
  var GLOBAL_DOH = ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query"];

  config.dns = {
    enable: true,
    ipv6: false,
    "prefer-h3": false,
    "use-hosts": true,
    "use-system-hosts": false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": [
      "*.lan", "*.local", "+.home.arpa", "localhost.ptlogin2.qq.com",
      "+.msftconnecttest.com", "+.msftncsi.com", "+.ntp.org", "time.*.com",
      "+.stun.*.*", "*.docker.internal",
      // [跨平台] macOS 系统联网检测与 App Store/iCloud
      "captive.apple.com", "+.apple.com"
    ],
    "respect-rules": true,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "proxy-server-nameserver": ["https://223.5.5.5/dns-query", "https://1.12.12.12/dns-query", "223.5.5.5", "119.29.29.29"],
    "direct-nameserver": CN_DOH,
    "direct-nameserver-follow-policy": false,
    nameserver: GLOBAL_DOH,
    "nameserver-policy": {
      // [ISSUE-06] 内网域名交给系统 DNS（路由器/AD），TUN 劫持 53 后内网解析不再失效
      "geosite:private": ["system"],
      "geosite:cn": CN_DOH,
      "+.lan": ["system"],
      "+.local": ["system"],
      "+.home.arpa": ["system"]
    }
  };

  // 7) 嗅探配置
  config.sniffer = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": false,
    sniff: {
      HTTP: { ports: [80, "8080-8880"], "override-destination": true },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] }
    }
  };

  // 8) 严格优先级路由规则
  config.rules = [].concat(
    [
      // 1. 局域网直连 [ISSUE-09] 提到最前：QUIC/DoT 阻断不再误伤私网，
      //    也不为私网流量触发 GEOIP 的 DNS 解析
      "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
      "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
      "DOMAIN-SUFFIX,local,DIRECT",
      "DOMAIN-SUFFIX,docker.internal,DIRECT",

      // 2. 阻断海外 QUIC 与 DoT
      "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((GEOSITE,cn))),(NOT,((GEOIP,cn)))),REJECT",
      "AND,((NETWORK,TCP),(DST-PORT,853)),REJECT",
      "AND,((NETWORK,UDP),(DST-PORT,853)),REJECT",

      // 3. Docker 流量锁死 JP/SG [ISSUE-03] 提到国内规则之前：容器访问国内
      //    镜像/CN IP 也强制走容器组，兑现“锁死”语义。若希望国内镜像直连提速，
      //    把这两条移回 GEOIP,CN 之后，并同步修改本注释。
      "IN-PORT," + DOCKER_PORT + "," + DOCKER_GROUP
    ],
    DOCKER_PROCESSES.map(function(p) { return "PROCESS-NAME," + p + "," + DOCKER_GROUP; }),
    // 4. 国内进程与国内域名/IP 优先直连
    CN_PROCESSES.map(function(p) { return "PROCESS-NAME," + p + ",DIRECT"; }),
    [
      "GEOSITE,private,DIRECT",
      "GEOSITE,cn,DIRECT",
      "GEOSITE,apple-cn,DIRECT",
      "GEOSITE,microsoft@cn,DIRECT",
      "GEOSITE,steam@cn,DIRECT",
      "GEOSITE,category-games@cn,DIRECT",
      "DOMAIN-SUFFIX,cn,DIRECT"
    ],
    suffix(CN_DOMAINS, "DIRECT"),
    [
      "GEOIP,private,DIRECT,no-resolve",
      "GEOIP,CN,DIRECT,no-resolve",

      // 5. 宿主机海外公共 DNS、Hark、AI、IP 检测站
      "IP-CIDR,1.1.1.1/32," + MAIN_GROUP + ",no-resolve",
      "IP-CIDR,8.8.8.8/32," + MAIN_GROUP + ",no-resolve"
    ],
    suffix(HARK_DOMAINS, EFFECTIVE_AI_TARGET),
    suffix(AI_DOMAINS, EFFECTIVE_AI_TARGET),
    suffix(IP_CHECK_DOMAINS, MAIN_GROUP),
    [
      // 6. 宿主机其余海外流量兜底
      "GEOSITE,geolocation-!cn," + MAIN_GROUP,
      "MATCH," + MAIN_GROUP
    ]
  );

  return config;
}
