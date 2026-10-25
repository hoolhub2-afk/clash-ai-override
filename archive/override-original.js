// ============================================================
// FlClash / Clash Verge 覆写脚本 (独立 AI 专属分组 + 客户端安全保存版)
// [留档] EALC 评审(ART-001)前的原始版本, 仅作对照, 勿直接使用。
// 评审发现的 12 条问题及处置见 README 与 test-override.js。
// ============================================================

function main(config) {
  if (!config || typeof config !== "object") {
    return config;
  }

  var ENABLE_TUN = true;           // 若在客户端界面手动开 TUN，可改 false
  var LOCK_STRICT_ROUTE = false;   // Windows 下保持 false 防切换节点断流
  var DOCKER_PORT = 7895;          // Docker 专属代理端口（确保 100% 命中 JP/SG）
  var DOCKER_HUB_VIA_PROXY = true; // Docker Hub 拉取开关：true=走容器代理(JP/SG)；false=走国内直连

  // [核心开关] false = 启用独立的 AI 专属分组 (ChatGPT/Claude/Gemini 走 AI 组，其余走全局代理)
  var UNIFY_AI_AND_GLOBAL = false;

  // --- 策略组名称 ---
  var MAIN_GROUP = "🌐 全局代理";
  var AI_GROUP = "🤖 AI 专属 (美/日/新/韩)";
  var AI_AUTO_GROUP = "🤖 AI 自动测速";
  var DOCKER_AUTO_GROUP = "🐳 容器自动测速";
  var BEST_AUTO_GROUP = "⚡ 优选自动 (美/日/新/韩)";
  var BEST_FALLBACK_AUTO_GROUP = "⚡ 备用自动 (其他地区)";
  var BEST_FAILOVER_GROUP = "⚡ 全局故障回退";
  var IP_CHECK_GROUP = "🔍 出口检测";
  var DOCKER_GROUP = "🐳 容器专属 (JP/SG)";
  var BEST_GLOBAL_GROUP = "⚡ 全局优选 (非港/非陆)";
  var MANUAL_GROUP = "🎯 手动切换";
  var HARK_GROUP = "🧭 Hark 专属";

  // --- 测速参数 ---
  var TEST_URL = "http://cp.cloudflare.com/generate_204";
  var TEST_INTERVAL = 180;
  var TEST_TOLERANCE = 50;
  var TEST_TIMEOUT = 5000;

  // --- 地区与信息过滤正则 ---
  var REGION_DENY = /(Hong\s*Kong|HongKong|香港|🇭🇰|\bHK\b|\bHKG\b|\bHKT\b|\bHKBN\b|\bPCCW\b|深港|沪港|京港|广港|珠港|Macao|Macau|澳门|🇲🇴|\bMO\b|China|中国|大陆|回国|内地|🇨🇳|\bCN\b|北京|上海|广州|深圳|杭州|东莞|佛山|珠海|厦门|福州|南京|苏州|成都|重庆|武汉|长沙|郑州|西安|天津|青岛|大连|沈阳|哈尔滨|昆明|南宁|海口|三亚|乌鲁木齐|拉萨|银川|兰州|西宁|呼和浩特|太原|石家庄|济南|合肥|南昌|贵阳|长春)/i;
  var INFO_DENY = /(到期|剩余|流量|官网|套餐|群|重置|网址|故障|维护|([2-9]|[1-9]\d+)(\.\d+)?\s*[xX倍])/i;
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
    "copilot.microsoft.com", "mistral.ai"
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
    "WeChat.exe", "Weixin.exe", "WeChatAppEx.exe", "WXWork.exe", "QQ.exe", "TIM.exe",
    "DingTalk.exe", "Feishu.exe", "Lark.exe", "WeMeetApp.exe", "wemeetapp.exe",
    "cloudmusic.exe", "QQMusic.exe", "KuGou.exe", "BaiduNetdisk.exe", "aDrive.exe",
    "Thunder.exe", "DownloadSDKServer.exe", "QQLive.exe", "QQLiveService.exe", "iQIYI.exe", "Youku.exe",
    "AliIM.exe", "AliWorkbench.exe", "WPS.exe", "wps.exe", "SunloginClient.exe", "ToDesk.exe",
    "WeChat", "企业微信", "QQ", "DingTalk", "Feishu", "Lark", "TencentMeeting",
    "NeteaseMusic", "QQMusic", "BaiduNetdisk_mac", "aDrive", "Thunder", "ToDesk"
  ];
  var DOCKER_PROCESSES = [
    "com.docker.backend.exe", "com.docker.backend", "vpnkit.exe", "vpnkit-bridge.exe",
    "com.docker.vpnkit", "wslrelay.exe", "wslhost.exe", "dockerd", "containerd", "docker-proxy"
  ];

  // --- 辅助函数 ---
  function byName(a, b) {
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  }
  function suffix(list, target) {
    return list.map(function(d) { return "DOMAIN-SUFFIX," + d + "," + target; });
  }
  function makeUrlTestGroup(name, proxies, extraFields) {
    var group = {
      name: name,
      type: "url-test",
      url: TEST_URL,
      interval: TEST_INTERVAL,
      tolerance: TEST_TOLERANCE,
      timeout: TEST_TIMEOUT,
      lazy: true,
      hidden: true,
      "expected-status": 204
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

  var aiPool = allNames.filter(function(name) { return AI_ALLOW.test(name); });
  var dockerPool = allNames.filter(function(name) { return DOCKER_ALLOW.test(name); });

  if (aiPool.length === 0) aiPool = allNames;
  if (dockerPool.length === 0) dockerPool = allNames;

  // 2) 基础网络与防断流配置 + 开启局域网访问
  config.ipv6 = false;
  config["allow-lan"] = true;
  config["bind-address"] = "*";
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
      listen: "0.0.0.0"
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
  var autoGroups = [];
  var bestSelectorName = null;

  var bestPool = preferredNames.length > 0 ? preferredNames : allNames;
  if (bestPool.length > 0 || providerNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(BEST_AUTO_GROUP, bestPool, preferredProviderFields));
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
  if (aiPool.length > 0 || providerNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(AI_AUTO_GROUP, aiPool, aiProviderFields));
  }
  if (dockerPool.length > 0 || providerNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(DOCKER_AUTO_GROUP, dockerPool, dockerProviderFields));
  }

  // 5) 策略组构建
  var globalProxies = (bestSelectorName ? [bestSelectorName] : []).concat(allNames);
  if (globalProxies.length === 0 && providerNames.length === 0) globalProxies = ["DIRECT"];

  var aiProxies = (aiPool.length > 0 || providerNames.length > 0) ? [AI_AUTO_GROUP].concat(aiPool) : [MAIN_GROUP];
  var dockerProxies = (dockerPool.length > 0 || providerNames.length > 0) ? [DOCKER_AUTO_GROUP].concat(dockerPool) : ["DIRECT"];

  var visibleGroups = [
    Object.assign({ name: MAIN_GROUP, type: "select", proxies: globalProxies }, globalProviderFields),
    Object.assign({ name: DOCKER_GROUP, type: "select", proxies: dockerProxies }, dockerProviderFields)
  ];

  var EFFECTIVE_AI_TARGET = MAIN_GROUP;
  if (!UNIFY_AI_AND_GLOBAL) {
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
      "+.stun.*.*", "*.docker.internal"
    ],
    "respect-rules": true,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "proxy-server-nameserver": ["https://223.5.5.5/dns-query", "https://1.12.12.12/dns-query", "223.5.5.5", "119.29.29.29"],
    "direct-nameserver": CN_DOH,
    "direct-nameserver-follow-policy": false,
    nameserver: GLOBAL_DOH,
    "nameserver-policy": {
      "geosite:cn,private": CN_DOH
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
      // 1. 阻断海外 QUIC 与 DoT
      "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((GEOSITE,cn))),(NOT,((GEOIP,cn)))),REJECT",
      "AND,((NETWORK,TCP),(DST-PORT,853)),REJECT",
      "AND,((NETWORK,UDP),(DST-PORT,853)),REJECT",

      // 2. 局域网直连
      "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
      "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
      "DOMAIN-SUFFIX,local,DIRECT",
      "DOMAIN-SUFFIX,docker.internal,DIRECT"
    ],
    // 3. 国内进程与国内域名/IP 优先直连
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

      // 4. Docker 流量锁死 JP/SG
      "IN-PORT," + DOCKER_PORT + "," + DOCKER_GROUP
    ],
    DOCKER_PROCESSES.map(function(p) { return "PROCESS-NAME," + p + "," + DOCKER_GROUP; }),
    [
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
