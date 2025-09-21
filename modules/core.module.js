/**
 * Core Module - Global State, Logging, and Utilities
 * Provides fundamental functionality for all other modules
 */

(function (exports) {
  "use strict";

  // ============= GLOBAL STATE & CONSTANTS =============
  if (!window.ateexGlobalState) {
    window.ateexGlobalState = {
      captchaSolved: false,
      captchaInProgress: false,
      lastSolvedTime: 0,
      lastAutomatedQueriesTime: 0,
      totalCycles: 0,
      totalCoins: 0,
      startTime: Date.now(),
      lastCycleTime: 0,
      credentialsReady: false,
      autoStatsEnabled: false,
      setupCompleted: false,
      autoStatsStartTime: null,
    };
  }

  // Performance mode setting
  const PERFORMANCE_MODE = true;

  // ============= SIMPLE LOGGING SYSTEM =============
  const LOG_LEVELS = {
    INFO: { name: "INFO", color: "#4CAF50", icon: "ℹ️" },
    WARNING: { name: "WARNING", color: "#FF9800", icon: "⚠️" },
    ERROR: { name: "ERROR", color: "#F44336", icon: "❌" },
    SUCCESS: { name: "SUCCESS", color: "#8BC34A", icon: "✅" },
    DEBUG: { name: "DEBUG", color: "#9E9E9E", icon: "🔍" },
  };

  // Anti-spam system for repetitive messages
  const logSpamTracker = new Map();
  const SPAM_THRESHOLD = 30000; // 30 seconds between same messages

  // Anti-spam log function
  function logWithSpamControl(message, level = "INFO", spamKey = null) {
    if (spamKey) {
      const now = Date.now();
      const lastLogged = logSpamTracker.get(spamKey);

      if (lastLogged && now - lastLogged < SPAM_THRESHOLD) {
        return; // Skip this log to prevent spam
      }

      logSpamTracker.set(spamKey, now);
    }

    log(message, level);
  }

  // Simple log function with levels
  function log(message, level = "INFO") {
    const levelInfo = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    console.log(
      `%c[Ateex Auto] ${levelInfo.icon} ${message}`,
      `color: ${levelInfo.color}`
    );
  }

  // Convenience functions for different log levels
  function logInfo(message) {
    log(message, "INFO");
  }

  function logWarning(message) {
    log(message, "WARNING");
  }

  function logError(message) {
    log(message, "ERROR");
  }

  function logSuccess(message) {
    log(message, "SUCCESS");
  }

  function logDebug(message) {
    log(message, "DEBUG");
  }

  // ============= UTILITY FUNCTIONS =============
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function qSelector(selector) {
    return document.querySelector(selector);
  }

  function isHidden(el) {
    return el.offsetParent === null;
  }

  // Generate unique ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Safe JSON parse
  function safeJsonParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return defaultValue;
    }
  }

  // Safe JSON stringify
  function safeJsonStringify(obj, defaultValue = "{}") {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return defaultValue;
    }
  }

  // Format time duration
  function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Deep clone object
  function deepClone(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof Object) {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  }

  // Debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Throttle function
  function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // ============= RUNTIME CONTROL SYSTEM =============

  // Enable auto stats runtime
  function enableAutoStats() {
    if (window.ateexGlobalState.autoStatsEnabled) {
      logWarning("Auto stats already enabled");
      return false;
    }

    window.ateexGlobalState.autoStatsEnabled = true;
    window.ateexGlobalState.setupCompleted = true;
    window.ateexGlobalState.autoStatsStartTime = Date.now();

    // Reset startTime to sync with auto stats start time
    window.ateexGlobalState.startTime =
      window.ateexGlobalState.autoStatsStartTime;

    // Save state to localStorage for persistence
    try {
      localStorage.setItem("ateex_auto_stats_enabled", "true");
      localStorage.setItem("ateex_setup_completed", "true");
      localStorage.setItem(
        "ateex_auto_stats_start_time",
        window.ateexGlobalState.autoStatsStartTime.toString()
      );
    } catch (e) {
      logError("Failed to save runtime state: " + e.message);
    }

    logSuccess("🚀 Auto Stats enabled - runtime started!");
    return true;
  }

  // Disable auto stats runtime
  function disableAutoStats() {
    window.ateexGlobalState.autoStatsEnabled = false;
    window.ateexGlobalState.setupCompleted = false;
    window.ateexGlobalState.autoStatsStartTime = null;

    // Clear state from localStorage
    try {
      localStorage.removeItem("ateex_auto_stats_enabled");
      localStorage.removeItem("ateex_setup_completed");
      localStorage.removeItem("ateex_auto_stats_start_time");
    } catch (e) {
      logError("Failed to clear runtime state: " + e.message);
    }

    logInfo("🛑 Auto Stats disabled");

    // Hide counter UI if exists
    const counter = document.getElementById("ateex-counter");
    if (counter) {
      counter.style.display = "none";
    }

    return true;
  }

  // Check if auto stats should be enabled
  function checkAutoStatsState() {
    try {
      const enabled =
        localStorage.getItem("ateex_auto_stats_enabled") === "true";
      const setupCompleted =
        localStorage.getItem("ateex_setup_completed") === "true";
      const startTime = localStorage.getItem("ateex_auto_stats_start_time");

      if (enabled && setupCompleted) {
        window.ateexGlobalState.autoStatsEnabled = true;
        window.ateexGlobalState.setupCompleted = true;
        window.ateexGlobalState.autoStatsStartTime = startTime
          ? parseInt(startTime)
          : Date.now();

        // Sync startTime with autoStatsStartTime
        window.ateexGlobalState.startTime =
          window.ateexGlobalState.autoStatsStartTime;

        logSuccess("📊 Auto Stats restored from previous session");
        return true;
      }

      return false;
    } catch (e) {
      logError("Error checking auto stats state: " + e.message);
      return false;
    }
  }

  // ============= BROWSER DATA MANAGEMENT =============

  async function clearGoogleCookies(shouldReload = false) {
    try {
      logWarning("Clearing Google storage to reset reCAPTCHA limits...");
      const googleCookieNames = [
        "NID",
        "1P_JAR",
        "CONSENT",
        "SOCS",
        "AEC",
        "DV",
        "__Secure-1PAPISID",
        "__Secure-1PSID",
        "__Secure-3PAPISID",
        "__Secure-3PSID",
        "APISID",
        "HSID",
        "SAPISID",
        "SID",
        "SIDCC",
        "SSID",
        "SEARCH_SAMESITE",
        "OTZ",
        "ANID",
        "IDE",
        "__Secure-ENID",
      ];

      googleCookieNames.forEach(cookieName => {
        const domains = [
          ".google.com",
          ".google.co.uk",
          ".google.ca",
          ".googleapis.com",
          ".gstatic.com",
          ".recaptcha.net",
          ".google-analytics.com",
        ];
        domains.forEach(domain => {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        });
      });

      // Clear storage
      try {
        Object.keys(localStorage).forEach(key => {
          if (
            key.includes("google") ||
            key.includes("recaptcha") ||
            key.includes("captcha") ||
            key.includes("gapi") ||
            key.includes("analytics")
          ) {
            localStorage.removeItem(key);
          }
        });

        Object.keys(sessionStorage).forEach(key => {
          if (
            key.includes("google") ||
            key.includes("recaptcha") ||
            key.includes("captcha") ||
            key.includes("gapi") ||
            key.includes("analytics")
          ) {
            sessionStorage.removeItem(key);
          }
        });
      } catch (e) {
        // Silent error
      }

      // Clear IndexedDB
      try {
        if (window.indexedDB && indexedDB.databases) {
          const databases = await indexedDB.databases();
          for (const db of databases) {
            if (
              db.name &&
              (db.name.includes("google") ||
                db.name.includes("recaptcha") ||
                db.name.includes("gapi") ||
                db.name.includes("analytics"))
            ) {
              indexedDB.deleteDatabase(db.name);
            }
          }
        }
      } catch (e) {
        // Silent error
      }

      // Clear caches
      try {
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          for (const cacheName of cacheNames) {
            if (
              cacheName.includes("google") ||
              cacheName.includes("recaptcha") ||
              cacheName.includes("gapi") ||
              cacheName.includes("analytics")
            ) {
              await caches.delete(cacheName);
            }
          }
        }
      } catch (e) {
        // Silent error
      }

      // Unregister service workers
      try {
        if ("serviceWorker" in navigator) {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            if (
              registration.scope.includes("google") ||
              registration.scope.includes("recaptcha")
            ) {
              await registration.unregister();
            }
          }
        }
      } catch (e) {
        // Silent error
      }

      logSuccess("Google storage cleared successfully");

      if (shouldReload) {
        setTimeout(() => {
          logInfo("Reloading page to reset reCAPTCHA state...");

          if (window.top !== window.self) {
            try {
              window.top.postMessage(
                {
                  type: "ateex_reload_required",
                  reason: "google_cookies_cleared",
                },
                "*"
              );
            } catch (e) {
              try {
                window.top.location.reload();
              } catch (e2) {
                window.location.reload();
              }
            }
          } else {
            window.location.reload();
          }
        }, 2000);
      }
    } catch (error) {
      logError("Error clearing Google cookies: " + error.message);
    }
  }

  // ============= BASIC ERROR HANDLING =============

  // Simple error page detection
  function detectErrorPage() {
    try {
      const pageText = document.body?.textContent?.toLowerCase() || "";
      const pageTitle = document.title.toLowerCase();

      // Basic error patterns
      const errorPatterns = [
        /502\s*bad\s*gateway/i,
        /500\s*internal\s*server\s*error/i,
        /503\s*service\s*unavailable/i,
        /504\s*gateway\s*timeout/i,
        /419\s*page\s*expired/i,
        /403\s*forbidden/i,
        /404\s*not\s*found/i,
        /server\s*error/i,
        /something.*went.*wrong/i,
        /maintenance\s*mode/i,
        /session\s*expired/i,
      ];

      return errorPatterns.some(
        pattern => pattern.test(pageText) || pattern.test(pageTitle)
      );
    } catch (e) {
      return false;
    }
  }

  // Handle error page with simple redirect
  function handleErrorPage() {
    if (window.top !== window.self) return; // Skip in iframes

    const currentUrl = window.location.href;
    const baseUrl = "https://dash.ateex.cloud/";

    if (currentUrl === baseUrl) return; // Already at base

    logWarning(`Error page detected: ${currentUrl}`);

    // Stop script activities
    window.scriptStopped = true;

    // Redirect after 3 seconds
    setTimeout(() => {
      logInfo("Redirecting to base URL from error page");
      window.location.href = baseUrl;
    }, 3000);
  }

  // Basic error detection check
  function initBasicErrorDetection() {
    // Check on load
    setTimeout(() => {
      if (detectErrorPage()) {
        handleErrorPage();
      }
    }, 2000);

    // Check periodically
    setInterval(() => {
      if (!window.scriptStopped && detectErrorPage()) {
        handleErrorPage();
      }
    }, 30000); // Every 30 seconds
  }

  // ============= MODULE INITIALIZATION =============

  async function initialize() {
    // Check auto stats state
    checkAutoStatsState();

    // Initialize basic error detection
    initBasicErrorDetection();

    // Setup message listeners
    if (window.top === window.self) {
      window.addEventListener("message", function (event) {
        if (event.data && event.data.type === "ateex_reload_required") {
          logInfo(`Received reload request: ${event.data.reason}`);
          setTimeout(() => {
            logInfo("Reloading main page as requested");
            window.location.reload();
          }, 1000);
        }
      });
    }

    logSuccess("[Core Module] Initialized");
  }

  // ============= EXPORTS =============

  exports.state = window.ateexGlobalState;
  exports.PERFORMANCE_MODE = PERFORMANCE_MODE;

  // Logging functions
  exports.log = log;
  exports.logInfo = logInfo;
  exports.logWarning = logWarning;
  exports.logError = logError;
  exports.logSuccess = logSuccess;
  exports.logDebug = logDebug;
  exports.logWithSpamControl = logWithSpamControl;

  // Utility functions
  exports.sleep = sleep;
  exports.qSelector = qSelector;
  exports.isHidden = isHidden;
  exports.generateId = generateId;
  exports.safeJsonParse = safeJsonParse;
  exports.safeJsonStringify = safeJsonStringify;
  exports.formatDuration = formatDuration;
  exports.deepClone = deepClone;
  exports.debounce = debounce;
  exports.throttle = throttle;

  // Runtime control
  exports.enableAutoStats = enableAutoStats;
  exports.disableAutoStats = disableAutoStats;
  exports.checkAutoStatsState = checkAutoStatsState;

  // Browser data management
  exports.clearGoogleCookies = clearGoogleCookies;

  // Error handling
  exports.detectErrorPage = detectErrorPage;
  exports.handleErrorPage = handleErrorPage;
  exports.initBasicErrorDetection = initBasicErrorDetection;

  // Module initialization
  exports.initialize = initialize;
})(exports);
