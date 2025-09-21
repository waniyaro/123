/**
 * Data Module - Statistics, Storage, and Data Management
 * Handles all data persistence, stats tracking, and export/import functionality
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

  // ============= ENHANCED STATS SYSTEM =============
  const TARGET_COINS_KEY = "ateex_target_coins";
  const STATS_HISTORY_KEY = "ateex_stats_history";
  const SERVER_STATS_KEY = "ateex_server_stats";
  const SERVER_LATENCY_KEY = "ateex_server_latency";
  const DEFAULT_TARGET_COINS = 1000;
  const LATENCY_CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

  // ============= TARGET COINS MANAGEMENT =============

  // Get target coins with backup recovery
  function getTargetCoins() {
    try {
      const saved = localStorage.getItem(TARGET_COINS_KEY);
      if (saved) {
        const target = parseInt(saved);
        if (target && target > 0) {
          return target;
        }
      }

      // Try backup if main failed
      const backup = localStorage.getItem(TARGET_COINS_KEY + "_backup");
      if (backup) {
        const backupTarget = parseInt(backup);
        if (backupTarget && backupTarget > 0) {
          logWarning(`Using backup target coins: ${backupTarget}`);
          // Restore main from backup
          localStorage.setItem(TARGET_COINS_KEY, backup);
          return backupTarget;
        }
      }

      return DEFAULT_TARGET_COINS;
    } catch (e) {
      logError("Error loading target coins: " + e.message);
      return DEFAULT_TARGET_COINS;
    }
  }

  // Set target coins with sync verification
  function setTargetCoins(target) {
    try {
      localStorage.setItem(TARGET_COINS_KEY, target.toString());

      // Verify the save was successful
      const verified = localStorage.getItem(TARGET_COINS_KEY);
      if (verified && parseInt(verified) === target) {
        // Also save to backup location for extra safety
        try {
          localStorage.setItem(TARGET_COINS_KEY + "_backup", target.toString());
        } catch (e) {
          // Ignore backup errors
        }

        return true;
      } else {
        logError(
          `Target coins save verification failed: expected ${target}, got ${verified}`
        );
        return false;
      }
    } catch (e) {
      logError("Error saving target coins: " + e.message);
      return false;
    }
  }

  // ============= STATS HISTORY MANAGEMENT =============

  // Save stats to history
  function saveStatsToHistory() {
    try {
      const state = core.state;
      const now = Date.now();
      // Use auto stats start time for accurate runtime calculation
      const runtimeStartTime = state.autoStatsStartTime || state.startTime;
      const runtime = state.autoStatsEnabled ? now - runtimeStartTime : 0;

      const statsEntry = {
        timestamp: now,
        totalCycles: state.totalCycles,
        totalCoins: state.totalCoins,
        runtime: runtime,
        avgCycleTime: state.totalCycles > 0 ? runtime / state.totalCycles : 0,
        coinsPerHour:
          runtime > 0 ? Math.round((state.totalCoins * 3600000) / runtime) : 0,
        targetCoins: getTargetCoins(),
      };

      let history = [];
      const saved = localStorage.getItem(STATS_HISTORY_KEY);
      if (saved) {
        history = JSON.parse(saved);
      }

      history.push(statsEntry);

      // Keep only last 20 entries to reduce overhead
      if (history.length > 20) {
        history = history.slice(-20);
      }

      localStorage.setItem(STATS_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      logError("Error saving stats to history: " + e.message);
    }
  }

  // Get stats history
  function getStatsHistory() {
    try {
      const saved = localStorage.getItem(STATS_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      logError("Error loading stats history: " + e.message);
      return [];
    }
  }

  // ============= SAVED STATS MANAGEMENT =============

  function loadSavedStats() {
    try {
      const saved = localStorage.getItem("ateex_stats");
      if (saved) {
        const stats = JSON.parse(saved);
        core.state.totalCycles = stats.totalCycles || 0;
        core.state.totalCoins = stats.totalCoins || 0;
        core.state.startTime = stats.startTime || Date.now();

        logSuccess(
          `📊 Loaded saved stats: ${stats.totalCycles} cycles, ${stats.totalCoins} coins`
        );
        return true;
      } else {
        // Initialize with current time
        core.state.startTime = Date.now();
        return false;
      }
    } catch (e) {
      logError("Could not load saved stats: " + e.message);
      // Initialize with defaults on error
      core.state.totalCycles = 0;
      core.state.totalCoins = 0;
      core.state.startTime = Date.now();
      return false;
    }
  }

  function incrementCycle() {
    if (window.top !== window.self) return;

    core.state.totalCycles++;
    core.state.totalCoins += 15;
    core.state.lastCycleTime = Date.now();

    logSuccess(
      `Cycle ${core.state.totalCycles} completed! Total coins: ${core.state.totalCoins}`
    );

    // Save to enhanced stats history (every 20 cycles)
    if (core.state.totalCycles % 20 === 0) {
      saveStatsToHistory();
    }

    // Check if target reached
    const targetCoins = getTargetCoins();
    if (core.state.totalCoins >= targetCoins) {
      logSuccess(`🎉 Target of ${targetCoins} coins reached!`);
      saveStatsToHistory(); // Save final stats
    }

    try {
      localStorage.setItem(
        "ateex_stats",
        JSON.stringify({
          totalCycles: core.state.totalCycles,
          totalCoins: core.state.totalCoins,
          startTime: core.state.startTime,
        })
      );
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  // ============= SERVER MANAGEMENT =============

  // Load server latency from cache
  function loadServerLatency() {
    try {
      const saved = localStorage.getItem(SERVER_LATENCY_KEY);
      if (!saved) return null;

      const data = JSON.parse(saved);
      const now = Date.now();

      // Check if cache is expired
      if (now - data.timestamp > LATENCY_CACHE_EXPIRY) {
        logInfo("Server latency cache expired, will re-test");
        localStorage.removeItem(SERVER_LATENCY_KEY);
        return null;
      }

      logInfo("Loaded cached server latency data");
      return data.latencies;
    } catch (e) {
      logError("Error loading server latency: " + e.message);
      return null;
    }
  }

  // Save server latency to cache
  function saveServerLatency(latencies) {
    try {
      const data = {
        timestamp: Date.now(),
        latencies: latencies,
      };
      localStorage.setItem(SERVER_LATENCY_KEY, JSON.stringify(data));
    } catch (e) {
      logError("Error saving server latency: " + e.message);
    }
  }

  // Get server statistics
  function getServerStats() {
    try {
      const saved = localStorage.getItem(SERVER_STATS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      logError("Error loading server stats: " + e.message);
      return {};
    }
  }

  // Update server statistics
  function updateServerStats(serverUrl, success, responseTime) {
    try {
      const stats = getServerStats();

      if (!stats[serverUrl]) {
        stats[serverUrl] = {
          totalRequests: 0,
          successfulRequests: 0,
          totalResponseTime: 0,
          lastUsed: 0,
          failures: 0,
        };
      }

      const serverStat = stats[serverUrl];
      serverStat.totalRequests++;
      serverStat.lastUsed = Date.now();

      if (success) {
        serverStat.successfulRequests++;
        serverStat.totalResponseTime += responseTime;
        serverStat.failures = 0; // Reset failure count on success
      } else {
        serverStat.failures++;
      }

      // Throttled save to reduce localStorage overhead
      clearTimeout(window.serverStatsTimeout);
      window.serverStatsTimeout = setTimeout(() => {
        localStorage.setItem(SERVER_STATS_KEY, JSON.stringify(stats));
      }, 1000);

      // Log stats occasionally only for debug purposes - removed to reduce spam
    } catch (e) {
      logError("Error updating server stats: " + e.message);
    }
  }

  // Reset server failure count
  function resetServerFailures() {
    try {
      const stats = getServerStats();
      let resetCount = 0;

      for (const serverUrl in stats) {
        if (stats[serverUrl].failures > 0) {
          stats[serverUrl].failures = 0;
          resetCount++;
        }
      }

      if (resetCount > 0) {
        localStorage.setItem(SERVER_STATS_KEY, JSON.stringify(stats));
        logInfo(`Reset failure count for ${resetCount} servers`);
      }
    } catch (e) {
      logError("Error resetting server failures: " + e.message);
    }
  }

  // ============= BROWSER DATA MANAGEMENT =============

  async function clearBrowserData() {
    // Preserve important data that should survive browser data clearing
    const dataToPreserve = {
      // Stats data
      ateex_stats: localStorage.getItem("ateex_stats"),

      // Credentials (only if not expired)
      ateex_secure_creds: localStorage.getItem("ateex_secure_creds"),
      ateex_creds_expiry: localStorage.getItem("ateex_creds_expiry"),

      // Target coins with backup
      ateex_target_coins: localStorage.getItem(TARGET_COINS_KEY),
      ateex_target_coins_backup: localStorage.getItem(
        TARGET_COINS_KEY + "_backup"
      ),
      ateex_stats_history: localStorage.getItem(STATS_HISTORY_KEY),

      // Server management data
      ateex_server_latency: localStorage.getItem(SERVER_LATENCY_KEY),
      ateex_server_stats: localStorage.getItem(SERVER_STATS_KEY),

      // Runtime state
      ateex_auto_stats_enabled: localStorage.getItem(
        "ateex_auto_stats_enabled"
      ),
      ateex_setup_completed: localStorage.getItem("ateex_setup_completed"),
      ateex_auto_stats_start_time: localStorage.getItem(
        "ateex_auto_stats_start_time"
      ),
    };

    // Check if credentials are still valid before preserving them
    const expiryTime = dataToPreserve.ateex_creds_expiry;
    if (expiryTime && Date.now() > parseInt(expiryTime)) {
      logInfo("Credentials expired during clear, not preserving them");
      dataToPreserve.ateex_secure_creds = null;
      dataToPreserve.ateex_creds_expiry = null;
    } else if (
      dataToPreserve.ateex_secure_creds &&
      dataToPreserve.ateex_creds_expiry
    ) {
      logInfo("Preserving valid credentials during browser data clear");
    }

    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();

    // Restore preserved data
    Object.entries(dataToPreserve).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        localStorage.setItem(key, value);
      }
    });

    // If credentials were preserved, mark them as ready for immediate use
    if (
      dataToPreserve.ateex_secure_creds &&
      dataToPreserve.ateex_creds_expiry
    ) {
      core.state.credentialsReady = true;
      logInfo("Credentials preserved and marked as ready for next cycle");
    }

    document.cookie.split(";").forEach(c => {
      const name = c.split("=")[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });

    if (window.indexedDB && indexedDB.databases) {
      indexedDB.databases().then(dbs => {
        for (const db of dbs) {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }
      });
    }

    await core.clearGoogleCookies(false);

    // Log summary of what was preserved
    const preservedItems = Object.entries(dataToPreserve).filter(
      ([_, value]) => value !== null && value !== undefined
    );

    // Special logging for target coins to track sync issues
    const targetPreserved = dataToPreserve.ateex_target_coins;
    const targetBackupPreserved = dataToPreserve.ateex_target_coins_backup;
    if (targetPreserved) {
      logSuccess(
        `Target coins preserved: ${targetPreserved} (backup: ${
          targetBackupPreserved || "none"
        })`
      );
    } else {
      logWarning("Target coins NOT preserved - may reset to default");
    }

    if (preservedItems.length > 0) {
      logInfo(
        `Browser data cleared, preserved ${preservedItems.length} important items`
      );
    } else {
      logWarning("Browser data cleared, no items preserved");
    }
  }

  // ============= DATA SYNCHRONIZATION =============

  // Sync all data systems to ensure consistency
  function syncAllData() {
    try {
      // Verify target coins consistency
      const currentTarget = getTargetCoins();
      const backupTarget = localStorage.getItem(TARGET_COINS_KEY + "_backup");

      if (!backupTarget || parseInt(backupTarget) !== currentTarget) {
        localStorage.setItem(
          TARGET_COINS_KEY + "_backup",
          currentTarget.toString()
        );
        logDebug(`Target backup synced: ${currentTarget}`);
      }

      // Save current stats to ensure they're preserved
      try {
        localStorage.setItem(
          "ateex_stats",
          JSON.stringify({
            totalCycles: core.state.totalCycles,
            totalCoins: core.state.totalCoins,
            startTime: core.state.startTime,
            lastSync: Date.now(),
          })
        );
      } catch (e) {
        logError("Error syncing stats: " + e.message);
      }

      logDebug("Data sync completed successfully");
      return true;
    } catch (e) {
      logError("Error during data sync: " + e.message);
      return false;
    }
  }

  // Auto-sync every 5 minutes to prevent data loss
  setInterval(syncAllData, 5 * 60 * 1000);

  // ============= EXPORTS =============

  exports.getTargetCoins = getTargetCoins;
  exports.setTargetCoins = setTargetCoins;
  exports.saveStatsToHistory = saveStatsToHistory;
  exports.getStatsHistory = getStatsHistory;
  exports.loadSavedStats = loadSavedStats;
  exports.incrementCycle = incrementCycle;
  exports.loadServerLatency = loadServerLatency;
  exports.saveServerLatency = saveServerLatency;
  exports.getServerStats = getServerStats;
  exports.updateServerStats = updateServerStats;
  exports.resetServerFailures = resetServerFailures;
  exports.clearBrowserData = clearBrowserData;
  exports.syncAllData = syncAllData;
})(exports);
