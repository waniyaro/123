/**
 * Proxy Module - Proxy Management for reCAPTCHA requests
 * Handles proxy selection, rotation, and fallback mechanisms
 */

(function (exports) {
  "use strict";

  // Get dependencies with validation
  const core = AteexModules.core;

  // Validate dependencies before use
  if (!core) {
    throw new Error("Core module not loaded - missing dependency");
  }
  const { log, logInfo, logError, logSuccess, logWarning, logDebug } = core;

  // ============= PROXY CONFIGURATION =============

  // Default proxy list từ Webshare
  const DEFAULT_PROXY_LIST = [
    "38.154.227.167:5868:kdzrrkqv:763ww9x8x6x3",
    "198.23.239.134:6540:kdzrrkqv:763ww9x8x6x3",
    "207.244.217.165:6712:kdzrrkqv:763ww9x8x6x3",
    "107.172.163.27:6543:kdzrrkqv:763ww9x8x6x3",
    "216.10.27.159:6837:kdzrrkqv:763ww9x8x6x3",
    "136.0.207.84:6661:kdzrrkqv:763ww9x8x6x3",
    "64.64.118.149:6732:kdzrrkqv:763ww9x8x6x3",
    "142.147.128.93:6593:kdzrrkqv:763ww9x8x6x3",
    "104.239.105.125:6655:kdzrrkqv:763ww9x8x6x3",
    "206.41.172.74:6634:kdzrrkqv:763ww9x8x6x3",
    "156.253.166.39:3129::",
    "154.213.193.50:3129::",
    "156.248.82.131:3129::",
    "156.242.34.12:3129::",
    "45.201.10.76:3129::",
    "156.242.33.139:3129::",
    "156.228.176.249:3129::",
    "154.213.166.44:3129::",
  ];

  const PROXY_STORAGE_KEY = "ateex_proxy_list";
  const PROXY_STATS_KEY = "ateex_proxy_stats";
  const PROXY_ENABLED_KEY = "ateex_proxy_enabled";
  const MAX_PROXY_RETRIES = 3;
  const PROXY_TIMEOUT = 15000; // 15 seconds timeout

  // ============= PROXY MANAGEMENT =============

  let proxyList = [];
  let proxyStats = {};
  let lastUsedProxyIndex = -1;
  let proxyEnabled = false; // Default disabled to avoid initial overhead

  // Track HTTP 405 errors to auto-disable proxy if too many
  let http405Count = 0;
  const MAX_405_ERRORS = 5; // Auto-disable after 5 consecutive 405 errors

  // Check if proxy is enabled
  function isProxyEnabled() {
    try {
      const saved = localStorage.getItem(PROXY_ENABLED_KEY);
      return saved !== null ? saved === "true" : false; // Default false (disabled)
    } catch (e) {
      return false;
    }
  }

  // Enable/disable proxy
  function setProxyEnabled(enabled) {
    try {
      proxyEnabled = enabled;
      localStorage.setItem(PROXY_ENABLED_KEY, enabled.toString());
      logInfo(`🌐 Proxy ${enabled ? "enabled" : "disabled"}`);
    } catch (e) {
      logError("Error saving proxy enabled state: " + e.message);
    }
  }

  // Auto-enable proxy when needed (like when blocked by Google)
  function enableProxyForAutomatedQueries() {
    if (!isProxyEnabled()) {
      logInfo("🔄 Auto-enabling proxy due to automated queries detection");

      // Ensure proxy data is loaded
      ensureProxyDataLoaded();

      setProxyEnabled(true);

      // Test a few proxies in background without blocking
      setTimeout(() => {
        logInfo("🧪 Testing subset of proxies for immediate use...");
        testProxySubset(5); // Test only first 5 proxies
      }, 1000);

      return true;
    }
    return false;
  }

  // Test only a subset of proxies for faster activation
  async function testProxySubset(count = 5) {
    if (!isProxyEnabled()) {
      logWarning("Proxy disabled, skipping subset test");
      return;
    }

    // Ensure proxy data is loaded
    ensureProxyDataLoaded();

    const testUrl = "https://httpbin.org/ip";
    const subsetToTest = proxyList.slice(0, Math.min(count, proxyList.length));

    logInfo(
      `🧪 Testing ${subsetToTest.length} proxies for quick activation...`
    );

    let successCount = 0;

    for (const proxy of subsetToTest) {
      try {
        const startTime = Date.now();

        // Try direct test first to avoid proxy recursion
        const response = await new Promise((resolve, reject) => {
          // Test proxy without using proxy system to avoid recursion
          GM_xmlhttpRequest({
            method: "GET",
            url: testUrl,
            timeout: 8000, // Shorter timeout for quick test
            proxy: `http://${
              proxy.username && proxy.password
                ? `${proxy.username}:${proxy.password}@`
                : ""
            }${proxy.host}:${proxy.port}`,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            onload: resolve,
            onerror: reject,
            ontimeout: () => reject(new Error("Timeout")),
          });
        });

        const responseTime = Date.now() - startTime;

        if (response.status === 200) {
          updateProxyStats(proxy.proxy, true, responseTime);
          successCount++;
          logSuccess(
            `✅ Quick test passed: ${proxy.proxy} (${responseTime}ms)`
          );
        } else {
          updateProxyStats(proxy.proxy, false, responseTime);
          logWarning(
            `⚠️ Quick test failed: ${proxy.proxy} - HTTP ${response.status}`
          );
        }
      } catch (error) {
        updateProxyStats(proxy.proxy, false, 8000);
        logWarning(
          `❌ Quick test error: ${proxy.proxy} - ${
            error.message || "Unknown error"
          }`
        );
      }

      // Small delay to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logSuccess(
      `🧪 Quick test completed: ${successCount}/${subsetToTest.length} working`
    );
    return { tested: subsetToTest.length, passed: successCount };
  }

  // Parse proxy string để support cả 2 định dạng
  function parseProxy(proxyString) {
    const parts = proxyString.split(":");

    if (parts.length === 2) {
      // Format: "ip:port"
      return {
        host: parts[0],
        port: parseInt(parts[1]),
        username: null,
        password: null,
        proxy: `${parts[0]}:${parts[1]}`,
      };
    } else if (parts.length === 4) {
      // Format: "ip:port:username:password"
      return {
        host: parts[0],
        port: parseInt(parts[1]),
        username: parts[2],
        password: parts[3],
        proxy: `${parts[0]}:${parts[1]}`,
      };
    } else {
      throw new Error(`Invalid proxy format: ${proxyString}`);
    }
  }

  // Load proxy list từ localStorage hoặc sử dụng default
  function loadProxyList() {
    try {
      const saved = localStorage.getItem(PROXY_STORAGE_KEY);
      if (saved) {
        const savedList = JSON.parse(saved);
        if (Array.isArray(savedList) && savedList.length > 0) {
          proxyList = savedList.map(parseProxy);
          logSuccess(`📡 Loaded ${proxyList.length} proxies from storage`);
          return;
        }
      }

      // Sử dụng default list nếu không có trong storage
      proxyList = DEFAULT_PROXY_LIST.map(parseProxy);
      saveProxyList();
      logSuccess(`📡 Initialized with ${proxyList.length} default proxies`);
    } catch (e) {
      logError("Error loading proxy list: " + e.message);
      // Fallback về default list
      proxyList = DEFAULT_PROXY_LIST.map(parseProxy);
      logWarning("Using default proxy list as fallback");
    }
  }

  // Save proxy list to localStorage
  function saveProxyList() {
    try {
      const proxyStrings = proxyList.map(proxy => {
        if (proxy.username && proxy.password) {
          return `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`;
        } else {
          return `${proxy.host}:${proxy.port}`;
        }
      });
      localStorage.setItem(PROXY_STORAGE_KEY, JSON.stringify(proxyStrings));
    } catch (e) {
      logError("Error saving proxy list: " + e.message);
    }
  }

  // Load proxy statistics
  function loadProxyStats() {
    try {
      const saved = localStorage.getItem(PROXY_STATS_KEY);
      if (saved) {
        proxyStats = JSON.parse(saved);
      } else {
        proxyStats = {};
      }
    } catch (e) {
      logError("Error loading proxy stats: " + e.message);
      proxyStats = {};
    }
  }

  // Save proxy statistics
  function saveProxyStats() {
    try {
      // Throttled save để giảm localStorage overhead
      clearTimeout(window.proxyStatsTimeout);
      window.proxyStatsTimeout = setTimeout(() => {
        localStorage.setItem(PROXY_STATS_KEY, JSON.stringify(proxyStats));
      }, 2000);
    } catch (e) {
      logError("Error saving proxy stats: " + e.message);
    }
  }

  // Update proxy statistics
  function updateProxyStats(
    proxyKey,
    success,
    responseTime,
    isBlocked = false
  ) {
    if (!proxyStats[proxyKey]) {
      proxyStats[proxyKey] = {
        totalRequests: 0,
        successfulRequests: 0,
        totalResponseTime: 0,
        lastUsed: 0,
        failures: 0,
        avgResponseTime: 0,
        blockedCount: 0,
        lastBlocked: 0,
      };
    }

    const stats = proxyStats[proxyKey];
    stats.totalRequests++;
    stats.lastUsed = Date.now();

    if (success) {
      stats.successfulRequests++;
      stats.totalResponseTime += responseTime;
      stats.avgResponseTime = Math.round(
        stats.totalResponseTime / stats.successfulRequests
      );
      stats.failures = Math.max(0, stats.failures - 1); // Reduce failures on success
    } else {
      stats.failures++;

      if (isBlocked) {
        stats.blockedCount++;
        stats.lastBlocked = Date.now();
        logWarning(`🚫 Proxy ${proxyKey} marked as blocked by Google`);
      }
    }

    saveProxyStats();
  }

  // Mark proxy as blocked by Google
  function markProxyAsBlocked(proxyKey) {
    updateProxyStats(proxyKey, false, 30000, true);

    // Add extra failures for blocked proxy
    for (let i = 0; i < 3; i++) {
      updateProxyStats(proxyKey, false, 30000, false);
    }

    logWarning(`🔴 Proxy ${proxyKey} has been marked as blocked by Google`);
  }

  // Chọn proxy ngẫu nhiên với logic thông minh
  function selectRandomProxy(excludeProxies = []) {
    // Ensure proxy data is loaded
    ensureProxyDataLoaded();

    if (proxyList.length === 0) {
      logError("No proxies available");
      return null;
    }

    // Filter ra những proxy bị exclude
    const availableProxies = proxyList.filter(proxy => {
      const proxyKey = proxy.proxy;
      return !excludeProxies.includes(proxyKey);
    });

    if (availableProxies.length === 0) {
      logWarning("All proxies excluded, using full list");
      return proxyList[Math.floor(Math.random() * proxyList.length)];
    }

    // Weighted random selection dựa trên success rate và block status
    const proxiesWithWeights = availableProxies.map(proxy => {
      const stats = proxyStats[proxy.proxy];
      let weight = 1; // Base weight

      if (stats && stats.totalRequests > 0) {
        const successRate = stats.successfulRequests / stats.totalRequests;
        weight = successRate * 10; // Higher success rate = higher weight

        // Penalty cho proxy có failures gần đây
        if (stats.failures > 0) {
          weight = weight / (stats.failures * 2);
        }

        // Heavy penalty cho blocked proxies
        if (stats.blockedCount > 0) {
          const timeSinceBlocked = Date.now() - (stats.lastBlocked || 0);
          const blockCooldown = 60 * 60 * 1000; // 1 hour cooldown for blocked proxies

          if (timeSinceBlocked < blockCooldown) {
            weight = weight / (stats.blockedCount * 10); // Heavy penalty for recent blocks
            logDebug(`Proxy ${proxy.proxy} blocked recently, reducing weight`);
          } else {
            weight = weight / (stats.blockedCount * 2); // Lighter penalty for old blocks
          }
        }
      }

      return { proxy, weight: Math.max(weight, 0.01) }; // Lower minimum weight for blocked proxies
    });

    // Random weighted selection
    const totalWeight = proxiesWithWeights.reduce(
      (sum, item) => sum + item.weight,
      0
    );
    let random = Math.random() * totalWeight;

    for (const item of proxiesWithWeights) {
      random -= item.weight;
      if (random <= 0) {
        return item.proxy;
      }
    }

    // Fallback về random proxy nếu weighted selection fails
    return availableProxies[
      Math.floor(Math.random() * availableProxies.length)
    ];
  }

  // Get proxy configuration cho GM_xmlhttpRequest
  function getProxyConfig(proxy) {
    if (!proxy) return null;

    // Different proxy formats for compatibility
    if (proxy.username && proxy.password) {
      // Format with authentication - try multiple formats
      return {
        proxy: `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`,
        // Alternative formats for different proxy types
        proxyType: "http",
        proxyHost: proxy.host,
        proxyPort: proxy.port,
        proxyUsername: proxy.username,
        proxyPassword: proxy.password,
      };
    } else {
      // Format without authentication
      return {
        proxy: `http://${proxy.host}:${proxy.port}`,
        proxyType: "http",
        proxyHost: proxy.host,
        proxyPort: proxy.port,
      };
    }
  }

  // ============= PROXY REQUEST WRAPPER =============

  // Enhanced GM_xmlhttpRequest với proxy support và retry logic
  function makeProxyRequest(options) {
    return new Promise((resolve, reject) => {
      // Check if proxy is disabled, fallback to direct request
      if (!isProxyEnabled()) {
        logDebug("🚫 Proxy disabled, making direct request");
        GM_xmlhttpRequest({
          ...options,
          onload: resolve,
          onerror: reject,
          ontimeout: () => reject(new Error("Request timeout")),
        });
        return;
      }

      const excludedProxies = [];
      let attempt = 0;

      function attemptRequest() {
        attempt++;

        if (attempt > MAX_PROXY_RETRIES) {
          logWarning(
            "All proxy attempts failed, trying direct request as fallback"
          );

          // Fallback to direct request
          GM_xmlhttpRequest({
            ...options,
            onload: function (response) {
              logWarning("✅ Fallback direct request succeeded");
              resolve(response);
            },
            onerror: function (error) {
              const errorMsg =
                error && error.message
                  ? error.message
                  : error && error.toString
                  ? error.toString()
                  : typeof error === "string"
                  ? error
                  : "Unknown error";
              logError(`❌ Direct request also failed: ${errorMsg}`);
              reject(new Error("All proxy attempts and direct request failed"));
            },
            ontimeout: function () {
              logError("❌ Direct request timeout");
              reject(new Error("All proxy attempts and direct request failed"));
            },
          });
          return;
        }

        // Chọn proxy cho attempt này
        const selectedProxy = selectRandomProxy(excludedProxies);
        if (!selectedProxy) {
          logWarning("No available proxy, trying direct request");

          // Fallback to direct request immediately
          GM_xmlhttpRequest({
            ...options,
            onload: resolve,
            onerror: reject,
            ontimeout: () => reject(new Error("Direct request timeout")),
          });
          return;
        }

        const proxyConfig = getProxyConfig(selectedProxy);
        const requestStart = Date.now();

        logInfo(
          `🔄 Proxy attempt ${attempt}/${MAX_PROXY_RETRIES}: ${selectedProxy.proxy}`
        );

        // Create enhanced request options with better proxy support
        const requestOptions = {
          ...options,
          timeout: PROXY_TIMEOUT,
          headers: {
            ...options.headers,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
          },
          onload: function (response) {
            const responseTime = Date.now() - requestStart;

            if (response.status === 200) {
              // Reset 405 counter on successful request
              http405Count = 0;
              updateProxyStats(selectedProxy.proxy, true, responseTime);
              logSuccess(
                `✅ Proxy success: ${selectedProxy.proxy} (${responseTime}ms)`
              );
              resolve(response);
            } else if (response.status === 405) {
              // Method not allowed - track 405 errors
              http405Count++;
              updateProxyStats(selectedProxy.proxy, false, responseTime);
              logWarning(
                `⚠️ Proxy HTTP 405: ${selectedProxy.proxy} (${http405Count}/${MAX_405_ERRORS}) - trying alternative method`
              );

              // Auto-disable proxy if too many 405 errors
              if (http405Count >= MAX_405_ERRORS) {
                logError(
                  `❌ Too many HTTP 405 errors (${http405Count}), auto-disabling proxy system`
                );
                setProxyEnabled(false);

                // Fallback to direct request immediately
                GM_xmlhttpRequest({
                  ...options,
                  onload: function (directResponse) {
                    logWarning(
                      "✅ Fallback to direct request after auto-disable"
                    );
                    resolve(directResponse);
                  },
                  onerror: function (error) {
                    logError(
                      `❌ Direct request after auto-disable failed: ${
                        error.message || "Unknown"
                      }`
                    );
                    reject(
                      new Error("Proxy auto-disabled and direct request failed")
                    );
                  },
                  ontimeout: function () {
                    logError("❌ Direct request timeout after auto-disable");
                    reject(
                      new Error(
                        "Proxy auto-disabled and direct request timeout"
                      )
                    );
                  },
                });
                return;
              }

              // Try GET request if POST failed due to 405
              if (options.method === "POST") {
                const getOptions = {
                  ...requestOptions,
                  method: "GET",
                  data: undefined, // Remove POST data for GET
                  url: options.data
                    ? `${options.url}?${options.data}`
                    : options.url,
                };

                GM_xmlhttpRequest(getOptions);
                return;
              }

              // If it's already GET or other method, exclude and retry
              excludedProxies.push(selectedProxy.proxy);
              setTimeout(attemptRequest, 1000);
            } else {
              updateProxyStats(selectedProxy.proxy, false, responseTime);
              logWarning(
                `⚠️ Proxy HTTP error ${response.status}: ${selectedProxy.proxy}`
              );

              // Thêm proxy vào exclude list và retry
              excludedProxies.push(selectedProxy.proxy);
              setTimeout(attemptRequest, 1000); // Wait 1s before retry
            }
          },
          onerror: function (error) {
            const responseTime = Date.now() - requestStart;
            updateProxyStats(selectedProxy.proxy, false, responseTime);

            // Better error formatting
            const errorMsg =
              error && error.message
                ? error.message
                : error && error.toString
                ? error.toString()
                : typeof error === "string"
                ? error
                : "Unknown error";

            logWarning(`❌ Proxy error: ${selectedProxy.proxy} - ${errorMsg}`);

            // Thêm proxy vào exclude list và retry
            excludedProxies.push(selectedProxy.proxy);
            setTimeout(attemptRequest, 1000); // Wait 1s before retry
          },
          ontimeout: function () {
            const responseTime = Date.now() - requestStart;
            updateProxyStats(selectedProxy.proxy, false, responseTime);
            logWarning(`⏰ Proxy timeout: ${selectedProxy.proxy}`);

            // Thêm proxy vào exclude list và retry
            excludedProxies.push(selectedProxy.proxy);
            setTimeout(attemptRequest, 1000); // Wait 1s before retry
          },
        };

        // Apply proxy config with fallback attempts
        if (proxyConfig) {
          // Try primary proxy format first
          Object.assign(requestOptions, {
            proxy: proxyConfig.proxy,
          });

          // Log proxy attempt with detailed info
          logDebug(
            `🔗 Proxy request details:
- Proxy: ${selectedProxy.proxy}
- Method: ${options.method || "GET"}
- URL: ${options.url}
- Has Auth: ${!!(selectedProxy.username && selectedProxy.password)}
- Proxy URL: ${proxyConfig.proxy.replace(/:([^:@]+)@/, ":***@")}`
          );
        }

        // Make request với proxy
        try {
          GM_xmlhttpRequest(requestOptions);
        } catch (error) {
          logWarning(
            `Request setup error with proxy ${selectedProxy.proxy}: ${error.message}`
          );

          // Fallback to direct request for this attempt
          updateProxyStats(
            selectedProxy.proxy,
            false,
            Date.now() - requestStart
          );
          excludedProxies.push(selectedProxy.proxy);
          setTimeout(attemptRequest, 1000);
        }
      }

      // Start first attempt
      attemptRequest();
    });
  }

  // ============= PROXY MANAGEMENT METHODS =============

  // Thêm proxy mới vào list
  function addProxy(proxyString) {
    try {
      const proxy = parseProxy(proxyString);

      // Check duplicate
      const existing = proxyList.find(p => p.proxy === proxy.proxy);
      if (existing) {
        logWarning(`Proxy already exists: ${proxy.proxy}`);
        return false;
      }

      proxyList.push(proxy);
      saveProxyList();
      logSuccess(`Added new proxy: ${proxy.proxy}`);
      return true;
    } catch (e) {
      logError("Error adding proxy: " + e.message);
      return false;
    }
  }

  // Remove proxy khỏi list
  function removeProxy(proxyString) {
    const proxyKey = proxyString.includes(":")
      ? proxyString.split(":").slice(0, 2).join(":")
      : proxyString;

    const index = proxyList.findIndex(p => p.proxy === proxyKey);
    if (index !== -1) {
      proxyList.splice(index, 1);
      saveProxyList();

      // Xóa stats của proxy này
      delete proxyStats[proxyKey];
      saveProxyStats();

      logSuccess(`Removed proxy: ${proxyKey}`);
      return true;
    } else {
      logWarning(`Proxy not found: ${proxyKey}`);
      return false;
    }
  }

  // Get proxy statistics summary
  function getProxyStatsSummary() {
    // Ensure proxy data is loaded for UI display
    ensureProxyDataLoaded();

    const summary = {
      totalProxies: proxyList.length,
      workingProxies: 0,
      failedProxies: 0,
      blockedProxies: 0,
      proxies: [],
    };

    proxyList.forEach(proxy => {
      const stats = proxyStats[proxy.proxy] || {
        totalRequests: 0,
        successfulRequests: 0,
        failures: 0,
        avgResponseTime: 0,
      };

      const successRate =
        stats.totalRequests > 0
          ? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
          : 0;

      const proxyInfo = {
        proxy: proxy.proxy,
        hasAuth: !!(proxy.username && proxy.password),
        totalRequests: stats.totalRequests,
        successRate: successRate,
        failures: stats.failures,
        avgResponseTime: stats.avgResponseTime,
        lastUsed: stats.lastUsed,
        blockedCount: stats.blockedCount || 0,
        lastBlocked: stats.lastBlocked || 0,
      };

      summary.proxies.push(proxyInfo);

      // Count proxy categories
      if (stats.blockedCount > 0) {
        const timeSinceBlocked = Date.now() - (stats.lastBlocked || 0);
        const cooldownPeriod = 60 * 60 * 1000; // 1 hour

        if (timeSinceBlocked < cooldownPeriod) {
          summary.blockedProxies++;
        } else if (stats.failures < 3 && successRate > 50) {
          summary.workingProxies++; // Recovered from block
        } else {
          summary.failedProxies++;
        }
      } else if (stats.failures < 3 && successRate > 50) {
        summary.workingProxies++;
      } else if (
        stats.failures >= 3 ||
        (stats.totalRequests > 0 && successRate < 50)
      ) {
        summary.failedProxies++;
      }
    });

    return summary;
  }

  // Reset all proxy statistics
  function resetProxyStats() {
    proxyStats = {};
    localStorage.removeItem(PROXY_STATS_KEY);
    logSuccess("Proxy statistics reset");
  }

  // Test all proxies with a simple request
  async function testAllProxies() {
    if (!isProxyEnabled()) {
      logWarning("Proxy disabled, cannot test proxies");
      return;
    }

    // Ensure proxy data is loaded
    ensureProxyDataLoaded();

    logInfo("🧪 Testing all proxies...");
    const testUrl = "https://httpbin.org/ip"; // Simple test endpoint
    let testedCount = 0;
    let successCount = 0;

    for (const proxy of proxyList) {
      try {
        logInfo(
          `Testing proxy ${testedCount + 1}/${proxyList.length}: ${proxy.proxy}`
        );

        const startTime = Date.now();
        const response = await new Promise((resolve, reject) => {
          // Direct proxy test without using proxy system to avoid recursion
          GM_xmlhttpRequest({
            method: "GET",
            url: testUrl,
            timeout: 10000, // 10 second timeout for tests
            proxy: `http://${
              proxy.username && proxy.password
                ? `${proxy.username}:${proxy.password}@`
                : ""
            }${proxy.host}:${proxy.port}`,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            onload: resolve,
            onerror: reject,
            ontimeout: () => reject(new Error("Timeout")),
          });
        });

        const responseTime = Date.now() - startTime;

        if (response.status === 200) {
          updateProxyStats(proxy.proxy, true, responseTime);
          successCount++;
          logSuccess(
            `✅ Proxy test passed: ${proxy.proxy} (${responseTime}ms)`
          );
        } else {
          updateProxyStats(proxy.proxy, false, responseTime);
          logWarning(
            `⚠️ Proxy test failed: ${proxy.proxy} - HTTP ${response.status}`
          );
        }
      } catch (error) {
        const errorMsg =
          error && error.message
            ? error.message
            : error && error.toString
            ? error.toString()
            : typeof error === "string"
            ? error
            : "Unknown error";
        updateProxyStats(proxy.proxy, false, 10000);
        logWarning(`❌ Proxy test error: ${proxy.proxy} - ${errorMsg}`);
      }

      testedCount++;

      // Small delay between tests to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logSuccess(
      `🧪 Proxy testing completed: ${successCount}/${testedCount} passed`
    );
    return { tested: testedCount, passed: successCount };
  }

  // ============= MODULE INITIALIZATION =============

  function initialize() {
    proxyEnabled = isProxyEnabled(); // Load proxy enabled state first

    if (proxyEnabled) {
      // Only load proxy data if enabled
      loadProxyList();
      loadProxyStats();
      logSuccess(
        `[Proxy Module] Initialized with ${proxyList.length} proxies (enabled)`
      );
      logInfo("🌐 Proxy system ready - will activate when needed");
    } else {
      // Lazy load - proxy data will be loaded when first enabled
      logSuccess("[Proxy Module] Initialized (disabled)");
      logInfo("🚫 Proxy system disabled - proxy data will load when needed");
    }
  }

  // Lazy load proxy data when first enabled
  function ensureProxyDataLoaded() {
    if (proxyList.length === 0) {
      logInfo("📡 Loading proxy data on first use...");
      loadProxyList();
      loadProxyStats();
    }
  }

  // Auto-initialize
  initialize();

  // ============= EXPORTS =============

  exports.makeProxyRequest = makeProxyRequest;
  exports.selectRandomProxy = selectRandomProxy;
  exports.getProxyConfig = getProxyConfig;
  exports.addProxy = addProxy;
  exports.removeProxy = removeProxy;
  exports.getProxyStatsSummary = getProxyStatsSummary;
  exports.resetProxyStats = resetProxyStats;
  exports.testAllProxies = testAllProxies;
  exports.testProxySubset = testProxySubset;
  exports.updateProxyStats = updateProxyStats;
  exports.markProxyAsBlocked = markProxyAsBlocked;
  exports.enableProxyForAutomatedQueries = enableProxyForAutomatedQueries;
  exports.ensureProxyDataLoaded = ensureProxyDataLoaded;
  exports.loadProxyList = loadProxyList;
  exports.saveProxyList = saveProxyList;
  exports.isProxyEnabled = isProxyEnabled;
  exports.setProxyEnabled = setProxyEnabled;
  exports.proxyList = proxyList;
  exports.initialize = initialize;
})(exports);
