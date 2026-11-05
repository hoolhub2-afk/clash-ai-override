// ============================================================
// FlClash / Clash Verge 覆写脚本 v1.5.2（2026-11-05）
// 以 v1.4 融合版为基础，融合 complete 线已定版修复：
// [MERGE-1] (FIX-3) INFO_DENY 删除倍率拦截，2x/10x 正规节点不再误杀
// [SEC-06] STUN 域名/正则 + TCP/UDP 3478/5349 + UDP 19302-19309 前置走代理；UDP/443 改为代理
// [MERGE-3] (FIX-6/VULN-01) 保留名补齐内置策略名 DIRECT/REJECT/REJECT-DROP/PASS/GLOBAL/COMPATIBLE
// [MERGE-4] (SEC-02 修正) 占位符守卫改为前缀识别；口令默认留空外置：未配置=本机安全模式
//（不下发 authentication、Docker 监听仅回环且无 users），开 LAN 时未配置/弱口令仍 Fail-Closed 抛错
// ---- 继承 v1.4 生产加固能力；v1.5 强化 DNS/WebRTC 防泄漏 ----
// 融合创新特性与安全防御基线：
// [FEAT-01] 纯 proxy-providers 自动注入 health-check 并派生 <name>_ai 独立探测实例
// [FEAT-02] 统一四大优选地区原子词库（SG / JP / KR / US）消除名单分歧
// [FEAT-03] Go RE2 兼容过滤正则（放行中国台湾，精准拦截纯大陆与中转节点）
// [FEAT-04] WSL 进程按需纳入 Docker 组（INCLUDE_WSL_IN_DOCKER 可选开关）
// [FEAT-05] listeners 与端口 Number 归一化，Docker mixed listener 开启 udp: true
// [SEC-01]  完整支持 main(config, options) 与 hasOwnProperty 原型隔离，完全兼容测试工具链
// [SEC-02]  强密码与占位符 Fail-Closed 双重防御，严防弱密码与未替换占位符部署
// [SEC-03]  端口冲突原子检测（顶层端口与既有 listeners 冲突时显式抛错，绝不静默抹除）
// [SEC-04]  Provider 策略组保留 empty-fallback: REJECT，严防空池静默回退至 DIRECT 直连
// [SEC-05]  完备输入类型防御（R1 规范）与超长/保留关键字前置校验
// [SEC-08] DNS 国内/国际 DoH 隔离，无 fallback；国际 DNS 经代理，节点解析使用独立国内 DoH，bootstrap 使用 DoT。
// [SEC-07] TUN 必须启用且 strict-route=true；关闭 TUN 时 Fail-Closed。
// ============================================================

