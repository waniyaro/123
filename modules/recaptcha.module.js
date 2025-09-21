/**
 * ReCAPTCHA Module - reCAPTCHA solver with AI integration
 * Handles reCAPTCHA solving, server management, and audio processing
 */

(function (exports) {
  "use strict";

  // Get dependencies with validation
  const core = AteexModules.core;
  const data = AteexModules.data;
  const proxy = AteexModules.proxy;

  // Validate dependencies before use
  if (!core) {
    throw new Error("Core module not loaded - missing dependency");
  }
  if (!data) {
    throw new Error("Data module not loaded - missing dependency");
  }
  if (!proxy) {
    throw new Error("Proxy module not loaded - missing dependency");
  }
  const {
    log,
    logInfo,
    logError,
    logSuccess,
    logWarning,
    logDebug,
    qSelector,
    isHidden,
  } = core;

  // ============= RECAPTCHA CONSTANTS =============

  // reCAPTCHA Selectors
  const CHECK_BOX = ".recaptcha-checkbox-border";
  const AUDIO_BUTTON = "#recaptcha-audio-button";
  const AUDIO_SOURCE = "#audio-source";
  const IMAGE_SELECT = "#rc-imageselect";
  const RESPONSE_FIELD = ".rc-audiochallenge-response-field";
  const AUDIO_ERROR_MESSAGE = ".rc-audiochallenge-error-message";
  const AUDIO_RESPONSE = "#audio-response";
  const RELOAD_BUTTON = "#recaptcha-reload-button";
  const RECAPTCHA_STATUS = "#recaptcha-accessible-status";
  const DOSCAPTCHA = ".rc-doscaptcha-body";
  const VERIFY_BUTTON = "#recaptcha-verify-button";
  const MAX_ATTEMPTS = 5;

  // Server Lists for reCAPTCHA Solving
  const serversList = [
    "https://engageub.pythonanywhere.com",
    "https://engageub1.pythonanywhere.com",
  ];

  let latencyList = Array(serversList.length).fill(10000);

  // ============= RECAPTCHA STATE =============

  let solved = false;
  let checkBoxClicked = false;
  let waitingForAudioResponse = false;
  let captchaInterval = null;
  let requestCount = 0;
  let recaptchaLanguage = "en-US";
  let recaptchaInitialStatus = "";
  let audioUrl = "";

  // Enhanced credentials state tracking for iframe
  let credentialsCheckAttempts = 0;
  let maxCredentialsAttempts = 10; // Reduced from infinite to prevent spam
  let lastCredentialsCheck = 0;
  let credentialsCheckInterval = 3000; // Check every 3 seconds instead of 2

  // ============= RECAPTCHA INITIALIZATION =============

  function initRecaptchaVars() {
    try {
      const htmlLang = qSelector("html");
      if (htmlLang) {
        recaptchaLanguage = htmlLang.getAttribute("lang") || "en-US";
      }

      const statusElement = qSelector(RECAPTCHA_STATUS);
      if (statusElement) {
        recaptchaInitialStatus = statusElement.innerText || "";
      }
    } catch (err) {
      logError("Error initializing recaptcha vars: " + err.message);
    }
  }

  // ============= ENHANCED CREDENTIALS CHECKING =============

  function checkCredentialsState() {
    // For iframe context, use enhanced fallback logic
    if (window.top !== window.self) {
      let credentialsReady = false;

      // Method 1: Check local state first
      if (core.state.credentialsReady) {
        credentialsReady = true;
      }

      // Method 2: Try to check parent with error handling
      if (!credentialsReady) {
        try {
          if (
            window.top.ateexGlobalState &&
            window.top.ateexGlobalState.credentialsReady
          ) {
            credentialsReady = true;
            core.state.credentialsReady = true;
          }
        } catch (e) {
          // Cross-origin access blocked - use message passing
        }
      }

      // Method 3: Check if enough attempts made, allow anyway
      if (
        !credentialsReady &&
        credentialsCheckAttempts >= maxCredentialsAttempts
      ) {
        core.logWithSpamControl(
          "Credentials check attempts exhausted, allowing reCAPTCHA to proceed",
          "WARNING",
          "credentials_fallback_allow"
        );
        credentialsReady = true;
        core.state.credentialsReady = true;
      }

      // Method 4: Time-based fallback (if stuck for >30 seconds, allow)
      if (!credentialsReady) {
        const timeSinceFirstCheck =
          Date.now() - (window.credentialsFirstCheck || Date.now());
        if (timeSinceFirstCheck > 30000) {
          core.logWithSpamControl(
            "Time-based fallback: allowing reCAPTCHA after 30s wait",
            "WARNING",
            "credentials_time_fallback"
          );
          credentialsReady = true;
          core.state.credentialsReady = true;
        }
      }

      // Method 5: Aggressive fallback - if stuck for >15 seconds, allow anyway
      if (!credentialsReady) {
        const timeSinceFirstCheck =
          Date.now() - (window.credentialsFirstCheck || Date.now());
        if (timeSinceFirstCheck > 15000) {
          core.logWithSpamControl(
            "Aggressive fallback: allowing reCAPTCHA after 15s wait to prevent infinite blocking",
            "WARNING",
            "credentials_aggressive_fallback"
          );
          credentialsReady = true;
          core.state.credentialsReady = true;
        }
      }

      return credentialsReady;
    } else {
      // Main window - check normally
      return core.state.credentialsReady;
    }
  }

  // Setup message listener for credentials state updates from parent
  function setupCredentialsMessageListener() {
    // Prevent duplicate listeners
    if (window.ateexCredentialsListenerSetup) {
      return;
    }
    window.ateexCredentialsListenerSetup = true;

    // Listen for credentials ready message from parent
    window.addEventListener("message", function (event) {
      if (event.data && event.data.type === "ateex_credentials_ready") {
        logInfo("📨 Received credentials ready message from parent");

        // Check if credentials are actually ready (handle both formats)
        const isReady =
          event.data.ready !== undefined ? event.data.ready : true;

        if (isReady) {
          core.state.credentialsReady = true;
          credentialsCheckAttempts = 0; // Reset attempts

          // If reCAPTCHA solver is waiting, restart it
          if (!core.state.captchaInProgress && !core.state.captchaSolved) {
            logInfo("🔄 Restarting reCAPTCHA solver after credentials ready");
            setTimeout(() => {
              initCaptchaSolver();
            }, 1000);
          }
        } else {
          logInfo("📨 Parent reports credentials not ready yet");
        }
      }
    });

    // Request credentials state from parent
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: "ateex_request_credentials_state",
            timestamp: Date.now(),
          },
          "*"
        );
        logInfo("📤 Requested credentials state from parent");
      }
    } catch (e) {
      // Ignore cross-origin errors
    }
  }

  // ============= SERVER MANAGEMENT =============

  // Get best server based on latency and stats with fallback
  function getBestServer(excludeServers = []) {
    try {
      const stats = data.getServerStats();
      let bestServer = null;
      let bestScore = -1;
      let availableServers = [];

      for (let i = 0; i < serversList.length; i++) {
        const server = serversList[i];
        const latency = latencyList[i];
        const serverStat = stats[server];

        // Skip excluded servers
        if (excludeServers.includes(server)) {
          continue;
        }

        // Skip servers with too many consecutive failures (but allow if no other options)
        if (serverStat && serverStat.failures >= 3) {
          // Don't skip completely, just lower priority
        }

        // Calculate score (lower latency = higher score, success rate bonus)
        let score = 10000 - latency; // Base score from latency

        if (serverStat && serverStat.totalRequests > 0) {
          const successRate =
            serverStat.successfulRequests / serverStat.totalRequests;
          score += successRate * 1000; // Bonus for success rate

          // Heavy penalty for recent failures
          if (serverStat.failures > 0) {
            score -= serverStat.failures * 1000;
          }

          // Extra penalty for servers with many failures
          if (serverStat.failures >= 3) {
            score -= 5000;
          }
        }

        availableServers.push({
          server,
          score,
          latency,
          failures: serverStat?.failures || 0,
        });

        if (score > bestScore) {
          bestScore = score;
          bestServer = server;
        }
      }

      // If no server found (all excluded), use fallback
      if (!bestServer && availableServers.length === 0) {
        logWarning("No available servers, using fallback to first server");
        return serversList[0];
      }

      // If best server has too many failures, try next best
      if (bestServer) {
        const bestServerStat = stats[bestServer];
        if (bestServerStat && bestServerStat.failures >= 5) {
          logWarning(
            `Best server ${bestServer} has too many failures (${bestServerStat.failures}), trying fallback`
          );

          // Sort by score and try next best
          availableServers.sort((a, b) => b.score - a.score);
          for (const serverInfo of availableServers) {
            if (serverInfo.server !== bestServer && serverInfo.failures < 5) {
              logInfo(`Fallback to server: ${serverInfo.server}`);
              return serverInfo.server;
            }
          }
        }
      }

      return bestServer || serversList[0];
    } catch (e) {
      logError("Error selecting best server: " + e.message);
      return serversList[0]; // Fallback to first server
    }
  }

  // ============= AUDIO PROCESSING =============

  async function getTextFromAudio(URL) {
    // Use enhanced server selection
    var url = getBestServer();

    requestCount = requestCount + 1;
    URL = URL.replace("recaptcha.net", "google.com");

    if (recaptchaLanguage.length < 1) {
      logWarning("Recaptcha Language is not recognized");
      recaptchaLanguage = "en-US";
    }

    logInfo(
      `🔄 Solving reCAPTCHA with audio using server: ${url} (with proxy)`
    );

    const requestStart = Date.now();

    try {
      // Try proxy request first, with fallback to direct
      let response;
      try {
        response = await proxy.makeProxyRequest({
          method: "POST",
          url: url,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          data:
            "input=" + encodeURIComponent(URL) + "&lang=" + recaptchaLanguage,
          timeout: 60000,
        });
      } catch (proxyError) {
        logWarning(
          `Proxy request failed, trying direct: ${proxyError.message}`
        );

        // Fallback to direct request
        response = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            data:
              "input=" + encodeURIComponent(URL) + "&lang=" + recaptchaLanguage,
            timeout: 60000,
            onload: resolve,
            onerror: reject,
            ontimeout: () => reject(new Error("Direct request timeout")),
          });
        });
      }

      const responseTime = Date.now() - requestStart;

      try {
        if (response && response.responseText) {
          var responseText = response.responseText;
          // Validate Response for error messages or html elements
          if (
            responseText == "0" ||
            responseText.includes("<") ||
            responseText.includes(">") ||
            responseText.length < 2 ||
            responseText.length > 50
          ) {
            // Invalid Response, Reload the captcha
            core.logWithSpamControl(
              "Invalid Response. Retrying..",
              "WARNING",
              "invalid_response"
            );
            data.updateServerStats(url, false, responseTime);
          } else if (
            qSelector(AUDIO_SOURCE) &&
            qSelector(AUDIO_SOURCE).src &&
            audioUrl == qSelector(AUDIO_SOURCE).src &&
            qSelector(AUDIO_RESPONSE) &&
            !qSelector(AUDIO_RESPONSE).value &&
            qSelector(AUDIO_BUTTON).style.display == "none" &&
            qSelector(VERIFY_BUTTON)
          ) {
            qSelector(AUDIO_RESPONSE).value = responseText;
            qSelector(VERIFY_BUTTON).click();
            logSuccess("✅ reCAPTCHA solved successfully with proxy!");
            data.updateServerStats(url, true, responseTime);
          } else {
            core.logWithSpamControl(
              "Could not locate text input box",
              "WARNING",
              "input_box_error"
            );
            data.updateServerStats(url, false, responseTime);
          }
          waitingForAudioResponse = false;
        }
      } catch (err) {
        logError("Exception handling response. Retrying..: " + err.message);
        data.updateServerStats(url, false, responseTime);
        waitingForAudioResponse = false;
      }
    } catch (error) {
      const responseTime = Date.now() - requestStart;

      // Better error formatting
      const errorMsg =
        error && error.message
          ? error.message
          : error && error.toString
          ? error.toString()
          : typeof error === "string"
          ? error
          : "Unknown error";

      logError(
        `❌ reCAPTCHA solver error from ${url} (with proxy): ${errorMsg}`
      );
      data.updateServerStats(url, false, responseTime);
      waitingForAudioResponse = false;
    }
  }

  // ============= SERVER PING TESTING =============

  async function pingTest(url) {
    var start = new Date().getTime();

    try {
      // Try proxy request first, with fallback to direct
      let response;
      try {
        response = await proxy.makeProxyRequest({
          method: "GET",
          url: url,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          data: "",
          timeout: 8000,
        });
      } catch (proxyError) {
        logWarning(
          `Ping test proxy failed, trying direct: ${proxyError.message}`
        );

        // Fallback to direct request
        response = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            data: "",
            timeout: 8000,
            onload: resolve,
            onerror: reject,
            ontimeout: () => reject(new Error("Direct ping timeout")),
          });
        });
      }

      var end = new Date().getTime();
      var milliseconds = end - start;

      if (response && response.responseText && response.responseText == "0") {
        // Update latency list
        for (let i = 0; i < serversList.length; i++) {
          if (url == serversList[i]) {
            latencyList[i] = milliseconds;
          }
        }

        // Update server stats
        data.updateServerStats(url, true, milliseconds);
        logSuccess(`🌐 Ping success: ${url} (${milliseconds}ms) with proxy`);
      } else {
        core.logWithSpamControl(
          `Server ${url} ping failed: invalid response`,
          "WARNING",
          "ping_failed"
        );
        data.updateServerStats(url, false, milliseconds);
      }

      // Save latency cache after all pings complete
      data.saveServerLatency(latencyList);
    } catch (error) {
      var end = new Date().getTime();
      var milliseconds = end - start;

      // Better error formatting
      const errorMsg =
        error && error.message
          ? error.message
          : error && error.toString
          ? error.toString()
          : typeof error === "string"
          ? error
          : "Unknown error";

      logError(`❌ Ping test error for ${url} (with proxy): ${errorMsg}`);
      data.updateServerStats(url, false, milliseconds);
    }
  }

  // ============= AUTOMATED QUERIES HANDLING =============

  async function handleAutomatedQueriesWithProxy() {
    try {
      logInfo("🔄 Handling automated queries with enhanced proxy strategy...");

      // Auto-enable proxy if not already enabled
      const wasProxyEnabled = proxy.isProxyEnabled();
      if (!wasProxyEnabled) {
        logInfo(
          "🌐 Auto-enabling proxy system for automated queries recovery..."
        );
        proxy.enableProxyForAutomatedQueries();
      }

      // Check if proxy is enabled (after potential auto-enable)
      if (proxy.isProxyEnabled()) {
        logInfo("🌐 Proxy enabled - implementing proxy rotation strategy");

        // Get current proxy stats to identify problematic proxy
        const proxyStats = proxy.getProxyStatsSummary();
        const recentlyUsedProxy = proxyStats.proxies
          .filter(p => p.lastUsed > 0)
          .sort((a, b) => b.lastUsed - a.lastUsed)[0];

        if (recentlyUsedProxy) {
          logWarning(`🔴 Marking proxy as blocked: ${recentlyUsedProxy.proxy}`);

          // Mark proxy as blocked by Google automated queries detection
          proxy.markProxyAsBlocked(recentlyUsedProxy.proxy);

          logInfo("📊 Proxy marked as blocked - will have lowest priority");
        }

        // Test if we have other working proxies
        const workingProxies = proxyStats.proxies.filter(
          p => p.failures < 3 && p.proxy !== recentlyUsedProxy?.proxy
        );

        if (workingProxies.length > 0) {
          logSuccess(`✅ Found ${workingProxies.length} alternative proxies`);

          // Clear Google cookies but don't reload immediately
          await core.clearGoogleCookies(false);

          // Wait a bit for cookies to clear
          await core.sleep(2000);

          logInfo("🔄 Reloading with proxy rotation...");
          setTimeout(() => {
            window.location.reload();
          }, 1000);

          return;
        } else {
          logWarning(
            "⚠️ No working proxies available, trying fallback strategies"
          );

          // Try to test all proxies to refresh stats
          logInfo("🧪 Testing all proxies to find working ones...");
          const testResult = await proxy.testAllProxies();

          if (testResult && testResult.passed > 0) {
            logSuccess(
              `✅ Found ${testResult.passed} working proxies after testing`
            );

            // Clear Google cookies and reload
            await core.clearGoogleCookies(false);
            await core.sleep(2000);

            logInfo("🔄 Reloading with fresh proxy data...");
            setTimeout(() => {
              window.location.reload();
            }, 1000);

            return;
          } else {
            logWarning(
              "❌ No proxies working, falling back to direct connection"
            );

            // Temporarily disable proxy and clear cookies
            proxy.setProxyEnabled(false);
            await core.clearGoogleCookies(false);

            logInfo(
              "🚫 Disabled proxy temporarily - will re-enable after cooldown"
            );

            // Re-enable proxy after cooldown period
            setTimeout(() => {
              proxy.setProxyEnabled(true);
              logInfo("🌐 Re-enabled proxy after cooldown");
            }, 5 * 60 * 1000); // 5 minutes cooldown

            // Reload without proxy
            setTimeout(() => {
              window.location.reload();
            }, 2000);

            return;
          }
        }
      } else {
        logInfo("🚫 Proxy disabled - using standard recovery method");
      }

      // Fallback to original behavior if proxy not available
      logInfo("🔄 Using standard automated queries recovery...");

      // Clear Google cookies and reload to reset limits
      await core.clearGoogleCookies(true);
    } catch (error) {
      logError("❌ Error in automated queries handler: " + error.message);

      // Ultimate fallback - just clear and reload
      logWarning("🆘 Using emergency fallback recovery");
      await core.clearGoogleCookies(true);
    }
  }

  // ============= MAIN CAPTCHA SOLVER =============

  function initCaptchaSolver() {
    // Setup message listener first (for iframe communication)
    setupCredentialsMessageListener();

    // Enhanced credentials check with fallback mechanisms
    const now = Date.now();

    // Set first check time for time-based fallback
    if (!window.credentialsFirstCheck) {
      window.credentialsFirstCheck = now;
    }

    // Rate limit credential checks to reduce spam
    if (now - lastCredentialsCheck < credentialsCheckInterval) {
      return; // Skip this check, too soon
    }

    lastCredentialsCheck = now;
    credentialsCheckAttempts++;

    const credentialsReady = checkCredentialsState();

    if (!credentialsReady) {
      // Only log occasionally to prevent spam
      if (credentialsCheckAttempts <= 3 || credentialsCheckAttempts % 5 === 0) {
        core.logWithSpamControl(
          `reCAPTCHA waiting for credentials (attempt ${credentialsCheckAttempts}/${maxCredentialsAttempts})`,
          "WARNING",
          "recaptcha_credentials_wait"
        );
      }

      // Set up periodic check for credentials if iframe cannot communicate
      if (credentialsCheckAttempts === 3 && window.top !== window.self) {
        logInfo("🔄 Setting up periodic credentials check for iframe...");

        const periodicCheck = setInterval(() => {
          try {
            // Try to check parent state directly
            if (
              window.top.ateexGlobalState &&
              window.top.ateexGlobalState.credentialsReady
            ) {
              logInfo("📊 Periodic check found credentials ready in parent");
              core.state.credentialsReady = true;
              credentialsCheckAttempts = 0;
              clearInterval(periodicCheck);

              // Restart solver
              setTimeout(() => {
                initCaptchaSolver();
              }, 500);
            }
          } catch (e) {
            // Cross-origin access blocked, continue waiting
          }
        }, 5000); // Check every 5 seconds

        // Clear interval after 60 seconds max
        setTimeout(() => {
          if (periodicCheck) {
            clearInterval(periodicCheck);
          }
        }, 60000);
      }

      // Wait and retry with exponential backoff (max 5 seconds)
      const waitTime = Math.min(
        credentialsCheckInterval + credentialsCheckAttempts * 500,
        5000
      );
      setTimeout(() => {
        initCaptchaSolver();
      }, waitTime);
      return;
    }

    // Reset attempts counter on success
    credentialsCheckAttempts = 0;

    // Check if captcha already solved
    if (core.state.captchaSolved) {
      return;
    }

    // Check cooldown period after automated queries
    if (core.state.lastAutomatedQueriesTime) {
      const timeSinceLastError =
        Date.now() - core.state.lastAutomatedQueriesTime;
      const cooldownPeriod = 60000; // 60 seconds cooldown

      if (timeSinceLastError < cooldownPeriod) {
        const remainingTime = Math.ceil(
          (cooldownPeriod - timeSinceLastError) / 1000
        );
        core.logWithSpamControl(
          `Cooldown active, waiting ${remainingTime}s before retry`,
          "WARNING",
          "captcha_cooldown"
        );

        setTimeout(() => {
          initCaptchaSolver();
        }, 5000); // Check again after 5 seconds
        return;
      }
    }

    // Check if solver already running
    if (core.state.captchaInProgress && captchaInterval) {
      core.logWithSpamControl(
        "reCAPTCHA solver already in progress, skipping",
        "INFO",
        "solver_in_progress"
      );
      return;
    }

    // Initialize variables safely
    initRecaptchaVars();

    // Load cached server latency
    const cachedLatency = data.loadServerLatency();
    if (cachedLatency && cachedLatency.length === serversList.length) {
      latencyList = cachedLatency;
      logInfo("Using cached server latency data");
    }

    // Mark as in progress
    core.state.captchaInProgress = true;

    // Enhanced checkbox clicking with multiple attempts
    if (qSelector(CHECK_BOX)) {
      logInfo("🎯 Found reCAPTCHA checkbox, attempting to click...");
      try {
        const checkbox = qSelector(CHECK_BOX);

        // Try multiple click methods for better reliability
        checkbox.click();

        // Also try clicking the parent container
        const checkboxContainer = checkbox.closest(".recaptcha-checkbox");
        if (checkboxContainer) {
          checkboxContainer.click();
        }

        // Dispatch mouse events for better compatibility
        checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        checkbox.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

        logSuccess("✅ reCAPTCHA checkbox clicked successfully");
      } catch (e) {
        logWarning("Failed to click checkbox: " + e.message);
      }
    } else if (window.location.href.includes("bframe")) {
      // Only ping if we don't have cached data or it's expired
      if (!cachedLatency) {
        logInfo("Pinging servers to determine best latency...");
        for (let i = 0; i < serversList.length; i++) {
          pingTest(serversList[i]);
        }
      }
    }

    // Clear old interval if exists
    if (captchaInterval) {
      clearInterval(captchaInterval);
    }

    // Solve the captcha using audio
    captchaInterval = setInterval(async function () {
      try {
        if (
          !checkBoxClicked &&
          qSelector(CHECK_BOX) &&
          !isHidden(qSelector(CHECK_BOX))
        ) {
          qSelector(CHECK_BOX).click();
          checkBoxClicked = true;
        }

        // Check if the captcha is solved
        if (
          qSelector(RECAPTCHA_STATUS) &&
          qSelector(RECAPTCHA_STATUS).innerText != recaptchaInitialStatus
        ) {
          solved = true;
          logSuccess("reCAPTCHA SOLVED successfully!");
          clearInterval(captchaInterval);

          // Update global state
          core.state.captchaSolved = true;
          core.state.captchaInProgress = false;
          core.state.lastSolvedTime = Date.now();

          // Notify parent window if in iframe (enhanced messaging)
          try {
            const message = {
              type: "ateex_captcha_solved",
              solved: true,
              timestamp: Date.now(),
            };

            // Send to parent window
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(message, "*");
              logInfo("📤 Sent captcha solved message to parent window");
            }

            // Also send to top window (in case of nested iframes)
            if (window.top && window.top !== window) {
              window.top.postMessage(message, "*");
              logInfo("📤 Sent captcha solved message to top window");
            }

            // Send to all frames
            const frames = document.querySelectorAll("iframe");
            frames.forEach(frame => {
              try {
                frame.contentWindow.postMessage(message, "*");
              } catch (e) {
                // Ignore cross-origin errors
              }
            });
          } catch (e) {
            logWarning("Error sending captcha solved message: " + e.message);
          }

          // Trigger custom event to notify login page
          try {
            // Trigger on current window (safe)
            window.dispatchEvent(
              new CustomEvent("recaptchaSolved", {
                detail: { solved: true, timestamp: Date.now() },
              })
            );

            // For cross-origin iframes, only use postMessage (safer)
            if (window.parent && window.parent !== window) {
              try {
                // Always use postMessage for cross-origin safety
                window.parent.postMessage(
                  {
                    type: "ateex_captcha_solved",
                    solved: true,
                    timestamp: Date.now(),
                  },
                  "*"
                );
                logInfo(
                  "📤 Sent cross-origin captcha solved message to parent"
                );
              } catch (postMessageError) {
                logWarning(
                  "Could not send message to parent: " +
                    postMessageError.message
                );
              }
            }

            // Also send to top window if different from parent
            if (
              window.top &&
              window.top !== window &&
              window.top !== window.parent
            ) {
              try {
                window.top.postMessage(
                  {
                    type: "ateex_captcha_solved",
                    solved: true,
                    timestamp: Date.now(),
                  },
                  "*"
                );
                logInfo(
                  "📤 Sent cross-origin captcha solved message to top window"
                );
              } catch (topMessageError) {
                logWarning(
                  "Could not send message to top window: " +
                    topMessageError.message
                );
              }
            }

            logInfo("📡 Triggered custom recaptchaSolved events safely");
          } catch (e) {
            core.logWithSpamControl(
              "Error triggering custom events: " + e.message,
              "WARNING",
              "custom_event_error"
            );
          }
        }

        if (requestCount > MAX_ATTEMPTS) {
          logWarning("Attempted Max Retries. Stopping the solver");
          solved = true;
          core.state.captchaInProgress = false;
          clearInterval(captchaInterval);
        }

        if (!solved) {
          if (
            qSelector(AUDIO_BUTTON) &&
            !isHidden(qSelector(AUDIO_BUTTON)) &&
            qSelector(IMAGE_SELECT)
          ) {
            qSelector(AUDIO_BUTTON).click();
          }

          if (
            (!waitingForAudioResponse &&
              qSelector(AUDIO_SOURCE) &&
              qSelector(AUDIO_SOURCE).src &&
              qSelector(AUDIO_SOURCE).src.length > 0 &&
              audioUrl == qSelector(AUDIO_SOURCE).src &&
              qSelector(RELOAD_BUTTON)) ||
            (qSelector(AUDIO_ERROR_MESSAGE) &&
              qSelector(AUDIO_ERROR_MESSAGE).innerText.length > 0 &&
              qSelector(RELOAD_BUTTON) &&
              !qSelector(RELOAD_BUTTON).disabled)
          ) {
            qSelector(RELOAD_BUTTON).click();
          } else if (
            !waitingForAudioResponse &&
            qSelector(RESPONSE_FIELD) &&
            !isHidden(qSelector(RESPONSE_FIELD)) &&
            !qSelector(AUDIO_RESPONSE).value &&
            qSelector(AUDIO_SOURCE) &&
            qSelector(AUDIO_SOURCE).src &&
            qSelector(AUDIO_SOURCE).src.length > 0 &&
            audioUrl != qSelector(AUDIO_SOURCE).src &&
            requestCount <= MAX_ATTEMPTS
          ) {
            waitingForAudioResponse = true;
            audioUrl = qSelector(AUDIO_SOURCE).src;
            getTextFromAudio(audioUrl);
          } else {
            // Waiting
          }
        }

        // Stop solving when Automated queries message is shown
        if (
          qSelector(DOSCAPTCHA) &&
          qSelector(DOSCAPTCHA).innerText.length > 0
        ) {
          logWarning(
            "🚫 Automated Queries Detected - implementing enhanced recovery with proxy rotation"
          );

          core.state.captchaInProgress = false;
          clearInterval(captchaInterval);

          // Set cooldown period
          core.state.lastAutomatedQueriesTime = Date.now();

          // Enhanced recovery strategy with proxy integration
          await handleAutomatedQueriesWithProxy();
        }
      } catch (err) {
        logError(
          "An error occurred while solving. Stopping the solver: " + err.message
        );
        core.state.captchaInProgress = false;
        clearInterval(captchaInterval);
      }
    }, 5000); // Keep original 5-second interval
  }

  // ============= EXPORTS =============

  exports.initCaptchaSolver = initCaptchaSolver;
  exports.getBestServer = getBestServer;
  exports.getTextFromAudio = getTextFromAudio;
  exports.pingTest = pingTest;
  exports.initRecaptchaVars = initRecaptchaVars;
  exports.handleAutomatedQueriesWithProxy = handleAutomatedQueriesWithProxy;
  exports.checkCredentialsState = checkCredentialsState;
  exports.setupCredentialsMessageListener = setupCredentialsMessageListener;
  exports.serversList = serversList;
  exports.latencyList = latencyList;
})(exports);
