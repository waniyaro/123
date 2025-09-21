/**
 * Credentials Module - Secure credential management with encryption
 * Handles user authentication, credential storage, and validation
 */

(function (exports) {
  "use strict";

  // Get dependencies with validation
  const core = AteexModules.core;

  // Validate dependencies before use
  if (!core) {
    throw new Error("Core module not loaded - missing dependency");
  }
  const { log, logInfo, logError, logSuccess, logWarning } = core;

  // ============= SECURE CREDENTIALS SYSTEM =============
  const CREDENTIALS_KEY = "ateex_secure_creds";
  const CREDENTIALS_EXPIRY_KEY = "ateex_creds_expiry";
  const CREDENTIALS_EXPIRY_HOURS = 24; // Credentials expire after 24 hours

  // Simple encryption/decryption for localStorage (basic obfuscation)
  function encryptData(data) {
    const key = "ateex_security_key_2024";
    let encrypted = "";
    for (let i = 0; i < data.length; i++) {
      encrypted += String.fromCharCode(
        data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return btoa(encrypted);
  }

  function decryptData(encryptedData) {
    try {
      const key = "ateex_security_key_2024";
      const data = atob(encryptedData);
      let decrypted = "";
      for (let i = 0; i < data.length; i++) {
        decrypted += String.fromCharCode(
          data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
      }
      return decrypted;
    } catch (e) {
      return null;
    }
  }

  // ============= VALIDATION FUNCTIONS =============

  // Validate email format
  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate username format (alphanumeric, underscore, dash, 3-20 chars)
  function isValidUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    return usernameRegex.test(username);
  }

  // Validate username OR email
  function isValidUsernameOrEmail(input) {
    if (!input || input.trim().length === 0) {
      return false;
    }

    const trimmed = input.trim();

    // Check if it's an email
    if (trimmed.includes("@")) {
      return isValidEmail(trimmed);
    }

    // Otherwise check if it's a valid username
    return isValidUsername(trimmed);
  }

  // Validate password (minimum requirements)
  function isValidPassword(password) {
    return password && password.length >= 6;
  }

  // ============= CREDENTIAL MANAGEMENT =============

  // Save credentials securely (supports username OR email)
  function saveCredentials(
    usernameOrEmail,
    password,
    enableAutoStatsAfterSave = true
  ) {
    try {
      if (!isValidUsernameOrEmail(usernameOrEmail)) {
        throw new Error("Invalid username or email format");
      }
      if (!isValidPassword(password)) {
        throw new Error("Password must be at least 6 characters");
      }

      // Store as 'email' field for backward compatibility, but can contain username
      const credentials = JSON.stringify({
        email: usernameOrEmail.trim(),
        password,
      });
      const encrypted = encryptData(credentials);
      const expiryTime = Date.now() + CREDENTIALS_EXPIRY_HOURS * 60 * 60 * 1000;

      localStorage.setItem(CREDENTIALS_KEY, encrypted);
      localStorage.setItem(CREDENTIALS_EXPIRY_KEY, expiryTime.toString());

      log("Credentials saved securely");

      // Enable auto stats after successful save (if requested)
      if (enableAutoStatsAfterSave && core.enableAutoStats) {
        core.enableAutoStats();
      }

      return true;
    } catch (error) {
      log("Error saving credentials: " + error.message);
      return false;
    }
  }

  // Load credentials securely
  function loadCredentials() {
    try {
      const encrypted = localStorage.getItem(CREDENTIALS_KEY);
      const expiryTime = localStorage.getItem(CREDENTIALS_EXPIRY_KEY);

      if (!encrypted || !expiryTime) {
        return null;
      }

      // Check if credentials have expired
      if (Date.now() > parseInt(expiryTime)) {
        log("Credentials expired, clearing...");
        clearCredentials();
        return null;
      }

      const decrypted = decryptData(encrypted);
      if (!decrypted) {
        log("Failed to decrypt credentials");
        clearCredentials();
        return null;
      }

      const credentials = JSON.parse(decrypted);

      // Validate loaded credentials (support both username and email)
      if (
        !isValidUsernameOrEmail(credentials.email) ||
        !isValidPassword(credentials.password)
      ) {
        log("Invalid credentials format, clearing...");
        clearCredentials();
        return null;
      }

      return credentials;
    } catch (error) {
      log("Error loading credentials: " + error.message);
      clearCredentials();
      return null;
    }
  }

  // Clear credentials
  function clearCredentials() {
    localStorage.removeItem(CREDENTIALS_KEY);
    localStorage.removeItem(CREDENTIALS_EXPIRY_KEY);

    // Disable auto stats when credentials are cleared
    if (core.disableAutoStats) {
      core.disableAutoStats();
    }

    log("Credentials cleared");
  }

  // ============= CREDENTIAL INPUT UI =============

  // Get credentials with popup input if needed
  async function getCredentials() {
    // Try to load existing credentials first
    let credentials = loadCredentials();

    if (credentials) {
      log("Using saved credentials");
      return credentials;
    }

    // If no valid credentials, prompt user
    log("No valid credentials found, prompting user...");

    return new Promise(resolve => {
      // Create modal popup for credentials input
      const modal = document.createElement("div");
      modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                z-index: 99999;
                display: flex;
                justify-content: center;
                align-items: center;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            `;

      modal.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 30px;
                    border-radius: 15px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    color: white;
                    max-width: 400px;
                    width: 90%;
                ">
                    <h2 style="margin: 0 0 20px 0; text-align: center;">🔐 Ateex Auto Login</h2>
                    <p style="margin: 0 0 20px 0; text-align: center; opacity: 0.9;">
                        Enter your Ateex Cloud credentials to start auto-earning. They will be encrypted and stored locally.
                    </p>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Username/Email:</label>
                        <input type="text" id="ateex-email" placeholder="username or your@email.com" style="
                            width: 100%;
                            padding: 10px;
                            border: none;
                            border-radius: 5px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Password:</label>
                        <input type="password" id="ateex-password" placeholder="Your password" style="
                            width: 100%;
                            padding: 10px;
                            border: none;
                            border-radius: 5px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="ateex-remember" checked style="margin-right: 8px;">
                            <span style="font-size: 12px; opacity: 0.9;">Remember for 24 hours (encrypted)</span>
                        </label>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button id="ateex-cancel" style="
                            flex: 1;
                            padding: 12px;
                            border: none;
                            border-radius: 5px;
                            background: rgba(255,255,255,0.2);
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                        ">Cancel</button>
                        <button id="ateex-save" style="
                            flex: 2;
                            padding: 12px;
                            border: none;
                            border-radius: 5px;
                            background: rgba(255,255,255,0.9);
                            color: #333;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                        ">Save & Continue</button>
                    </div>

                    <div id="ateex-error" style="
                        margin-top: 15px;
                        padding: 10px;
                        background: rgba(255,0,0,0.2);
                        border-radius: 5px;
                        font-size: 12px;
                        display: none;
                    "></div>
                </div>
            `;

      document.body.appendChild(modal);

      const emailInput = document.getElementById("ateex-email");
      const passwordInput = document.getElementById("ateex-password");
      const rememberCheckbox = document.getElementById("ateex-remember");
      const errorDiv = document.getElementById("ateex-error");
      const saveButton = document.getElementById("ateex-save");
      const cancelButton = document.getElementById("ateex-cancel");

      // Focus email input
      setTimeout(() => emailInput.focus(), 100);

      // Error display function
      function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = "block";
        setTimeout(() => {
          errorDiv.style.display = "none";
        }, 5000);
      }

      // Save button handler
      saveButton.onclick = () => {
        const usernameOrEmail = emailInput.value.trim();
        const password = passwordInput.value;
        const remember = rememberCheckbox.checked;

        if (!usernameOrEmail || !password) {
          showError("Please fill in both username/email and password");
          return;
        }

        if (!isValidUsernameOrEmail(usernameOrEmail)) {
          showError("Please enter a valid username or email address");
          return;
        }

        if (!isValidPassword(password)) {
          showError("Password must be at least 6 characters");
          return;
        }

        const credentials = { email: usernameOrEmail, password };

        if (remember) {
          // Save credentials and enable auto stats
          if (!saveCredentials(usernameOrEmail, password, true)) {
            showError("Failed to save credentials");
            return;
          }

          // Show success message
          showError("✅ Credentials saved! Auto Stats starting...");
          setTimeout(() => {
            document.body.removeChild(modal);
            resolve(credentials);
          }, 1500);
        } else {
          // Don't save but still enable auto stats for this session
          if (core.enableAutoStats) {
            core.enableAutoStats();
          }
          showError("✅ Auto Stats enabled for this session!");
          setTimeout(() => {
            document.body.removeChild(modal);
            resolve(credentials);
          }, 1000);
        }
      };

      // Cancel button handler
      cancelButton.onclick = () => {
        document.body.removeChild(modal);
        resolve(null);
      };

      // Enter key handler
      modal.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          saveButton.click();
        } else if (e.key === "Escape") {
          cancelButton.click();
        }
      });
    });
  }

  // ============= LOGIN ERROR DETECTION =============

  // Detect login errors and handle them
  function detectLoginErrors() {
    // Common error selectors for login failures
    const errorSelectors = [
      ".alert-danger",
      ".error-message",
      ".login-error",
      '[class*="error"]',
      '[id*="error"]',
      ".invalid-feedback",
      ".text-danger",
    ];

    for (const selector of errorSelectors) {
      const errorElement = core.qSelector(selector);
      if (errorElement && errorElement.textContent.trim()) {
        const errorText = errorElement.textContent.trim().toLowerCase();

        // Check for credential-related errors
        if (
          errorText.includes("invalid") ||
          errorText.includes("incorrect") ||
          errorText.includes("wrong") ||
          errorText.includes("email") ||
          errorText.includes("password") ||
          errorText.includes("login") ||
          errorText.includes("authentication")
        ) {
          log(`Login error detected: ${errorText}`);

          // Clear potentially invalid credentials
          clearCredentials();

          logError(`❌ Login failed: ${errorText}`);
          logWarning("🔐 Credentials cleared due to login failure");
          logInfo("⏳ New credential setup will be prompted automatically");

          return true;
        }
      }
    }

    return false;
  }

  // Monitor for login errors after form submission
  function monitorLoginResult() {
    let attempts = 0;
    const maxAttempts = 10; // Monitor for 10 seconds

    const checkInterval = setInterval(() => {
      attempts++;

      // Check for login errors
      if (detectLoginErrors()) {
        clearInterval(checkInterval);
        return;
      }

      // Check if we've been redirected (successful login)
      const currentPath = window.location.pathname;
      if (!currentPath.includes("/login")) {
        log("Login appears successful - redirected away from login page");
        clearInterval(checkInterval);
        return;
      }

      // Stop monitoring after max attempts
      if (attempts >= maxAttempts) {
        log("Login monitoring timeout - no clear result detected");
        clearInterval(checkInterval);
      }
    }, 1000);
  }

  // ============= EXPORTS =============

  exports.saveCredentials = saveCredentials;
  exports.loadCredentials = loadCredentials;
  exports.clearCredentials = clearCredentials;
  exports.getCredentials = getCredentials;
  exports.isValidEmail = isValidEmail;
  exports.isValidUsername = isValidUsername;
  exports.isValidUsernameOrEmail = isValidUsernameOrEmail;
  exports.isValidPassword = isValidPassword;
  exports.detectLoginErrors = detectLoginErrors;
  exports.monitorLoginResult = monitorLoginResult;
  exports.encryptData = encryptData;
  exports.decryptData = decryptData;
})(exports);