function main(config, options) {
  if (config === null || config === undefined) return config;
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error("配置必须是对象。");
  }

  // 第二参数只服务于单元测试与本地校验; FlClash / Clash Verge 客户端只传 config。
  options = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  var hasOwn = Object.prototype.hasOwnProperty;
  function optionValue(name, fallback) {
    return hasOwn.call(options, name) ? options[name] : fallback;
  }
  function normalizedPortForValidation(value) {
    if (value === null || value === undefined || value === "") return null;
    var n = Number(value);
    return Number.isInteger(n) ? n : null;
  }

  if (hasOwn.call(config, "proxies") && config.proxies !== undefined && !Array.isArray(config.proxies)) {
    throw new Error("proxies 必须是数组。");
  }
  if (hasOwn.call(config, "proxy-providers") && config["proxy-providers"] !== undefined
    && (!config["proxy-providers"] || typeof config["proxy-providers"] !== "object" || Array.isArray(config["proxy-providers"])) ) {
    throw new Error("proxy-providers 必须是对象。");
  }

  // ==================== 1. 核心策略开关 ====================
  var ENABLE_TUN = optionValue("ENABLE_TUN", true);
  // WebRTC/UDP 防泄漏依赖 TUN 接管；关闭 TUN 时无法保证流量不绕行，故 Fail-Closed。
  if (ENABLE_TUN !== true) {
    throw new Error("安全停止: v1.5 防泄漏模式要求 ENABLE_TUN=true；关闭 TUN 无法保证 WebRTC/UDP 与 DNS 不绕过代理。");
  }
  var DOCKER_PORT = optionValue("DOCKER_PORT", 7895);
  var DOCKER_HUB_VIA_PROXY = optionValue("DOCKER_HUB_VIA_PROXY", true);
  var INCLUDE_WSL_IN_DOCKER = optionValue("INCLUDE_WSL_IN_DOCKER", false);
  var GLOBAL_ALL = optionValue("GLOBAL_ALL", false);
  var UNIFY_AI_AND_GLOBAL = optionValue("UNIFY_AI_AND_GLOBAL", false);

  var ALLOW_LAN_ACCESS = optionValue("ALLOW_LAN_ACCESS", false);
  var PROXY_USER = optionValue("PROXY_USER", "lan");
  var PROXY_PASS = optionValue("PROXY_PASS", ""); // [MERGE-4] 发布版不内嵌口令；本机经 options 或改此默认值填入强口令

  var MAIN_GROUP = "🌐 全局代理";
  var AI_GROUP = "🤖 AI 专属 (低延迟候选)";
  var AI_AUTO_GROUP = "🤖 AI 自动 (稳态)";
  var DOCKER_AUTO_GROUP = "🐳 容器自动测速";
  var BEST_AUTO_GROUP = "⚡ 优选自动 (美/日/新/韩/加)";
  var BEST_FALLBACK_AUTO_GROUP = "⚡ 备用自动 (其他地区)";
  var BEST_FAILOVER_GROUP = "⚡ 全局故障回退";
  var PROVIDER_AUTO_GROUP = "⚡ 订阅源自动 (全部)";
  var DOCKER_GROUP = "🐳 容器专属 (JP/SG)";

  var RESERVED_PROXY_NAMES = Object.create(null);
  [MAIN_GROUP, AI_GROUP, AI_AUTO_GROUP, DOCKER_AUTO_GROUP, BEST_AUTO_GROUP,
    BEST_FALLBACK_AUTO_GROUP, BEST_FAILOVER_GROUP, PROVIDER_AUTO_GROUP, DOCKER_GROUP,
    "DIRECT", "REJECT", "REJECT-DROP", "PASS", "GLOBAL", "COMPATIBLE"] // [MERGE-3] 内置策略名一并保留
    .forEach(function(name) { RESERVED_PROXY_NAMES[name] = true; });
  var MAX_PROXY_NAME_LENGTH = 1024;

  var TEST_URL = "https://cp.cloudflare.com/generate_204";
  var AI_TEST_URL = "https://chatgpt.com/cdn-cgi/trace";
  var TEST_INTERVAL = 180;
  var AI_TEST_INTERVAL = 120;
  var TEST_TOLERANCE = 30;
  var TEST_TIMEOUT = 5000;

  var sourceProxies = Array.isArray(config.proxies) ? config.proxies : [];
  var rawProviders = (config["proxy-providers"] && typeof config["proxy-providers"] === "object")
    ? config["proxy-providers"]
    : {};
  var baseProviderNames = Object.keys(rawProviders).filter(function(k) {
    return !/_ai$/.test(k);
  }).sort();
  var hasProviders = baseProviderNames.length > 0;

  // 真正的空模板没有任何节点与 provider 时原样返回
  if (sourceProxies.length === 0 && !hasProviders) {
    return config;
  }

  // ==================== 2. 安全凭据 Fail-Closed 校验 ====================
  if (typeof PROXY_PASS !== "string") {
    throw new Error("安全停止: PROXY_PASS 必须是字符串。");
  }
  PROXY_PASS = PROXY_PASS.trim();
  // [MERGE-4] 未配置 = 空或 CHANGE_ME 前缀占位符（原 v1.3.2 用全等判断，与自带默认值永不相等，守卫失效）
  var PASS_UNSET = (PROXY_PASS === "" || /^CHANGE_ME/i.test(PROXY_PASS));
  if (ALLOW_LAN_ACCESS && PASS_UNSET) {
    throw new Error("安全停止: 已开启局域网访问, 但 PROXY_PASS 未配置或仍为占位符; 请先设置随机强密码。");
  }
  if (ALLOW_LAN_ACCESS && !isStrongPassword(PROXY_PASS)) {
    throw new Error("安全停止: 开启局域网访问时, PROXY_PASS 必须是至少 8 位且非通用弱密码。");
  }
  if (typeof PROXY_USER !== "string" || !PROXY_USER.trim()) {
    throw new Error("安全停止: PROXY_USER 必须是非空字符串。");
  }
  if (!Number.isInteger(Number(DOCKER_PORT)) || Number(DOCKER_PORT) < 1 || Number(DOCKER_PORT) > 65535) {
    throw new Error("DOCKER_PORT 必须是 1–65535 的有效端口。");
  }
  DOCKER_PORT = Number(DOCKER_PORT);

  // 端口冲突原子检测（在原地修改前检查，确保失败时不破坏输入对象）
  var topLevelPortKeys = ["port", "socks-port", "redir-port", "tproxy-port", "mixed-port"];
  topLevelPortKeys.forEach(function(key) {
    if (normalizedPortForValidation(config[key]) === DOCKER_PORT) {
      throw new Error("端口 " + DOCKER_PORT + " 已被顶层 " + key + " 占用; 请先调整 DOCKER_PORT 或清理冲突配置。");
    }
  });

  var oldListeners = Array.isArray(config.listeners) ? config.listeners : [];
  var portConflict = oldListeners.some(function(l) {
    return l && typeof l === "object" && l.name !== "docker-in" && normalizedPortForValidation(l.port) === DOCKER_PORT;
  });
  if (portConflict) {
    throw new Error("端口 " + DOCKER_PORT + " 已被其他 listener 占用; 请先调整 DOCKER_PORT 或清理冲突配置。");
  }

  // ==================== 3. 统一地区与过滤正则词库 ====================
  var REGION_DENY = /(Hong\s*Kong|HongKong|香港|🇭🇰|(?:^|[^a-zA-Z])(HK|HKG|HKT|HKBN|PCCW)(?:$|[^a-zA-Z])|(?:^|[^a-zA-Z0-9])CN(?:$|[^a-zA-Z0-9])|深港|沪港|京港|广港|珠港|港台|深台|沪台|京台|广台|Macao|Macau|澳门|🇲🇴|China|中国|大陆|回国|内地|🇨🇳|北京|上海|广州|深圳|杭州|东莞|佛山|珠海|厦门|福州|南京|苏州|成都|重庆|武汉|长沙|郑州|西安|天津|青岛|大连|沈阳|哈尔滨|昆明|南宁|海口|三亚|乌鲁木齐|拉萨|银川|兰州|西宁|呼和浩特|太原|石家庄|济南|合肥|南昌|贵阳|长春)/i;

  // Go RE2 兼容黑名单：拦截纯大陆节点并放行中国台湾
  var PROVIDER_REGION_DENY = /(Hong\s*Kong|HongKong|香港|🇭🇰|(?:^|[^a-zA-Z])(HK|HKG|HKT|HKBN|PCCW)(?:$|[^a-zA-Z])|(?:^|[^a-zA-Z0-9])CN(?:$|[^a-zA-Z0-9])|深港|沪港|京港|广港|珠港|港台|深台|沪台|京台|广台|Macao|Macau|澳门|🇲🇴|大陆|回国|内地|(?:中国|China)(?:$|[\s\-_\/|]*(?:大陆|内地|移动|联通|电信|BGP|专线|直连|节点|\d+))|北京|上海|广州|深圳|杭州|东莞|佛山|珠海|厦门|福州|南京|苏州|成都|重庆|武汉|长沙|郑州|西安|天津|青岛|大连|沈阳|哈尔滨|昆明|南宁|海口|三亚|乌鲁木齐|拉萨|银川|兰州|西宁|呼和浩特|太原|石家庄|济南|合肥|南昌|贵阳|长春)/i;

  var INFO_DENY = /(到期|剩余|流量|官网|套餐|群|重置|网址|故障|维护|expire|traffic|reset|remaining|days?\s*left|\d+(\.\d+)?\s*[tg]b\b)/i; // [MERGE-1] 已删除倍率拦截段（2x/10x 为正规计费节点）
  var TAIWAN_MARK = /(Taiwan|Taipei|Taichung|Kaohsiung|台湾|台灣|台北|台中|高雄|新北|桃园|台南|新竹|🇹🇼|(?:^|[^a-zA-Z])(TW|TWN|TPE)(?:$|[^a-zA-Z]))/i;

  // 五大优选地区原子正则
  var SG_MATCH = /(Singapore|新加坡|狮城|🇸🇬|(?:^|[^a-zA-Z])(SG|SGP)(?:$|[^a-zA-Z]))/i;
  var JP_MATCH = /(Japan|日本|东京|大阪|京都|名古屋|福冈|札幌|横滨|🇯🇵|(?:^|[^a-zA-Z])(JP|JPN)(?:$|[^a-zA-Z])|Tokyo|Osaka|Kyoto|Nagoya|Fukuoka|Sapporo|Yokohama)/i;
  var KR_MATCH = /(Korea|韩国|首尔|釜山|仁川|🇰🇷|(?:^|[^a-zA-Z])(KR|KOR|ICN)(?:$|[^a-zA-Z])|Seoul|Busan|Incheon)/i;
  var US_MATCH = /(United\s*States|美国|洛杉矶|圣何塞|旧金山|西雅图|纽约|达拉斯|硅谷|芝加哥|波特兰|凤凰城|华盛顿|迈阿密|亚特兰大|丹佛|🇺🇸|(?:^|[^a-zA-Z])(US|USA|LAX|SJC|SFO|SEA|JFK|EWR|DFW|ORD|PDX|PHX|IAD|MIA)(?:$|[^a-zA-Z])|Los\s*Angeles|San\s*Jose|San\s*Francisco|Seattle|New\s*York|Dallas|Silicon\s*Valley|Chicago|Portland|Phoenix|Washington|Miami|Atlanta|Denver)/i;
  var CA_MATCH = /(Canada|Canadian|加拿大|🇨🇦|(?:^|[^a-zA-Z])(CA|CAN)(?:$|[^a-zA-Z])|Toronto|多伦多|Vancouver|温哥华|Montreal|蒙特利尔|Ottawa|渥太华|Calgary|卡尔加里)/i;

  var PREFERRED_REGION = new RegExp("(" + SG_MATCH.source + "|" + JP_MATCH.source + "|" + KR_MATCH.source + "|" + US_MATCH.source + "|" + CA_MATCH.source + ")", "i");
  var AI_REGION = new RegExp("(" + PREFERRED_REGION.source + "|" + TAIWAN_MARK.source + "|Great\\s*Britain|United\\s*Kingdom|英国|" +
    "France|法国|" +
    "Germany|德国|" +
    "Philippines|菲律宾|" +
    "Netherlands|荷兰|" +
    "Turkey|土耳其|" +
    "Vietnam|越南|" +
    "Malaysia|马来西亚|" +
    "Thailand|泰国)", "i");
  var AI_ALLOW = AI_REGION;
  var DOCKER_ALLOW = new RegExp("(" + JP_MATCH.source + "|" + SG_MATCH.source + ")", "i");

  // ==================== 4. 域名与进程清单 ====================
  var HARK_DOMAINS = ["hark.com"];
  var CLOUDFLARE_DIRECT_DOMAINS = ["dash.cloudflare.com", "api.cloudflare.com"];
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

  // [MERGE-2] 已知公共 STUN 服务器域名（WebRTC 泄露防护，走全局代理不拦截）
  var STUN_DOMAINS = [
    "stun.l.google.com", "stun1.l.google.com", "stun2.l.google.com", "stun3.l.google.com", "stun4.l.google.com",
    "stun.cloudflare.com", "stun.nextcloud.com", "global.stun.twilio.com", "stun.twilio.com",
    "stun.sipgate.net", "stun.ekiga.net", "stun.ideasip.com", "stun.schlund.de", "stun.stunprotocol.org",
    "stun.voiparound.com", "stun.voipbuster.com", "stun.voipstunt.com", "stun.counterpath.com", "stun.counterpath.net",
    "stun.rixtelecom.se", "stun.playstation.net", "stun.qq.com", "stun.miwifi.com"
  ];
  var STUN_REGEX_RULE = "DOMAIN-REGEX,(^|\\.)stun[0-9]*\\.," + MAIN_GROUP;

  var CN_PROCESSES = [
    "WeChat.exe", "Weixin.exe", "WeChatAppEx.exe", "WXWork.exe", "QQ.exe", "TIM.exe",
    "DingTalk.exe", "Feishu.exe", "Lark.exe", "WeMeetApp.exe", "wemeetapp.exe",
    "cloudmusic.exe", "QQMusic.exe", "KuGou.exe", "BaiduNetdisk.exe", "aDrive.exe",
    "Thunder.exe", "DownloadSDKServer.exe", "QQLive.exe", "QQLiveService.exe", "iQIYI.exe", "Youku.exe",
    "AliIM.exe", "AliWorkbench.exe", "WPS.exe", "wps.exe", "SunloginClient.exe", "ToDesk.exe",
    "WeChat", "WeChatAppEx", "企业微信", "QQ", "DingTalk", "Feishu", "Lark", "TencentMeeting",
    "NeteaseMusic", "QQMusic", "KuGou", "BaiduNetdisk", "aDrive", "Thunder", "ToDesk",
    "wpsoffice", "SunloginClient", "iQIYI", "Youku"
  ];
  var DOCKER_PROCESSES = [
    "com.docker.backend.exe", "com.docker.backend", "com.docker.build.exe", "com.docker.dev-envs.exe",
    "vpnkit.exe", "vpnkit-bridge.exe", "com.docker.vpnkit",
    "dockerd", "containerd", "docker-proxy"
  ];
  if (INCLUDE_WSL_IN_DOCKER) {
    DOCKER_PROCESSES.push("wslrelay.exe", "wslhost.exe");
  }

  // ==================== 5. 工具函数 ====================
  function isStrongPassword(pw) {
    if (typeof pw !== "string" || pw.length < 8) return false;
    if (/CHANGE_ME|password|123456|admin|default/i.test(pw)) return false;
    return true;
  }

  function isDenied(name) {
    if (TAIWAN_MARK.test(name)) {
      var cleaned = name
        .replace(/(🇨🇳|中国|China)/gi, " ")
        .replace(/(?:^|[^a-zA-Z0-9])CN(?:$|[^a-zA-Z0-9])/gi, " ");
      return REGION_DENY.test(cleaned);
    }
    return REGION_DENY.test(name);
  }

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
        if (hasOwn.call(extraFields, k)) {
          group[k] = extraFields[k];
        }
      }
    }
    return group;
  }

  // ==================== 6. 节点清洗与 Provider 测速实例派生 ====================
  var aiProviderNames = [];
  if (hasProviders) {
    var nextProviders = {};
    Object.keys(rawProviders).filter(function(k) { return /_ai$/.test(k); }).forEach(function(k) {
      nextProviders[k] = rawProviders[k];
    });
    for (var i = 0; i < baseProviderNames.length; i++) {
      var pName = baseProviderNames[i];
      var pConf = rawProviders[pName];
      if (!pConf || typeof pConf !== "object") continue;

      var baseHc = Object.assign({
        enable: true,
        url: TEST_URL,
        interval: TEST_INTERVAL,
        timeout: TEST_TIMEOUT,
        lazy: true,
        "expected-status": 204
      }, pConf["health-check"] || {});
      nextProviders[pName] = Object.assign({}, pConf, {
        "health-check": baseHc
      });

      if (!UNIFY_AI_AND_GLOBAL) {
        var aiPName = pName + "_ai";
        if (hasOwn.call(rawProviders, aiPName)) {
          throw new Error("Provider 名称冲突: " + aiPName + " 已存在, 无法派生 AI Provider。");
        }
        var aiHc = Object.assign({
          enable: true,
          url: AI_TEST_URL,
          interval: AI_TEST_INTERVAL,
          timeout: TEST_TIMEOUT,
          lazy: true,
          "expected-status": 200
        }, pConf["health-check"] || {});
        var aiPConf = Object.assign({}, pConf, {
          "health-check": aiHc
        });
        // file 型 provider 的 path 是节点来源, 派生实例复用同一文件即可;
        // 改成 <name>_ai 会指向不存在的路径, 令 AI 组的 use 落到空节点池。
        // http 型 provider 的 path 是下载缓存, 两个实例需分开避免互相覆盖。
        if (pConf.type === "http" && typeof pConf.path === "string" && pConf.path.trim()) {
          aiPConf.path = pConf.path.replace(/(\.[a-zA-Z0-9]+)?$/, "_ai$1");
        }
        nextProviders[aiPName] = aiPConf;
        aiProviderNames.push(aiPName);
      }
    }
    config["proxy-providers"] = nextProviders;
  }

  var seen = Object.create(null);
  var unique = sourceProxies.filter(function(proxy) {
    if (!proxy || typeof proxy.name !== "string" || !proxy.name.trim()) return false;
    if (proxy.name.length > MAX_PROXY_NAME_LENGTH || RESERVED_PROXY_NAMES[proxy.name]) return false;
    var proxyType = typeof proxy.type === "string" ? proxy.type.toLowerCase() : "";
    if (proxyType === "direct" || proxyType === "reject" || proxyType === "dns" || proxyType === "compatible") return false;
    if (isDenied(proxy.name) || INFO_DENY.test(proxy.name)) return false;
    if (seen[proxy.name]) return false;
    seen[proxy.name] = true;
    return true;
  });

  var preferred = unique.filter(function(p) { return PREFERRED_REGION.test(p.name); }).sort(byName);
  var others = unique.filter(function(p) { return !PREFERRED_REGION.test(p.name); }).sort(byName);
  var validProxies = preferred.concat(others);

  config.proxies = validProxies;
  var allNames = validProxies.map(function(p) { return p.name; });
  var preferredNames = preferred.map(function(p) { return p.name; });
  var nonPreferredNames = others.map(function(p) { return p.name; });

  var aiPool = allNames.filter(function(name) { return AI_ALLOW.test(name); });
  var dockerPool = allNames.filter(function(name) { return DOCKER_ALLOW.test(name); });

  // ==================== 7. 全局安全与监听器加固 ====================
  config.ipv6 = false;
  var LAN_READY = ALLOW_LAN_ACCESS && !PASS_UNSET && isStrongPassword(PROXY_PASS);
  config["allow-lan"] = LAN_READY;
  config["bind-address"] = LAN_READY ? "0.0.0.0" : "127.0.0.1";
  if (LAN_READY) {
    config["lan-allowed-ips"] = [
      "127.0.0.1/8",
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16"
    ];
  }
  // [MERGE-4] 未配置口令时不下发鉴权项（避免公开占位符/空口令进入配置）
  if (PASS_UNSET) { delete config["authentication"]; }
  else { config["authentication"] = [PROXY_USER + ":" + PROXY_PASS]; }
  config["skip-auth-prefixes"] = [
    "127.0.0.1/32",
    "::1/128"
  ];
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

  // [ISSUE-01] 局域网/容器入站监听加固
  var existingListeners = oldListeners.filter(function(l) {
    return l && typeof l === "object" && l.name !== "docker-in";
  });
  var dockerListener = {
    name: "docker-in",
    type: "mixed",
    port: DOCKER_PORT,
    udp: true,
    // [MERGE-4] listen 恒显式：LAN 就绪才对外，否则仅回环（v1.3.2 非 LAN 时缺省、绑定语义依内核）
    listen: LAN_READY ? "0.0.0.0" : "127.0.0.1"
  };
  if (!PASS_UNSET) {
    dockerListener.users = [{ username: PROXY_USER, password: PROXY_PASS }];
  }
  config.listeners = existingListeners.concat([dockerListener]);

  if (ENABLE_TUN) {
    config.tun = Object.assign({}, config.tun || {}, {
      enable: true,
      stack: "mixed",
      "dns-hijack": ["any:53", "tcp://any:53"],
      "auto-route": true,
      "auto-detect-interface": true,
      "strict-route": true,
      mtu: 1500,
      "udp-timeout": 300
    });
  }

  // ==================== 8. 策略组构建（严格防空池直连回退） ====================
  var providerDenyFilter = "(?i)(" + PROVIDER_REGION_DENY.source + "|" + INFO_DENY.source + ")";
  var fallbackDenyFilter = "(?i)(" + PROVIDER_REGION_DENY.source + "|" + INFO_DENY.source + "|" + PREFERRED_REGION.source + ")";

  var globalProviderFields = hasProviders
    ? { use: baseProviderNames, "exclude-filter": providerDenyFilter, "empty-fallback": "REJECT" }
    : {};
  var preferredProviderFields = hasProviders
    ? { use: baseProviderNames, filter: "(?i)(" + PREFERRED_REGION.source + ")", "exclude-filter": providerDenyFilter, "empty-fallback": "REJECT" }
    : {};
  var fallbackProviderFields = hasProviders
    ? { use: baseProviderNames, "exclude-filter": fallbackDenyFilter, "empty-fallback": "REJECT" }
    : {};
  var aiProviderFields = hasProviders
    ? { use: aiProviderNames.length > 0 ? aiProviderNames : baseProviderNames, filter: "(?i)(" + AI_ALLOW.source + ")", "exclude-filter": providerDenyFilter, "empty-fallback": "REJECT" }
    : {};
  var dockerProviderFields = hasProviders
    ? { use: baseProviderNames, filter: "(?i)(" + DOCKER_ALLOW.source + ")", "exclude-filter": providerDenyFilter, "empty-fallback": "REJECT" }
    : {};

  var hasPreferred = preferredNames.length > 0 || hasProviders;
  var hasFallback = nonPreferredNames.length > 0 || hasProviders;
  var hasAi = aiPool.length > 0 || hasProviders;
  var hasDocker = dockerPool.length > 0 || hasProviders;

  var autoGroups = [];
  var bestSelectorName = null;

  if (preferredNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(BEST_AUTO_GROUP, preferredNames, preferredProviderFields));
    bestSelectorName = BEST_AUTO_GROUP;
  }
  if (preferredNames.length > 0 && nonPreferredNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(BEST_FALLBACK_AUTO_GROUP, nonPreferredNames, fallbackProviderFields));
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
  if (allNames.length === 0 && baseProviderNames.length > 0) {
    autoGroups.push(makeUrlTestGroup(PROVIDER_AUTO_GROUP, null, {
      use: baseProviderNames,
      "exclude-filter": providerDenyFilter,
      "empty-fallback": "REJECT"
    }));
    bestSelectorName = PROVIDER_AUTO_GROUP;
  }

  if (!UNIFY_AI_AND_GLOBAL && aiPool.length > 0) {
    var aiAutoGroupObj = Object.assign({
      name: AI_AUTO_GROUP,
      type: "url-test",
      url: AI_TEST_URL,
      interval: AI_TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: true,
      hidden: true,
      "expected-status": 200
    }, aiProviderFields, { proxies: aiPool });
    autoGroups.push(aiAutoGroupObj);
  }
  if (dockerPool.length > 0) {
    autoGroups.push(makeUrlTestGroup(DOCKER_AUTO_GROUP, dockerPool, dockerProviderFields));
  }

  var aiPrimary = !UNIFY_AI_AND_GLOBAL && aiPool.length > 0;
  var globalProxies = (aiPrimary ? [AI_GROUP] : [])
    .concat(bestSelectorName ? [bestSelectorName] : [])
    .concat(allNames);
  if (globalProxies.length === 0 && baseProviderNames.length === 0) globalProxies = ["DIRECT"];

  var aiProxies = aiPool.length > 0 ? [AI_AUTO_GROUP].concat(aiPool) : [MAIN_GROUP];
  var dockerProxies = dockerPool.length > 0 ? [DOCKER_AUTO_GROUP].concat(dockerPool) : ["REJECT"];

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

  // ==================== 9. DNS 与 Sniffer ====================
  var CN_DOH = ["https://223.5.5.5/dns-query", "https://doh.pub/dns-query"];
  var GLOBAL_DOH = ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"];

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
      "captive.apple.com", "+.apple.com"
    ],
    // DNS 请求必须按 Mihomo 路由规则选择出口；不配置 fallback，避免代理故障时静默回退。
    "respect-rules": true,
    // IP 形式的 bootstrap resolver，专用于解析 DoH/代理服务器域名；这是必要的引导例外。
    "default-nameserver": ["tls://223.5.5.5"],
    // 代理节点域名解析只走指定国内 DoH，移除明文 UDP DNS 备用项。
    "proxy-server-nameserver": CN_DOH,
    "direct-nameserver": CN_DOH,
    "direct-nameserver-follow-policy": false,
    // 默认及国际域名使用具备正确 TLS 主机名校验的国际 DoH；respect-rules 使连接按规则走代理。
    nameserver: GLOBAL_DOH,
    "nameserver-policy": {
      "geosite:private": ["system"],
      "geosite:cn": CN_DOH,
      "geosite:tld-cn": CN_DOH,
      "geosite:geolocation-!cn": GLOBAL_DOH,
      "+.lan": ["system"],
      "+.local": ["system"],
      "+.home.arpa": ["system"]
    }
  };

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

  if (hasOwn.call(options, "RULE_PROVIDERS_META") && options.RULE_PROVIDERS_META) {
    config["rule-providers"] = Object.assign({}, config["rule-providers"] || {}, {
      meta: {
        type: "http",
        behavior: "classical",
        url: "https://raw.githubusercontent.com/hoolhub2-afk/meta-rules-dat/meta/geo/geosite/classical/meta.yaml",
        path: "./providers/meta.yaml",
        interval: 86400
      }
    });
  }

  // ==================== 10. 严格优先级路由规则 ====================
  var baseHeadRules = [
    // 本地回环与私网直连；不影响公网 WebRTC/STUN。
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,169.254.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,100.64.0.0/10,DIRECT,no-resolve",
    "GEOSITE,private,DIRECT",
    "GEOIP,private,DIRECT,no-resolve",
    "DOMAIN-SUFFIX,local,DIRECT",
    "DOMAIN-SUFFIX,docker.internal,DIRECT",
    // 唯一 bootstrap DoT 例外：用于解析国际 DoH / 代理节点域名；其余客户端 DoT 仍阻断。
    "IP-CIDR,223.5.5.5/32,DIRECT,no-resolve",
    "AND,((NETWORK,TCP),(DST-PORT,853)),REJECT",
    "AND,((NETWORK,UDP),(DST-PORT,853)),REJECT"
  ];

  var dockerProcessRules = DOCKER_PROCESSES.map(function(p) {
    return "PROCESS-NAME," + p + "," + DOCKER_GROUP;
  });

  var domesticDirectRules = [].concat(
    CN_PROCESSES.map(function(p) { return "PROCESS-NAME," + p + ",DIRECT"; }),
    [
      "GEOSITE,cn,DIRECT",
      "GEOSITE,tld-cn,DIRECT",
      "GEOSITE,apple-cn,DIRECT",
      "GEOSITE,microsoft@cn,DIRECT",
      "GEOSITE,steam@cn,DIRECT",
      "GEOSITE,category-games@cn,DIRECT",
      "DOMAIN-SUFFIX,cn,DIRECT"
    ],
    suffix(CN_DOMAINS, "DIRECT"),
    suffix(CLOUDFLARE_DIRECT_DOMAINS, "DIRECT"),
    [
      "GEOIP,CN,DIRECT,no-resolve"
    ]
  );

  var tailCommonRules = [].concat(
    [
      // 5. 宿主机海外公共 DNS
      "IP-CIDR,1.1.1.1/32," + MAIN_GROUP + ",no-resolve",
      "IP-CIDR,8.8.8.8/32," + MAIN_GROUP + ",no-resolve"
    ],
    suffix(HARK_DOMAINS, EFFECTIVE_AI_TARGET),
    suffix(AI_DOMAINS, EFFECTIVE_AI_TARGET),
    suffix(IP_CHECK_DOMAINS, MAIN_GROUP),
    (config["rule-providers"] && config["rule-providers"].meta) ? ["RULE-SET,meta," + MAIN_GROUP] : [],
    GLOBAL_ALL ? [] : ["GEOSITE,geolocation-!cn," + MAIN_GROUP],
    [
      "MATCH," + MAIN_GROUP
    ]
  );

  // Docker Hub 直连例外必须排在 baseHeadRules 的 IN-PORT 捕获之前,
  // 否则容器流量先被锁进容器组, DOCKER_HUB_VIA_PROXY=false 不会生效。
  var dockerHubDirectRules = DOCKER_HUB_VIA_PROXY ? [] : suffix(["docker.io", "registry-1.docker.io"], "DIRECT");
  // [SEC-06] STUN 规则置于国内直连与 UDP/443 规则之前，避免规则优先级覆盖；域名与端口双层匹配。
  var stunProxyRules = [].concat(
    suffix(STUN_DOMAINS, MAIN_GROUP),
    [
      STUN_REGEX_RULE,
      // 标准 STUN/TURN 端口：TCP/UDP 均强制进入代理；Google 常用 19302-19309/UDP 亦覆盖。
      "AND,((NETWORK,UDP),(DST-PORT,3478))," + MAIN_GROUP,
      "AND,((NETWORK,TCP),(DST-PORT,3478))," + MAIN_GROUP,
      "AND,((NETWORK,UDP),(DST-PORT,5349))," + MAIN_GROUP,
      "AND,((NETWORK,TCP),(DST-PORT,5349))," + MAIN_GROUP,
      "AND,((NETWORK,UDP),(DST-PORT,19302-19309))," + MAIN_GROUP
    ]
  );
  // UDP/443（含可能使用该端口的 TURN/QUIC）不再直接 REJECT；强制经主代理组。
  // 若代理节点不支持 UDP，连接会失败关闭，而不会回退到本地公网出口。
  var internationalUdp443ProxyRule =
    "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((GEOSITE,cn))),(NOT,((GEOIP,cn))))," + MAIN_GROUP;
  var dnsResolverRules = [
    "DOMAIN-SUFFIX,cloudflare-dns.com," + MAIN_GROUP,
    "DOMAIN-SUFFIX,dns.google," + MAIN_GROUP
  ];
  config.rules = [].concat(
    dockerHubDirectRules,
    baseHeadRules,
    stunProxyRules,
    [internationalUdp443ProxyRule],
    ["IN-PORT," + DOCKER_PORT + "," + DOCKER_GROUP],
    dockerProcessRules,
    GLOBAL_ALL ? [] : domesticDirectRules,
    dnsResolverRules,
    tailCommonRules
  );

  return config;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = main;
}
