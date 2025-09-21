/**
 * Workflow Module - Auto-earning workflow logic
 * Handles page-specific logic for login, home, earn pages and overall workflow
 */

(function (exports) {
  "use strict";

  // Get dependencies with validation
  const core = AteexModules.core;
  const credentials = AteexModules.credentials;
  const data = AteexModules.data;
  const ui = AteexModules.ui;
  const recaptcha = AteexModules.recaptcha;
  const proxy = AteexModules.proxy;

  // Validate dependencies before destructuring
  if (!core) {
    throw new Error("Core module not loaded - missing dependency");
  }
  if (!credentials) {
    throw new Error("Credentials module not loaded - missing dependency");
  }
  if (!data) {
    throw new Error("Data module not loaded - missing dependency");
  }
  if (!ui) {
    throw new Error("UI module not loaded - missing dependency");
  }
  if (!recaptcha) {
    throw new Error("Recaptcha module not loaded - missing dependency");
  }
  if (!proxy) {
    throw new Error("Proxy module not loaded - missing dependency");
  }

  const { log, logInfo, logError, logSuccess, logWarning, qSelector, sleep } =
    core;

  // ============= WORKFLOW STATE =============

  let CONFIG = null;

  // ============= PAGE HANDLERS =============

  // Handle earn page
  async function handleEarnPage() {
    // Check if script should be stopped
    if (window.scriptStopped) {
      logInfo("🛑 Earn page handler stopped - script stopped");
      return;
    }

    // Check if auto stats is enabled
    if (!core.state.autoStatsEnabled) {
      core.logWithSpamControl(
        "⏳ Earn page waiting - auto stats not enabled",
        "WARNING",
        "earn_page_waiting"
      );
      return;
    }

    logInfo("📈 On earn page");

    try {
      // Wait 5 seconds
      await sleep(5000);

      // Find Clickcoin row accurately according to HTML structure
      const clickcoinRow = Array.from(document.querySelectorAll("tr")).find(
        row => {
          const tdElements = row.querySelectorAll("td");
          return (
            tdElements.length > 0 &&
            tdElements[0].textContent.trim() === "Clickcoin"
          );
        }
      );

      if (clickcoinRow) {
        // Find Start link in Clickcoin row
        const startLink = clickcoinRow.querySelector(
          'a[href*="/earn/clickcoin"]'
        );
        if (startLink) {
          logSuccess("Found Clickcoin Start link, clicking...");

          // Ensure link opens in new tab
          startLink.setAttribute("target", "_blank");
          startLink.setAttribute("rel", "noopener noreferrer");

          // Click link
          startLink.click();

          // Wait 7 seconds for popup ads to load and complete
          await sleep(7000);

          // Increment cycle counter
          data.incrementCycle();

          // Perform logout
          ui.logout();

          // Wait for logout to complete before clearing data
          await sleep(2000);

          // Clear browser data
          await data.clearBrowserData();
        } else {
          // Fallback: find button in row
          const startButton = clickcoinRow.querySelector("button");
          if (startButton) {
            logSuccess("Found Clickcoin Start button, clicking...");
            startButton.click();
            await sleep(7000); // Wait 7 seconds for popup and ads
            data.incrementCycle();
            ui.logout();
            await sleep(2000);
            await data.clearBrowserData();
          } else {
            logWarning("No Start button found in Clickcoin row");
          }
        }
      } else {
        logWarning("Clickcoin row not found");
        // Debug: log all rows
        const allRows = document.querySelectorAll("tr");
        logError(`Found ${allRows.length} rows in table, but no Clickcoin row`);
      }
    } catch (error) {
      logError("Error in handleEarnPage: " + error.message);
    }
  }

  // Handle login page
  async function handleLoginPage() {
    // Check if script should be stopped
    if (window.scriptStopped) {
      logInfo("🛑 Login page handler stopped - script stopped");
      return;
    }

    // Check if auto stats is enabled
    if (!core.state.autoStatsEnabled) {
      core.logWithSpamControl(
        "⏳ Login page waiting - auto stats not enabled",
        "WARNING",
        "login_page_waiting"
      );
      return;
    }

    logInfo("🔑 On login page");

    try {
      // Prevent duplicate message listeners
      if (window.ateexLoginMessageHandlerAdded) {
        logInfo("Message handlers already added, skipping setup");
        return;
      }
      window.ateexLoginMessageHandlerAdded = true;

      // Enhanced message handler with better reliability
      const handleCaptchaMessage = function (event) {
        // Validate message source and content
        if (!event.data || typeof event.data !== "object") {
          return;
        }

        if (event.data.type === "ateex_captcha_solved" && event.data.solved) {
          logSuccess("✅ Received captcha solved message from iframe");
          core.state.captchaSolved = true;
          core.state.captchaInProgress = false;
          core.state.lastSolvedTime = event.data.timestamp;
          logInfo(
            "🔄 Updated captcha state: solved = true, inProgress = false"
          );

          // Immediately attempt form submission when message received
          logInfo("🚀 Auto-submitting form after receiving solved message...");

          // Use multiple timing strategies for better reliability
          setTimeout(async () => {
            await attemptFormSubmission();
          }, 1000); // First attempt after 1 second

          setTimeout(async () => {
            if (!window.ateexFormSubmitted) {
              logInfo("🔄 Retry form submission (backup attempt)");
              await attemptFormSubmission();
            }
          }, 3000); // Backup attempt after 3 seconds
        }

        // Handle credentials state request from iframe
        if (event.data.type === "ateex_request_credentials_state") {
          logInfo("📨 Received credentials state request from iframe");

          // Send current credentials state back to iframe
          try {
            if (event.source) {
              event.source.postMessage(
                {
                  type: "ateex_credentials_ready",
                  ready: core.state.credentialsReady,
                  timestamp: Date.now(),
                },
                "*"
              );
              logInfo("📤 Sent credentials state response to iframe");
            }
          } catch (e) {
            logWarning(
              "Failed to send credentials state response: " + e.message
            );
          }
        }
      };

      // Add message listener with cleanup
      window.addEventListener("message", handleCaptchaMessage);

      // Cleanup function
      window.ateexCleanupLoginHandlers = function () {
        window.removeEventListener("message", handleCaptchaMessage);
        window.ateexLoginMessageHandlerAdded = false;
        delete window.ateexCleanupLoginHandlers;
      };

      // Also listen for custom events from reCAPTCHA (fallback)
      const handleCustomEvent = function (event) {
        logSuccess("✅ Received custom recaptchaSolved event");
        core.state.captchaSolved = true;
        core.state.captchaInProgress = false;
        core.state.lastSolvedTime = Date.now();

        logInfo("🚀 Auto-submitting form after custom event...");
        setTimeout(async () => {
          await attemptFormSubmission();
        }, 1000);
      };

      window.addEventListener("recaptchaSolved", handleCustomEvent);

      // STEP 1: Ensure credentials are available FIRST
      if (!CONFIG || !CONFIG.email || !CONFIG.password) {
        logInfo("Getting credentials...");
        CONFIG = await credentials.getCredentials();

        if (!CONFIG) {
          logWarning("User cancelled credential input, stopping script");
          logWarning(
            "reCAPTCHA will remain blocked until credentials are provided"
          );
          return;
        }

        logSuccess("Credentials obtained successfully");
      }

      // CRITICAL: Mark credentials as ready to allow reCAPTCHA
      core.state.credentialsReady = true;
      logSuccess("Credentials ready - reCAPTCHA can now proceed");

      // Notify all iframes that credentials are ready with enhanced messaging
      try {
        const message = {
          type: "ateex_credentials_ready",
          timestamp: Date.now(),
        };

        // Send to all frames with retry mechanism
        const sendToFrames = () => {
          const frames = document.querySelectorAll("iframe");
          if (frames.length > 0) {
            frames.forEach(frame => {
              try {
                frame.contentWindow.postMessage(message, "*");
              } catch (e) {
                // Ignore cross-origin errors
              }
            });
            logInfo(
              `📤 Sent credentials ready message to ${frames.length} iframe(s)`
            );
          }
        };

        // Send immediately
        sendToFrames();

        // Send again after delay to catch late-loading iframes
        setTimeout(sendToFrames, 2000);
        setTimeout(sendToFrames, 5000);
      } catch (e) {
        logError("Error sending credentials ready message: " + e.message);
      }

      // STEP 2: Wait before proceeding (5-10 seconds as requested)
      const waitTime = Math.random() * 5000 + 5000; // 5-10 seconds
      logInfo(
        `⏳ Waiting ${Math.round(waitTime / 1000)}s before filling form...`
      );
      await sleep(waitTime);

      // STEP 3: Validate credentials (should be valid at this point)
      if (!CONFIG || !CONFIG.email || !CONFIG.password) {
        logWarning(
          "No valid credentials available - auto stats may not be enabled yet"
        );
        logInfo("⏳ Waiting for credentials setup to complete...");
        return; // Gracefully exit without blocking
      }

      if (!credentials.isValidUsernameOrEmail(CONFIG.email)) {
        logError("Invalid username/email format in credentials");
        credentials.clearCredentials();
        logWarning(
          "⚠️ Invalid credentials detected - clearing and waiting for new setup"
        );
        return; // Gracefully exit, let new flow handle re-setup
      }

      if (!credentials.isValidPassword(CONFIG.password)) {
        logError("Invalid password in credentials");
        credentials.clearCredentials();
        logWarning(
          "⚠️ Invalid password detected - clearing and waiting for new setup"
        );
        return; // Gracefully exit, let new flow handle re-setup
      }

      // STEP 4: Fill login form
      logInfo("🖊️ Filling login form...");

      // Fill email/username
      const emailInput = qSelector('input[name="email"]');
      if (emailInput) {
        emailInput.value = CONFIG.email;
        emailInput.dispatchEvent(new Event("input", { bubbles: true }));
        emailInput.dispatchEvent(new Event("change", { bubbles: true }));
        logInfo("✅ Email field filled");
      } else {
        // Try alternative selectors
        const altEmailInput =
          qSelector('input[type="email"]') ||
          qSelector('input[placeholder*="email" i]') ||
          qSelector('input[id*="email" i]');
        if (altEmailInput) {
          altEmailInput.value = CONFIG.email;
          altEmailInput.dispatchEvent(new Event("input", { bubbles: true }));
          altEmailInput.dispatchEvent(new Event("change", { bubbles: true }));
          logInfo("✅ Email field filled (alternative selector)");
        } else {
          logError("Could not find any email input field");
        }
      }

      // Fill password
      const passwordInput = qSelector('input[name="password"]');
      if (passwordInput) {
        passwordInput.value = CONFIG.password;
        passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
        passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
        logInfo("✅ Password field filled");
      } else {
        // Try alternative selectors
        const altPasswordInput =
          qSelector('input[type="password"]') ||
          qSelector('input[placeholder*="password" i]') ||
          qSelector('input[id*="password" i]');
        if (altPasswordInput) {
          altPasswordInput.value = CONFIG.password;
          altPasswordInput.dispatchEvent(new Event("input", { bubbles: true }));
          altPasswordInput.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          logInfo("✅ Password field filled (alternative selector)");
        } else {
          logError("Could not find any password input field");
        }
      }

      // STEP 5: Handle reCAPTCHA (only after form is filled)
      logInfo("🔍 Checking reCAPTCHA status...");

      // Check if captcha was already solved in iframe
      if (core.state.captchaSolved) {
        logSuccess("✅ reCAPTCHA already solved, proceeding with login");
        await attemptFormSubmission();
      } else {
        // Look for reCAPTCHA element
        const recaptchaElement =
          qSelector(".g-recaptcha") ||
          qSelector("#recaptcha-element") ||
          qSelector("[data-sitekey]") ||
          qSelector('iframe[src*="recaptcha"]');

        if (recaptchaElement) {
          logInfo("🔄 Found reCAPTCHA element, waiting for solver...");
          core.state.captchaInProgress = true;

          // Wait for reCAPTCHA to be solved (90 seconds timeout - increased)
          let captchaWaitTime = 0;
          const maxCaptchaWait = 90000; // Increased to 90 seconds

          logInfo(
            `⏱️ Starting captcha wait loop (max ${maxCaptchaWait / 1000}s)`
          );

          while (
            !core.state.captchaSolved &&
            captchaWaitTime < maxCaptchaWait
          ) {
            await sleep(2000); // Check every 2 seconds
            captchaWaitTime += 2000;

            // Check global state more frequently and with debug
            if (core.state.captchaSolved) {
              logSuccess("🎉 reCAPTCHA solved by iframe!");
              break;
            }

            // Log progress every 15 seconds for better tracking
            if (captchaWaitTime % 15000 === 0) {
              logInfo(
                `⏳ Still waiting for reCAPTCHA... ${
                  captchaWaitTime / 1000
                }s elapsed (captchaSolved: ${core.state.captchaSolved})`
              );
            }
          }

          if (core.state.captchaSolved) {
            logSuccess(
              "✅ reCAPTCHA solved successfully, proceeding with login"
            );
            logInfo("⏱️ Waiting 2 seconds for reCAPTCHA state to propagate...");
            await sleep(2000);
            logInfo("✅ Wait complete, ready for form submission");
            await attemptFormSubmission();
          } else {
            logWarning(
              `⚠️ reCAPTCHA not solved within timeout period (${
                maxCaptchaWait / 1000
              }s), attempting login anyway`
            );
            logInfo(
              `📊 Final state: captchaSolved=${core.state.captchaSolved}, captchaInProgress=${core.state.captchaInProgress}`
            );
            await attemptFormSubmission();
          }
        } else {
          logInfo("ℹ️ No reCAPTCHA found on page, proceeding with login");
          await attemptFormSubmission();
        }
      }

      // STEP 6: Setup fallback mechanism to check for successful reCAPTCHA in DOM
      logInfo("🔄 Setting up fallback captcha detection...");
      setupCaptchaFallbackDetection();

      logSuccess("✅ Login process completed, monitoring result...");
    } catch (error) {
      logError("Error in handleLoginPage: " + error.message);
    }
  }

  // Fallback detection for successful reCAPTCHA in DOM
  function setupCaptchaFallbackDetection() {
    let checkCount = 0;
    const maxChecks = 30; // Check for 30 times (5 minutes at 10s intervals)

    const fallbackInterval = setInterval(() => {
      checkCount++;

      try {
        // Check DOM for successful reCAPTCHA indicators
        const recaptchaTokens = [
          document.querySelector('textarea[name="g-recaptcha-response"]'),
          document.querySelector('textarea[id*="recaptcha-response"]'),
          document.querySelector('[name="g-recaptcha-response"]'),
        ].filter(el => el && el.value && el.value.length > 0);

        // Check for success checkmark or solved status
        const successIndicators = [
          document.querySelector(".recaptcha-checkbox-checked"),
          document.querySelector('[aria-checked="true"]'),
          document.querySelector(".rc-anchor-checkbox-checked"),
        ].filter(el => el !== null);

        const hasToken = recaptchaTokens.length > 0;
        const hasSuccessIndicator = successIndicators.length > 0;

        if (hasToken || hasSuccessIndicator) {
          logSuccess("🎉 Fallback detection: reCAPTCHA appears to be solved!");
          logInfo(
            `📊 Detection details: tokens=${hasToken}, indicators=${hasSuccessIndicator}`
          );

          // Update state and attempt form submission
          core.state.captchaSolved = true;
          core.state.captchaInProgress = false;

          clearInterval(fallbackInterval);

          logInfo("🔄 Triggering fallback form submission...");

          // Only submit if not already submitted
          if (!window.ateexFormSubmitted) {
            setTimeout(async () => {
              await attemptFormSubmission();
            }, 1000);
          } else {
            logInfo("📝 Form already submitted, skipping fallback submission");
          }

          return;
        }

        // Log progress every 5 checks (50 seconds) - reduced frequency
        if (checkCount % 5 === 0) {
          logInfo(
            `⏳ Fallback detection: check ${checkCount}/${maxChecks} (tokens: ${hasToken}, indicators: ${hasSuccessIndicator})`
          );
        }

        // Stop after max attempts
        if (checkCount >= maxChecks) {
          logInfo("⏹️ Fallback detection stopped after max attempts");
          clearInterval(fallbackInterval);
        }
      } catch (e) {
        logError("Error in fallback detection: " + e.message);
      }
    }, 10000); // Check every 10 seconds

    logInfo("✅ Fallback captcha detection active (checking every 10s)");

    // Store interval ID for cleanup
    window.ateexFallbackInterval = fallbackInterval;

    // Auto-cleanup after max time
    setTimeout(() => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        logInfo("🧹 Fallback detection auto-cleanup completed");
      }
    }, maxChecks * 10000); // Cleanup after total time
  }

  // Enhanced form submission function with retry mechanism
  async function attemptFormSubmission() {
    // Prevent duplicate submissions
    if (window.ateexFormSubmitted) {
      logInfo("📝 Form already submitted, skipping duplicate attempt");
      return;
    }

    logInfo("🔐 Attempting form submission...");

    let submitSuccess = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!submitSuccess && attempts < maxAttempts) {
      attempts++;
      logInfo(`📝 Form submission attempt ${attempts}/${maxAttempts}`);

      try {
        // Method 1: Try form submission
        const loginForm =
          qSelector('form[action*="login"]') || qSelector("form");
        if (loginForm) {
          logInfo("Found login form, submitting...");

          // Verify form has required fields filled
          const emailField = loginForm.querySelector(
            'input[name="email"], input[type="email"]'
          );
          const passwordField = loginForm.querySelector(
            'input[name="password"], input[type="password"]'
          );

          if (
            emailField &&
            passwordField &&
            emailField.value &&
            passwordField.value
          ) {
            // Trigger form validation events
            emailField.dispatchEvent(new Event("blur", { bubbles: true }));
            passwordField.dispatchEvent(new Event("blur", { bubbles: true }));

            await sleep(500); // Small delay for validation

            // Mark as submitted before actual submission
            window.ateexFormSubmitted = true;

            loginForm.submit();
            logSuccess("✅ Login form submitted successfully");
            submitSuccess = true;

            // Start monitoring for login result
            setTimeout(credentials.monitorLoginResult, 1000);
            break;
          } else {
            logWarning(
              "⚠️ Form fields not properly filled, trying alternative method"
            );
          }
        }

        // Method 2: Try button click if form submission failed
        if (!submitSuccess) {
          const signInButtons = [
            qSelector('button[type="submit"]'),
            qSelector('input[type="submit"]'),
            qSelector('button[class*="login"]'),
            qSelector('button[id*="login"]'),
            qSelector('button[class*="submit"]'),
            qSelector('input[value*="Login"]'),
            qSelector('input[value*="Sign"]'),
            qSelector('button:contains("Login")'),
            qSelector('button:contains("Sign")'),
          ].filter(btn => btn !== null);

          for (const button of signInButtons) {
            if (button && !button.disabled) {
              logInfo(
                `🔘 Trying button: ${button.tagName} - ${
                  button.type || "N/A"
                } - ${button.textContent?.trim() || button.value || "No text"}`
              );

              // Ensure button is visible and clickable
              if (button.offsetParent !== null) {
                // Focus and click with events
                button.focus();
                await sleep(100);

                button.dispatchEvent(new Event("mousedown", { bubbles: true }));
                button.dispatchEvent(new Event("mouseup", { bubbles: true }));

                // Mark as submitted before actual click
                window.ateexFormSubmitted = true;

                button.click();

                logSuccess("✅ Login button clicked successfully");
                submitSuccess = true;

                // Start monitoring for login result
                setTimeout(credentials.monitorLoginResult, 1000);
                break;
              }
            }
          }
        }

        // Method 3: Try Enter key simulation if buttons failed
        if (!submitSuccess && attempts >= 2) {
          logInfo("🔑 Trying Enter key simulation as fallback");

          const passwordField = qSelector('input[type="password"]');
          if (passwordField) {
            passwordField.focus();
            await sleep(100);

            // Simulate Enter key press
            const enterEvent = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            });

            passwordField.dispatchEvent(enterEvent);

            // Also try on document
            document.dispatchEvent(enterEvent);

            // Mark as submitted
            window.ateexFormSubmitted = true;

            logInfo("🔑 Enter key simulation completed");
            submitSuccess = true;

            // Start monitoring for login result
            setTimeout(credentials.monitorLoginResult, 1000);
          }
        }

        if (!submitSuccess && attempts < maxAttempts) {
          logWarning(
            `⏳ Attempt ${attempts} failed, waiting 2s before retry...`
          );
          await sleep(2000);
        }
      } catch (error) {
        logError(
          `❌ Error in submission attempt ${attempts}: ${error.message}`
        );
        if (attempts < maxAttempts) {
          await sleep(2000);
        }
      }
    }

    if (submitSuccess) {
      logSuccess("✅ Form submission completed successfully");

      // Add navigation listener to detect successful login
      const originalHref = window.location.href;
      setTimeout(() => {
        if (window.location.href !== originalHref) {
          logSuccess("🎉 Login successful - page redirected");
          // Cleanup handlers
          if (window.ateexCleanupLoginHandlers) {
            window.ateexCleanupLoginHandlers();
          }
        }
      }, 3000);
    } else {
      logError("❌ All form submission attempts failed");

      // Reset submission flag on failure
      window.ateexFormSubmitted = false;

      // Final fallback: reload page after 5 seconds
      logWarning("🔄 Will reload page in 5 seconds as final fallback");
      setTimeout(() => {
        logInfo("🔄 Reloading page due to form submission failure");
        window.location.reload();
      }, 5000);
    }
  }

  // Handle home page
  async function handleHomePage() {
    // Check if script should be stopped
    if (window.scriptStopped) {
      logInfo("🛑 Home page handler stopped - script stopped");
      return;
    }

    // Check if auto stats is enabled
    if (!core.state.autoStatsEnabled) {
      core.logWithSpamControl(
        "⏳ Home page waiting - auto stats not enabled",
        "WARNING",
        "home_page_waiting"
      );
      return;
    }

    logInfo("🏠 On home page");

    try {
      // Wait 2-4 seconds as requested
      const waitTime = Math.random() * 2000 + 2000; // 2-4 seconds
      await sleep(waitTime);

      // Navigate to earn page
      logInfo("Redirecting to earn page");
      window.location.href = "https://dash.ateex.cloud/earn";
    } catch (error) {
      logError("Error in handleHomePage: " + error.message);
    }
  }

  // Handle logout page
  async function handleLogoutPage() {
    logInfo("🔓 On logout page, clearing data and redirecting to login");
    await data.clearBrowserData();
    setTimeout(() => {
      window.location.href = "https://dash.ateex.cloud/login";
    }, 1000);
  }

  // Handle popup/ads pages
  function handlePopupPage() {
    logInfo("📺 Detected ads/popup page, will auto-close");
    setTimeout(() => {
      logInfo("Auto-closing ads page");
      window.close();
    }, Math.random() * 5000 + 8000); // 8-13 seconds
  }

  // ============= MAIN WORKFLOW ORCHESTRATOR =============

  async function start() {
    const currentPath = window.location.pathname;
    const currentUrl = window.location.href;

    // Handle reCAPTCHA iframe separately - NO UI creation
    if (currentUrl.includes("recaptcha")) {
      logInfo("🔄 Detected reCAPTCHA iframe");

      // Listen for credentials ready message from parent (with spam prevention)
      let lastCredentialsMessage = 0;
      window.addEventListener("message", function (event) {
        if (event.data && event.data.type === "ateex_credentials_ready") {
          const now = Date.now();
          // Only log once every 60 seconds to prevent spam
          if (now - lastCredentialsMessage > 60000) {
            core.logWithSpamControl(
              "Received credentials ready message from parent window",
              "INFO",
              "credentials_ready_message"
            );
            lastCredentialsMessage = now;
          }
          core.state.credentialsReady = true;
        }
      });

      recaptcha.initCaptchaSolver();
      return; // Only handle captcha, nothing else
    }

    // Initialize UI for main pages only (credentials will be handled per page)
    if (window.top === window.self) {
      // Check auto stats state first (backward compatibility + new flow)
      const autoStatsWasEnabled = core.checkAutoStatsState();

      // Check if credentials already exist and set flag
      const existingCreds = credentials.loadCredentials();
      if (existingCreds && existingCreds.email && existingCreds.password) {
        CONFIG = existingCreds;
        core.state.credentialsReady = true;
        logSuccess("Existing credentials found and loaded");

        // Notify iframes that credentials are ready
        setTimeout(() => {
          try {
            const message = {
              type: "ateex_credentials_ready",
              timestamp: Date.now(),
            };

            const frames = document.querySelectorAll("iframe");
            if (frames.length > 0) {
              frames.forEach(frame => {
                try {
                  frame.contentWindow.postMessage(message, "*");
                } catch (e) {
                  // Ignore cross-origin errors
                }
              });
            }
          } catch (e) {
            logError(
              "Error sending existing credentials message: " + e.message
            );
          }
        }, 1000); // Wait 1 second for iframes to load

        // Send message to new iframes when they appear (less frequent)
        let lastIframeCount = 0;
        setInterval(() => {
          if (core.state.credentialsReady) {
            const frames = document.querySelectorAll("iframe");
            // Only send if new iframes appeared
            if (frames.length > lastIframeCount) {
              try {
                const message = {
                  type: "ateex_credentials_ready",
                  timestamp: Date.now(),
                };

                frames.forEach(frame => {
                  try {
                    frame.contentWindow.postMessage(message, "*");
                  } catch (e) {
                    // Ignore cross-origin errors
                  }
                });
              } catch (e) {
                // Ignore errors
              }
            }
            lastIframeCount = frames.length;
          }
        }, 5000); // Check every 5 seconds instead of 3
      }

      // Load data first, then create UI with current data (only if auto stats enabled)
      data.loadSavedStats();

      // Only create UI and start operations if auto stats is enabled
      if (core.state.autoStatsEnabled) {
        ui.createCounterUI();
        // Force immediate update to show loaded data
        ui.updateCounter();
        logSuccess("🚀 Auto Stats runtime active - UI created");
      } else {
        // For new users, immediately prompt for credentials
        setTimeout(async () => {
          try {
            logInfo("🔐 Setting up credentials...");
            const newCredentials = await credentials.getCredentials();

            if (newCredentials) {
              CONFIG = newCredentials;
              core.state.credentialsReady = true;
              logSuccess("✅ Credentials obtained - Auto Stats enabled");

              // Notify iframes that credentials are ready
              const message = {
                type: "ateex_credentials_ready",
                timestamp: Date.now(),
              };

              const frames = document.querySelectorAll("iframe");
              frames.forEach(frame => {
                try {
                  frame.contentWindow.postMessage(message, "*");
                } catch (e) {
                  // Ignore cross-origin errors
                }
              });

              // Create UI now that setup is complete
              ui.createCounterUI();
              ui.updateCounter();
            } else {
              logWarning(
                "❌ User cancelled credential setup - Auto Stats remains disabled"
              );
            }
          } catch (e) {
            logError("Error during credential setup: " + e.message);
          }
        }, 2000); // Wait 2 seconds for page to fully load
      }

      // Update counter more frequently for better UX
      setInterval(ui.updateCounter, 2000); // Update every 2 seconds instead of 10
    }

    // Handle popup ads pages (auto-close)
    if (
      currentUrl.includes("clickcoin") ||
      currentUrl.includes("ads") ||
      currentUrl.includes("popup") ||
      currentPath.includes("/earn/clickcoin")
    ) {
      handlePopupPage();
      return;
    }

    // Handle main pages
    if (currentPath.includes("/earn")) {
      // Always try to handle earn page (it has its own guards)
      handleEarnPage();
    } else if (currentPath.includes("/login")) {
      // Always try to handle login page (it has its own guards)
      handleLoginPage();
    } else if (currentPath.includes("/logout")) {
      // Handle logout page - clear data and redirect to login
      handleLogoutPage();
    } else if (currentPath.includes("/home") || currentPath === "/") {
      // Always try to handle home page (it has its own guards)
      handleHomePage();
    }
    // Removed unknown page log to reduce spam
  }

  // ============= EXPORTS =============

  exports.start = start;
  exports.handleEarnPage = handleEarnPage;
  exports.handleLoginPage = handleLoginPage;
  exports.handleHomePage = handleHomePage;
  exports.handleLogoutPage = handleLogoutPage;
  exports.handlePopupPage = handlePopupPage;
  exports.CONFIG = CONFIG;
})(exports);
