// ==UserScript==
// @name         DexScreener Watchlist Alert(Multi-Watchlist Support - TG+PB)
// @namespace    http://tampermonkey.net/
// @version      9.3
// @description  Supports multiple watchlist tabs with identifiers, multi level alerts for Telegram and Pushbullet
// @author       You
// @match        https://dexscreener.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.telegram.org
// @connect      api.pushbullet.com
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function () {
  "use strict";

  // Check if jQuery is loaded
  if (typeof $ === "undefined") {
    log("jQuery is not loaded! Check @require directive.", "error");
    return;
  }

  // ========== CONSTANTS & CONFIGURATION ==========
  const STORAGE_KEYS = {
    SETTINGS: "dexscreener_settings",
    COOLDOWNS: "dexscreener_global_spikes",
  };

  const DEFAULT_SETTINGS = {
    // Sensitive settings will be loaded separately and encrypted
    BOT_TOKEN: "", // Will be loaded from encrypted storage
    CHAT_ID: "", // Will be loaded from encrypted storage
    PUSHBULLET_ACCESS_TOKEN: "", // Will be loaded from encrypted storage
    SPIKE_THRESHOLDS: {
      LOW: {
        threshold: 25,
        cooldown: 30 * 60000,
        enabled: true,
        telegram: true,
        pushbullet: false,
      },
      MEDIUM: {
        threshold: 50,
        cooldown: 15 * 60000,
        enabled: true,
        telegram: true,
        pushbullet: false,
      },
      HIGH: {
        threshold: 100,
        cooldown: 5 * 60000,
        enabled: true,
        telegram: true,
        pushbullet: false,
      },
    },
    USE_TAB_NAME: true,
    SANITIZE_INPUTS: true,
    MAX_MESSAGE_LENGTH: 4096,
    MAX_TOKEN_NAME_LENGTH: 50,
    CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour in milliseconds
    SCRIPT_ENABLED: true, // Master enable/disable for entire script
    CONSOLE_LOGS_ENABLED: true, // Control console.log displays
    TWITTER_QUICK_SEARCH_ENABLED: true, // Enable Twitter Quick Search for token symbols
  };

  const SELECTORS = {
    WATCHLIST_NAME: "a.chakra-link.custom-17zilpi",
    TABLE_ROW: "a.ds-dex-table-row",
    PRICE_CHANGE: ".ds-dex-table-row-col-price-change-h6",
    CHANGE_PERC: ".ds-change-perc",
    TOKEN_SYMBOL: ".ds-dex-table-row-base-token-symbol",
    EMPTY_VAL: ".ds-table-empty-val",
    TABLE: ".ds-dex-table",
    PRICE_USD: ".ds-dex-table-row-col-price",
    LIQUIDITY: ".ds-dex-table-row-col-liquidity",
    VOLUME: ".ds-dex-table-row-col-volume",
  };

  const STYLES = {
    MODAL_BACKDROP: `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.8); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `,
    MODAL_CONTENT: `
      background: white; padding: 30px; border-radius: 12px;
      max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    `,
    BUTTON_PRIMARY: `
      flex: 1; padding: 12px 20px; background: #007bff; color: white;
      border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
    `,
    BUTTON_SECONDARY: `
      padding: 12px 20px; background: #6c757d; color: white;
      border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
    `,
    BUTTON_DANGER: `
      padding: 12px 20px; background: #dc3545; color: white;
      border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
    `,
    BUTTON_WARNING: `
      padding: 8px 16px; background: #ffc107; color: #212529;
      border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
    `,
  };

  // ========== STATE MANAGEMENT ==========
  let SETTINGS = { ...DEFAULT_SETTINGS };
  let WATCHLIST_NAME = ""; // Global variable for watchlist name
  let checkCounter = 0; // Counter for monitoring checks
  const notifiedSpikes = new Map();

  // Destructure settings for easier access
  let {
    BOT_TOKEN,
    CHAT_ID,
    SPIKE_THRESHOLDS,
    USE_TAB_NAME,
    SANITIZE_INPUTS,
    MAX_MESSAGE_LENGTH,
    MAX_TOKEN_NAME_LENGTH,
    CLEANUP_INTERVAL,
    SCRIPT_ENABLED,
    CONSOLE_LOGS_ENABLED,
    TWITTER_QUICK_SEARCH_ENABLED,
  } = SETTINGS;

  // ========== HELPER FUNCTIONS ==========

  function log(message, type = "info") {
    if (CONSOLE_LOGS_ENABLED) {
      switch (type) {
        case "error":
          console.error(message);
          break;
        case "warn":
          console.warn(message);
          break;
        case "success":
          console.log(`✅ ${message}`);
          break;
        default:
          console.log(message);
      }
    }
  }

  // ========== NOTIFICATION FUNCTIONS ==========

  function sendTelegramMessage(message) {
    if (!isScriptEnabled()) {
      log("⏸️ Script is disabled - Telegram message not sent", "warn");
      return;
    }

    if (!message || typeof message !== "string") {
      log("❌ Invalid message content", "error");
      return;
    }

    const truncatedMessage =
      message.length > MAX_MESSAGE_LENGTH
        ? message.substring(0, MAX_MESSAGE_LENGTH - 3) + "..."
        : message;

    GM_xmlhttpRequest({
      method: "POST",
      url: `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        chat_id: CHAT_ID,
        text: truncatedMessage,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      timeout: 10000,
      onload: (response) => {
        if (response.status === 200) {
          log("✅ Telegram sent:", new Date().toLocaleTimeString());
        } else {
          log("❌ Telegram error:", response.status, "error");
        }
      },
      onerror: (error) => {
        log("❌ Telegram request failed:", error.message, "error");
      },
      ontimeout: () => {
        log("❌ Telegram request timeout", "error");
      },
    });
  }

  function sendPushbulletMessage(title, message) {
    if (!isScriptEnabled()) {
      log("⏸️ Script is disabled - Pushbullet message not sent", "warn");
      return;
    }

    if (!SETTINGS.PUSHBULLET_ACCESS_TOKEN) {
      log("Pushbullet access token not configured", "error");
      return;
    }

    // Strip HTML tags for Pushbullet (doesn't support HTML)
    const plainTextMessage = message
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/&lt;/g, "<") // Convert HTML entities back
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n+/g, "\n") // Clean up multiple newlines
      .trim();

    GM_xmlhttpRequest({
      method: "POST",
      url: "https://api.pushbullet.com/v2/pushes",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": SETTINGS.PUSHBULLET_ACCESS_TOKEN,
      },
      data: JSON.stringify({
        type: "note",
        title: title,
        body: plainTextMessage,
      }),
      onload: function (response) {
        if (response.status >= 200 && response.status < 300) {
          log("✅ Pushbullet notification sent successfully");
        } else {
          log(
            "❌ Failed to send Pushbullet notification:",
            response.responseText,
            "error",
          );
        }
      },
      onerror: function (error) {
        log("❌ Pushbullet API error:", error, "error");
      },
    });
  }

  /**
   * Safe JSON parse with error handling
   */
  function safeJsonParse(str, defaultValue = {}) {
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Safe JSON stringify with error handling
   */
  function safeJsonStringify(obj) {
    try {
      return JSON.stringify(obj);
    } catch {
      return "{}";
    }
  }

  /**
   * Show confirmation dialog
   */
  function confirmAction(message) {
    return confirm(`⚠️ ${message}`);
  }

  /**
   * Show alert message
   */
  function showAlert(message, type = "info") {
    const emoji = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
    alert(`${emoji} ${message}`);
  }

  // ========== SECURE SETTINGS FUNCTIONS ==========

  // Generate encryption key from multiple sources for better security
  function getEncryptionKey() {
    // Try environment variables first
    if (typeof process !== "undefined" && process.env.DEXSCREENER_KEY) {
      return process.env.DEXSCREENER_KEY;
    }

    // Try global variable
    if (typeof window !== "undefined" && window.DEXSCREENER_KEY) {
      return window.DEXSCREENER_KEY;
    }

    // Try localStorage
    if (typeof localStorage !== "undefined") {
      const storedKey = localStorage.getItem("dexscreener_encryption_key");
      if (storedKey) {
        return storedKey;
      }
    }

    // Generate unique key per user if none exists
    const userKey = `dexscreener_${navigator.userAgent.substring(0, 10)}_${Date.now()}`;
    localStorage.setItem("dexscreener_encryption_key", userKey);
    return userKey;
  }

  function encryptSensitiveData(data) {
    try {
      const key = getEncryptionKey();
      return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
    } catch (error) {
      log("Encryption failed:", error, "error");
      return null;
    }
  }

  function decryptSensitiveData(encrypted) {
    try {
      const key = getEncryptionKey();
      const bytes = CryptoJS.AES.decrypt(encrypted, key);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (error) {
      log("Decryption failed:", error, "error");
      return null;
    }
  }

  function saveSecureSettings() {
    try {
      // Separate sensitive and non-sensitive data
      const sensitiveData = {
        BOT_TOKEN: SETTINGS.BOT_TOKEN,
        CHAT_ID: SETTINGS.CHAT_ID,
        PUSHBULLET_ACCESS_TOKEN: SETTINGS.PUSHBULLET_ACCESS_TOKEN,
      };

      const nonSensitiveData = {
        ...SETTINGS,
        BOT_TOKEN: undefined,
        CHAT_ID: undefined,
        PUSHBULLET_ACCESS_TOKEN: undefined,
      };

      // Store sensitive data encrypted
      const encrypted = encryptSensitiveData(sensitiveData);
      if (encrypted) {
        GM_setValue("sensitive_settings", encrypted);
      }

      // Store non-sensitive data normally
      GM_setValue("settings", nonSensitiveData);

      log("✅ Settings saved securely");
    } catch (error) {
      log("❌ Error saving secure settings:", error, "error");
    }
  }

  function loadSecureSettings() {
    try {
      // Load non-sensitive data normally
      const nonSensitiveData = GM_getValue("settings", {});
      SETTINGS = { ...DEFAULT_SETTINGS, ...nonSensitiveData };

      // Load sensitive data encrypted
      const encrypted = GM_getValue("sensitive_settings", null);
      if (encrypted) {
        const sensitiveData = decryptSensitiveData(encrypted);
        if (sensitiveData) {
          SETTINGS.BOT_TOKEN = sensitiveData.BOT_TOKEN;
          SETTINGS.CHAT_ID = sensitiveData.CHAT_ID;
          SETTINGS.PUSHBULLET_ACCESS_TOKEN =
            sensitiveData.PUSHBULLET_ACCESS_TOKEN;
        }
      }

      updateDestructuredSettings();
      log("✅ Settings loaded securely");
    } catch (error) {
      log("❌ Error loading secure settings:", error, "error");
      resetSettings();
    }
  }

  // ========== SETTINGS MANAGEMENT ==========

  function loadSettings() {
    try {
      const saved = GM_getValue(STORAGE_KEYS.SETTINGS, null);
      if (saved) {
        SETTINGS = { ...DEFAULT_SETTINGS, ...safeJsonParse(saved) };
        log("✅ Settings loaded from storage");
        updateDestructuredSettings();
      }
    } catch (error) {
      log("❌ Error loading settings:", error, "error");
    }
  }

  function saveSettings() {
    try {
      GM_setValue(STORAGE_KEYS.SETTINGS, safeJsonStringify(SETTINGS));
      log("✅ Settings saved to storage");
    } catch (error) {
      log("❌ Error saving settings:", error, "error");
    }
  }

  function updateDestructuredSettings() {
    ({
      BOT_TOKEN,
      CHAT_ID,
      SPIKE_THRESHOLDS,
      USE_TAB_NAME,
      SANITIZE_INPUTS,
      MAX_MESSAGE_LENGTH,
      MAX_TOKEN_NAME_LENGTH,
      CLEANUP_INTERVAL,
      SCRIPT_ENABLED,
      CONSOLE_LOGS_ENABLED,
      TWITTER_QUICK_SEARCH_ENABLED,
    } = SETTINGS);
  }

  function resetSettings() {
    SETTINGS = { ...DEFAULT_SETTINGS };
    updateDestructuredSettings();
    saveSettings();
    // location.reload();
  }

  // ========== SANITIZATION FUNCTIONS ==========

  function sanitizeText(text, maxLength = 100) {
    if (!text || typeof text !== "string") return "";

    return text
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/[<>"'&]/g, "") // Remove dangerous characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters
      .trim()
      .substring(0, maxLength);
  }

  function sanitizeTokenSymbol(symbol) {
    if (!SANITIZE_INPUTS) return symbol || "Unknown";
    return sanitizeText(symbol, MAX_TOKEN_NAME_LENGTH) || "Unknown";
  }

  function sanitizeWatchlistName(name) {
    if (!SANITIZE_INPUTS) return name || "Watchlist";
    return sanitizeText(name, 30) || "Watchlist";
  }

  function sanitizeUrl(url) {
    if (!SANITIZE_INPUTS || !url || typeof url !== "string") return url || "";

    return url
      .replace(/^(javascript|data|vbscript):/i, "") // Remove dangerous protocols
      .replace(/[<>"'\s]/g, "") // Remove dangerous characters
      .trim();
  }

  // ========== WATCHLIST NAME FUNCTIONS ==========

  function getTabName() {
    try {
      // Method 1: UI element using jQuery
      const tabElement = $(SELECTORS.WATCHLIST_NAME);
      if (tabElement.length && tabElement.text().trim()) {
        return sanitizeText(tabElement.text().trim(), 30);
      }

      // Method 2: Page title
      const pageTitle = document.title;
      if (pageTitle && pageTitle !== "DEXScreener") {
        const cleanTitle = pageTitle.replace(/DexScreener.*$/i, "").trim();
        return sanitizeText(cleanTitle || pageTitle, cleanTitle ? 30 : 20);
      }

      // Method 3: URL path
      const pathSegments = window.location.pathname.split("/").filter(Boolean);
      if (pathSegments.length > 1 && pathSegments[0] === "watchlist") {
        return sanitizeText(pathSegments[1], 30);
      }

      return null;
    } catch (error) {
      log("Error getting tab name:", error, "error");
      return null;
    }
  }

  function getWatchlistName() {
    if (SETTINGS.USE_TAB_NAME) {
      const tabName = getTabName();
      // console.log("Tab name:", tabName);
      if (tabName) return sanitizeWatchlistName(tabName);
    }

    // URL extraction
    const urlMatch = window.location.pathname.match(/\/watchlist\/([^\/]+)/);
    if (urlMatch) return sanitizeWatchlistName(urlMatch[1]);

    // Page title fallback
    const pageTitle = document.title;
    if (pageTitle && pageTitle !== "DEXScreener") {
      return sanitizeWatchlistName(pageTitle.substring(0, 20));
    }

    return sanitizeWatchlistName("Watchlist");
  }

  // ========== COOLDOWN MANAGEMENT ==========

  function getGlobalCooldowns() {
    const stored = GM_getValue(STORAGE_KEYS.COOLDOWNS, "{}");
    return safeJsonParse(stored);
  }

  function setGlobalCooldown(tokenKey) {
    const cooldowns = getGlobalCooldowns();
    cooldowns[tokenKey] = Date.now();
    GM_setValue(STORAGE_KEYS.COOLDOWNS, safeJsonStringify(cooldowns));
  }

  function clearAllCooldowns() {
    try {
      GM_deleteValue(STORAGE_KEYS.COOLDOWNS);
      showAlert("All cooldowns cleared successfully!", "success");
    } catch (error) {
      log("Error clearing cooldowns:", error, "error");
      showAlert(
        "Failed to clear cooldowns. Check console for details.",
        "error",
      );
    }
  }

  function cleanupOldCooldowns(currentTokens) {
    try {
      const cooldowns = getGlobalCooldowns();
      const clearCooldowns = {};
      let removedCount = 0;

      // Get current timestamp for comparison
      const now = Date.now();

      // console.log("currentTokens", currentTokens);
      // console.log("cooldowns", cooldowns);

      Object.keys(cooldowns).forEach((tokenKey) => {
        const cooldownTime = cooldowns[tokenKey];
        const isExpired = now - cooldownTime > 24 * 60 * 60 * 1000; // 24 hours

        if (!currentTokens.has(tokenKey)) {
          clearCooldowns[tokenKey] = "";
        } else if (currentTokens.has(tokenKey) && isExpired) {
          // Keep if: token is currently in watchlist OR cooldown is expired
          clearCooldowns[tokenKey] = "";
        }
      });

      Object.keys(cooldowns).forEach((tokenKey) => {
        if (tokenKey in clearCooldowns) {
          delete cooldowns[tokenKey];
          removedCount++;
        }
      });

      // console.log("clearCooldowns", clearCooldowns);
      // console.log("cooldowns now: ", cooldowns);

      // Update storage with cleaned cooldowns
      GM_setValue(STORAGE_KEYS.COOLDOWNS, safeJsonStringify(cooldowns));

      log(`🧹 Cleaned up ${removedCount} old cooldown entries`);
    } catch (error) {
      log("Error cleaning up old cooldowns:", error, "error");
    }
  }

  function shouldNotify(tokenKey, spikeLevel) {
    const now = Date.now();
    const globalCooldowns = getGlobalCooldowns();
    const cooldownKey = `${tokenKey}-${spikeLevel}`;
    const lastGlobalTime = globalCooldowns[cooldownKey] || 0;

    // If token is not in cooldown storage (new token), allow notification
    if (!globalCooldowns.hasOwnProperty(cooldownKey)) {
      setGlobalCooldown(cooldownKey);
      return true;
    }

    // If token exists in cooldown, check if enough time has passed
    if (now - lastGlobalTime >= SPIKE_THRESHOLDS[spikeLevel].cooldown) {
      setGlobalCooldown(cooldownKey);
      return true;
    }
    return false;
  }

  function getSpikeThreshold(value) {
    // Determine which threshold level applies
    if (Math.abs(value) >= SPIKE_THRESHOLDS.HIGH.threshold) {
      return { level: "HIGH", ...SPIKE_THRESHOLDS.HIGH };
    } else if (Math.abs(value) >= SPIKE_THRESHOLDS.MEDIUM.threshold) {
      return { level: "MEDIUM", ...SPIKE_THRESHOLDS.MEDIUM };
    } else if (Math.abs(value) >= SPIKE_THRESHOLDS.LOW.threshold) {
      return { level: "LOW", ...SPIKE_THRESHOLDS.LOW };
    }
    return null;
  }

  // ========== UI FUNCTIONS ==========

  function highlightRow(row, h6Cell, isPositive) {
    const colors = isPositive
      ? {
          bg: "rgba(144, 238, 144, 0.25)",
          border: "#19b319",
          cellBg: "rgba(25,179,25,0.18)",
        }
      : {
          bg: "rgba(255, 182, 198, 0.25)",
          border: "#d61f1f",
          cellBg: "rgba(214,31,31,0.18)",
        };

    row.style.backgroundColor = colors.bg;
    row.style.border = `2px solid ${colors.border}`;

    if (h6Cell) {
      h6Cell.style.fontWeight = "700";
      h6Cell.style.backgroundColor = colors.cellBg;
      h6Cell.style.borderRadius = "6px";
      h6Cell.style.padding = "6px";
    }
  }

  function removeHighlight(row, h6Cell) {
    // Remove all custom styling to restore default appearance
    row.style.backgroundColor = "";
    row.style.border = "";

    if (h6Cell) {
      h6Cell.style.fontWeight = "";
      h6Cell.style.backgroundColor = "";
      h6Cell.style.borderRadius = "";
      h6Cell.style.padding = "";
    }
  }

  function createModalElement() {
    // Remove existing modal using jQuery
    $("#dexscreener-settings-modal").remove();

    // Create modal using plain JavaScript first, then enhance with jQuery
    const modal = document.createElement("div");
    modal.id = "dexscreener-settings-modal";
    modal.style.cssText = STYLES.MODAL_BACKDROP;

    const content = document.createElement("div");
    content.style.cssText = STYLES.MODAL_CONTENT;
    content.innerHTML = `
      <h2 style="margin: 0 0 20px 0; color: #000000; font-size: 24px;">⚙️ DexScreener Alert Settings</h2>
      
      <div style="margin-bottom: 20px; padding: 20px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e9ecef;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0; color: #000; font-size: 18px; font-weight: 600;">🎯 Spike Thresholds & Cooldowns</h3>
          <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px; color: #007bff;">
            <input type="checkbox" id="script-enabled" ${SETTINGS.SCRIPT_ENABLED ? "checked" : ""} 
                   style="margin-right: 8px;">
            <span style="color: #000;">🔘 Enable Script</span>
          </label>
        </div>
        
        <div id="idSettingsContainer">

        <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #FF0000;">
          <!-- HIGH Spike Column Headers -->
          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; gap: 15px; margin-bottom: 15px; padding: 0 5px;">
            <div style="font-weight: 600; color: #FF0000; font-size: 14px;">🔴 HIGH Spike</div>
            <div style="font-weight: 600; color: #000; font-size: 14px;">Cooldown</div>
            <div style="font-weight: 600; color: #000; font-size: 14px;">Enabled</div>
          </div>
          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; gap: 15px; align-items: start;">
            <div>
              <input type="number" id="spike-threshold-high" value="${SETTINGS.SPIKE_THRESHOLDS.HIGH.threshold}" min="1" max="1000"
                     style="width: 100%; padding: 8px; border: 2px solid #FF0000; border-radius: 6px; font-size: 14px; font-weight: 600;">
              <small style="color: #000; font-size: 12px; display: block; margin-top: 5px;">Price movements (100%+ default)</small>
            </div>
            <div>
              <input type="number" id="cooldown-high" value="${SETTINGS.SPIKE_THRESHOLDS.HIGH.cooldown / 60000}" min="1"
                     style="width: 100%; padding: 8px; border: 2px solid #FF0000; border-radius: 6px; font-size: 14px; font-weight: 600;">
              <small style="color: #000; font-size: 12px; display: block; margin-top: 5px;">minutes</small>
            </div>
            <div>
              <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 10px;">
                <input type="checkbox" id="enabled-high" ${SETTINGS.SPIKE_THRESHOLDS.HIGH.enabled ? "checked" : ""} 
                       style="margin-right: 5px;">
                <span style="color: #000; font-size: 14px;">Enable</span>
              </label>

              <div id="alert-options-high" style="margin-top: 5px; background: #f8f9fa; display: ${SETTINGS.SPIKE_THRESHOLDS.HIGH.enabled ? "block" : "none"};">
                <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 5px;">
                  <input type="checkbox" id="telegram-high" ${SETTINGS.SPIKE_THRESHOLDS.HIGH.telegram ? "checked" : ""} 
                        style="margin-right: 5px;">
                  <span style="color: #000; font-size: 13px;">📱 Telegram Alerts</span>
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                  <input type="checkbox" id="pushbullet-high" ${SETTINGS.SPIKE_THRESHOLDS.HIGH.pushbullet ? "checked" : ""} 
                        style="margin-right: 5px;">
                  <span style="color: #000; font-size: 13px;">🔔 Pushbullet Alerts</span>
                </label>
              </div>

            </div>
          </div>
          
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #966306ff;">
          <!-- MEDIUM Spike Column Headers -->
          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; gap: 15px; margin-bottom: 15px; padding: 0 5px;">
            <div style="font-weight: 600; color: #966306ff; font-size: 14px;">🟠 MEDIUM Spike</div>
            <div style="font-weight: 600; color: #000; font-size: 14px;">Cooldown</div>
            <div style="font-weight: 600; color: #000; font-size: 14px;">Enabled</div>
          </div>
          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; gap: 15px; align-items: start;">
            <div>
              <input type="number" id="spike-threshold-medium" value="${SETTINGS.SPIKE_THRESHOLDS.MEDIUM.threshold}" min="1" max="1000"
                     style="width: 100%; padding: 8px; border: 2px solid #966306ff; border-radius: 6px; font-size: 14px; font-weight: 600;">
              <small style="color: #000; font-size: 12px; display: block; margin-top: 5px;">Price movements (50%+ default)</small>
            </div>
            <div>
              <input type="number" id="cooldown-medium" value="${SETTINGS.SPIKE_THRESHOLDS.MEDIUM.cooldown / 60000}" min="1"
                     style="width: 100%; padding: 8px; border: 2px solid #966306ff; border-radius: 6px; font-size: 14px; font-weight: 600;">
              <small style="color: #000; font-size: 12px; display: block; margin-top: 5px;">minutes</small>
            </div>
            <div>
              <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 10px;">
                <input type="checkbox" id="enabled-medium" ${SETTINGS.SPIKE_THRESHOLDS.MEDIUM.enabled ? "checked" : ""} 
                       style="margin-right: 5px;">
                <span style="color: #000; font-size: 14px;">Enable</span>
              </label>

              <div id="alert-options-medium" style="margin-top: 5px; background: #f8f9fa; display: ${SETTINGS.SPIKE_THRESHOLDS.MEDIUM.enabled ? "block" : "none"};">
                <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 5px;">
                  <input type="checkbox" id="telegram-medium" ${SETTINGS.SPIKE_THRESHOLDS.MEDIUM.telegram ? "checked" : ""} 
                        style="margin-right: 5px;">
                  <span style="color: #000; font-size: 13px;">📱 Telegram Alerts</span>
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                  <input type="checkbox" id="pushbullet-medium" ${SETTINGS.SPIKE_THRESHOLDS.MEDIUM.pushbullet ? "checked" : ""} 
                        style="margin-right: 5px;">
                  <span style="color: #000; font-size: 13px;">🔔 Pushbullet Alerts</span>
                </label>
              </div>

            </div>
          </div>
        
        </div>

        <div style="margin-bottom: 15px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #8f8f20ff;">
          <!-- LOW Spike Column Headers -->
          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; gap: 15px; margin-bottom: 15px; padding: 0 5px;">
            <div style="font-weight: 600; color: #8f8f20ff; font-size: 14px;">🟡 LOW Spike</div>
            <div style="font-weight: 600; color: #000; font-size: 14px;">Cooldown</div>
            <div style="font-weight: 600; color: #000; font-size: 14px;">Enabled</div>
          </div>
          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; gap: 15px; align-items: start;">
            <div>
              <input type="number" id="spike-threshold-low" value="${SETTINGS.SPIKE_THRESHOLDS.LOW.threshold}" min="1" max="1000"
                     style="width: 100%; padding: 8px; border: 2px solid #8f8f20ff; border-radius: 6px; font-size: 14px; font-weight: 600;">
              <small style="color: #000; font-size: 12px; display: block; margin-top: 5px;">Price movements (25%+ default)</small>
            </div>
            <div>
              <input type="number" id="cooldown-low" value="${SETTINGS.SPIKE_THRESHOLDS.LOW.cooldown / 60000}" min="1"
                     style="width: 100%; padding: 8px; border: 2px solid #8f8f20ff; border-radius: 6px; font-size: 14px; font-weight: 600;">
              <small style="color: #000; font-size: 12px; display: block; margin-top: 5px;">minutes</small>
            </div>
            <div>
              <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 10px;">
                <input type="checkbox" id="enabled-low" ${SETTINGS.SPIKE_THRESHOLDS.LOW.enabled ? "checked" : ""} 
                       style="margin-right: 5px;">
                <span style="color: #000; font-size: 14px;">Enable</span>
              </label>

              <div id="alert-options-low" style="margin-top: 5px; background: #f8f9fa; display: ${SETTINGS.SPIKE_THRESHOLDS.LOW.enabled ? "block" : "none"};">
                <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 5px;">
                  <input type="checkbox" id="telegram-low" ${SETTINGS.SPIKE_THRESHOLDS.LOW.telegram ? "checked" : ""} 
                        style="margin-right: 5px;">
                  <span style="color: #000; font-size: 13px;">📱 Telegram Alerts</span>
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                  <input type="checkbox" id="pushbullet-low" ${SETTINGS.SPIKE_THRESHOLDS.LOW.pushbullet ? "checked" : ""} 
                        style="margin-right: 5px;">
                  <span style="color: #000; font-size: 13px;">🔔 Pushbullet Alerts</span>
                </label>
              </div>

            </div>
          </div>
        </div>

        
        <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #1b000f54;">
          <h4 style="margin: 0 0 15px 0; color: #000; font-size: 18px; font-weight: 600;">🔧 Extra Settings</h4>
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px;">
              <input type="checkbox" id="console-logs-enabled" ${SETTINGS.CONSOLE_LOGS_ENABLED ? "checked" : ""} 
                     style="margin-right: 8px;">
              <span style="color: #000;">Enable Console Logs</span>
            </label>
          </div>
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 14px;">
              <input type="checkbox" id="twitter-quick-search-enabled" ${SETTINGS.TWITTER_QUICK_SEARCH_ENABLED ? "checked" : ""} 
                     style="margin-right: 8px;">
              <span style="color: #000;">🐦 Twitter Quick Search</span>
            </label>
          </div>
        </div>

        <div style="margin-bottom: 20px; padding: 20px; background: #fff3cd; border-radius: 12px; border: 1px solid #ffeaa7;">
          <h3 style="margin: 0 0 15px 0; color: #856404; font-size: 18px; font-weight: 600;">🔐 API Configuration</h3>
          
          <div style="margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #000; font-size: 16px; font-weight: 600;">📱 Telegram Bot Settings</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #000;">Bot Token:</label>
                <input type="password" id="bot-token" value="${SETTINGS.BOT_TOKEN}" 
                      placeholder="Enter Telegram Bot Token" 
                      style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">
                <small style="color: #666; font-size: 11px; display: block; margin-top: 3px;">Get from @BotFather on Telegram</small>
              </div>
              <div>
                <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #000;">Chat ID:</label>
                <input type="text" id="chat-id" value="${SETTINGS.CHAT_ID}" 
                      placeholder="Enter Chat ID" 
                      style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">
                <small style="color: #666; font-size: 11px; display: block; margin-top: 3px;">Your Telegram Chat ID</small>
              </div>
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <h4 style="margin: 0 0 10px 0; color: #000; font-size: 16px; font-weight: 600;">📲 Pushbullet Settings</h4>
            <div>
              <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #000;">Access Token:</label>
              <input type="password" id="pushbullet-token" value="${SETTINGS.PUSHBULLET_ACCESS_TOKEN}" 
                    placeholder="Enter Pushbullet Access Token" 
                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">
              <small style="color: #666; font-size: 11px; display: block; margin-top: 3px;">Get from pushbullet.com</small>
            </div>
          </div>
          
          <div style="padding: 10px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 12px; color: #856404;">
              🔒 <strong>Security Note:</strong> API keys are encrypted and stored securely in your browser.
            </p>
          </div>
        </div>


      </div>

      <div style="display: flex; gap: 10px; margin-top: 25px;">
        <button id="clear-cooldowns" style="${STYLES.BUTTON_WARNING}">🗑️ Clear All Cooldowns</button>
        <button id="save-settings" style="${STYLES.BUTTON_PRIMARY}">💾 Save Settings</button>
        <button id="reset-settings" style="${STYLES.BUTTON_SECONDARY}">🔄 Reset</button>
        <button id="close-settings" style="${STYLES.BUTTON_DANGER}">❌ Close</button>
      </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
    return modal;
  }

  function setupModalEventListeners(modal) {
    // Add event listener for script enable checkbox to toggle blur on spike levels
    $("#script-enabled").on("change", () => {
      const isScriptEnabled = $("#script-enabled").prop("checked");
      const spikeLevelSections = $("#idSettingsContainer");

      if (isScriptEnabled) {
        // Remove blur effect
        spikeLevelSections.css({
          filter: "none",
          "pointer-events": "auto",
          opacity: "1",
        });
      } else {
        // Add blur effect
        spikeLevelSections.css({
          filter: "blur(2px)",
          "pointer-events": "none",
          opacity: "0.5",
        });
      }

      // Save the script enable state immediately
      SETTINGS.SCRIPT_ENABLED = isScriptEnabled;
      saveSettings();

      // Update monitoring state dynamically without reload
      updateMonitoringState(isScriptEnabled);
    });

    // Console logs toggle event listener
    $("#console-logs-enabled").on("change", function () {
      const isLogsEnabled = $(this).prop("checked");
      SETTINGS.CONSOLE_LOGS_ENABLED = isLogsEnabled;
      updateDestructuredSettings(); // Update the destructured variable
      saveSettings(); // Save immediately

      log(`Console logs ${isLogsEnabled ? "enabled" : "disabled"}`);
    });

    // Twitter Quick Search toggle event listener
    $("#twitter-quick-search-enabled").on("change", function () {
      const isTwitterSearchEnabled = $(this).prop("checked");
      SETTINGS.TWITTER_QUICK_SEARCH_ENABLED = isTwitterSearchEnabled;
      updateDestructuredSettings(); // Update destructured variable
      saveSettings(); // Save immediately

      log(
        `Twitter Quick Search ${isTwitterSearchEnabled ? "enabled" : "disabled"}`,
      );

      // Inject Twitter links immediately if enabling
      if (isTwitterSearchEnabled) {
        // Reset counter and inject immediately
        twitterLinkCounter = 0;
        injectTwitterLinks(true); // Force immediate injection
      } else {
        // If disabling, remove Twitter links
        removeTwitterLinks();
      }
    });

    // Initialize blur state based on current setting
    const isScriptEnabled = $("#script-enabled").prop("checked");
    const spikeLevelSections = $("#idSettingsContainer");

    if (!isScriptEnabled) {
      spikeLevelSections.css({
        filter: "blur(2px)",
        "pointer-events": "none",
        opacity: "0.5",
      });
    }

    // Add event listeners for enable checkboxes to toggle alert options
    $("#enabled-high").on("change", () => {
      const isChecked = $("#enabled-high").prop("checked");
      $("#alert-options-high").css("display", isChecked ? "block" : "none");
    });

    $("#enabled-medium").on("change", () => {
      const isChecked = $("#enabled-medium").prop("checked");
      $("#alert-options-medium").css("display", isChecked ? "block" : "none");
    });

    $("#enabled-low").on("change", () => {
      const isChecked = $("#enabled-low").prop("checked");
      $("#alert-options-low").css("display", isChecked ? "block" : "none");
    });

    $("#save-settings").on("click", () => {
      // Save API configuration (sensitive data)
      SETTINGS.BOT_TOKEN = $("#bot-token").val().trim();
      SETTINGS.CHAT_ID = $("#chat-id").val().trim();
      SETTINGS.PUSHBULLET_ACCESS_TOKEN = $("#pushbullet-token").val().trim();

      // Save HIGH spike settings
      SETTINGS.SPIKE_THRESHOLDS.HIGH.threshold = parseInt(
        $("#spike-threshold-high").val(),
      );
      SETTINGS.SPIKE_THRESHOLDS.HIGH.cooldown =
        parseInt($("#cooldown-high").val()) * 60000;
      SETTINGS.SPIKE_THRESHOLDS.HIGH.enabled =
        $("#enabled-high").prop("checked");
      SETTINGS.SPIKE_THRESHOLDS.HIGH.telegram =
        $("#telegram-high").prop("checked");
      SETTINGS.SPIKE_THRESHOLDS.HIGH.pushbullet =
        $("#pushbullet-high").prop("checked");

      // Save MEDIUM spike settings
      SETTINGS.SPIKE_THRESHOLDS.MEDIUM.threshold = parseInt(
        $("#spike-threshold-medium").val(),
      );
      SETTINGS.SPIKE_THRESHOLDS.MEDIUM.cooldown =
        parseInt($("#cooldown-medium").val()) * 60000;
      SETTINGS.SPIKE_THRESHOLDS.MEDIUM.enabled =
        $("#enabled-medium").prop("checked");
      SETTINGS.SPIKE_THRESHOLDS.MEDIUM.telegram =
        $("#telegram-medium").prop("checked");
      SETTINGS.SPIKE_THRESHOLDS.MEDIUM.pushbullet =
        $("#pushbullet-medium").prop("checked");

      // Save LOW spike settings
      SETTINGS.SPIKE_THRESHOLDS.LOW.threshold = parseInt(
        $("#spike-threshold-low").val(),
      );
      SETTINGS.SPIKE_THRESHOLDS.LOW.cooldown =
        parseInt($("#cooldown-low").val()) * 60000;
      SETTINGS.SPIKE_THRESHOLDS.LOW.enabled = $("#enabled-low").prop("checked");
      SETTINGS.SPIKE_THRESHOLDS.LOW.telegram =
        $("#telegram-low").prop("checked");
      SETTINGS.SPIKE_THRESHOLDS.LOW.pushbullet =
        $("#pushbullet-low").prop("checked");

      // Save console logs setting
      SETTINGS.CONSOLE_LOGS_ENABLED = $("#console-logs-enabled").prop(
        "checked",
      );

      // Save Twitter Quick Search setting
      SETTINGS.TWITTER_QUICK_SEARCH_ENABLED = $(
        "#twitter-quick-search-enabled",
      ).prop("checked");

      // Save script enable state
      SETTINGS.SCRIPT_ENABLED = $("#script-enabled").prop("checked");

      saveSecureSettings();
      modal.remove();
    });

    $("#reset-settings").on("click", () => {
      if (
        confirmAction(
          "Are you sure you want to reset all settings to defaults?",
        )
      ) {
        resetSettings();
        modal.remove();
      }
    });

    $("#close-settings").on("click", () => {
      modal.remove();
    });

    $("#clear-cooldowns").on("click", () => {
      if (
        confirmAction(
          "Are you sure you want to clear all cooldowns? This will allow all tokens to alert immediately.",
        )
      ) {
        clearAllCooldowns();
      }
    });

    $(modal).on("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function showSettingsModal() {
    const modal = createModalElement();
    setupModalEventListeners(modal);
  }

  // ========== SPIKE DETECTION ==========

  function extractSpikeData(row) {
    const h6Cell = row.querySelector(SELECTORS.PRICE_CHANGE);
    if (!h6Cell) return null;

    const changeEl = h6Cell.querySelector(SELECTORS.CHANGE_PERC);
    if (!changeEl || changeEl.querySelector(SELECTORS.EMPTY_VAL)) return null;

    const text = changeEl.textContent.trim();
    const match = text.match(/([+-]?\d+\.?\d*)%/);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const spikeInfo = getSpikeThreshold(value);
    if (!spikeInfo) return null;

    const symbol =
      sanitizeTokenSymbol(
        row.querySelector(SELECTORS.TOKEN_SYMBOL)?.textContent?.trim(),
      ) || "Unknown";

    // Extract USD price
    let priceUSD = "Unknown";
    const priceCell = row.querySelector(SELECTORS.PRICE_USD);
    if (priceCell) {
      // First check if there's a span with title (for very small prices < 0.0001)
      const priceSpan = priceCell.querySelector("span[title]");
      if (priceSpan && priceSpan.hasAttribute("title")) {
        // Extract price from span title attribute
        const titleText = priceSpan.getAttribute("title").trim();
        const titleMatch = titleText.match(/[$]?([\d,]+\.?\d*)/);
        if (titleMatch) {
          priceUSD = titleMatch[1];
        }
      } else {
        // Fallback to regular text extraction
        const priceText = priceCell.textContent.trim();
        // Extract price value (handle formats like "$0.001234", "0.001234", etc.)
        const priceMatch = priceText.match(/[$]?([\d,]+\.?\d*)/);
        if (priceMatch) {
          priceUSD = priceMatch[1];
        }
      }
    }

    return {
      value,
      symbol,
      priceUSD,
      isPositive: value > 0,
      level: spikeInfo.level,
      cooldown: spikeInfo.cooldown,
    };
  }

  function getCurrentTokens(rows) {
    const currentTokens = new Set();

    rows.each(function () {
      const row = $(this);
      const spikeData = extractSpikeData(row[0]);
      if (spikeData) {
        const { symbol, isPositive, level } = spikeData;
        const direction = isPositive ? "UP" : "DOWN";
        const tokenKey = `${symbol}-${direction}-${level}`;
        currentTokens.add(tokenKey);
      }
    });

    return currentTokens;
  }

  function checkForSpikes() {
    // Check if script is enabled before doing anything
    if (!isScriptEnabled()) {
      log("⏸️ Script is disabled - skipping spike check", "warn");
      return;
    }

    // Get all table rows from watchlist using jQuery
    const rows = $(SELECTORS.TABLE_ROW);

    // Initialize arrays to store detected spikes by level and direction
    const detectedUps = { HIGH: [], MEDIUM: [], LOW: [] };
    const detectedDowns = { HIGH: [], MEDIUM: [], LOW: [] };

    // Track tokens to prevent duplicate alerts for same token+direction
    const processedTokens = new Set();

    log(
      `[${WATCHLIST_NAME}] Check #${++checkCounter}: Checking ${rows.length} rows...`,
    );

    // Inject Twitter links if enabled (every 10th iteration)
    injectTwitterLinks();

    // Process each row in watchlist using jQuery each
    rows.each(function () {
      const row = $(this);

      const h6Cell = row.find(SELECTORS.PRICE_CHANGE);
      removeHighlight(row[0], h6Cell[0]);

      // Extract spike data from the row (percentage, symbol, direction, level)
      const spikeData = extractSpikeData(row[0]); // row[0] to get DOM element
      if (!spikeData) return; // Skip if no spike detected

      const { symbol, isPositive, level } = spikeData;
      const direction = isPositive ? "UP" : "DOWN";
      const tokenKey = `${symbol}-${direction}`; // Unique key for each token+direction

      // Skip if we've already processed this token at a higher level
      // This ensures we only show the most important spike level (HIGH > MEDIUM > LOW)
      if (processedTokens.has(tokenKey)) return;

      // Highlight the row visually based on spike direction only if level is enabled
      if (SPIKE_THRESHOLDS[level].enabled) {
        highlightRow(row[0], h6Cell[0], isPositive);
      }

      // Check if this token should be notified based on its specific cooldown and enabled status
      if (shouldNotify(tokenKey, level) && SPIKE_THRESHOLDS[level].enabled) {
        // Get the token's URL from the row's href attribute
        const href = row.attr("href") || "";
        const sanitizedHref = sanitizeUrl(href);
        const url = sanitizedHref
          ? `https://dexscreener.com${sanitizedHref}`
          : "";

        // Create the alert message with emoji, symbol, percentage, link, and color based on spike level
        const levelColors = {
          HIGH: "#474646ff", // Red for high spikes
          MEDIUM: "#724a00", // Brown for medium spikes
          LOW: "#141402", // black for low spikes
        };

        const levelDots = {
          HIGH: "🔴", // Red circle for high spikes
          MEDIUM: "🟠", // Orange circle for medium spikes
          LOW: "🟡", // Yellow circle for low spikes
        };

        // const color = levelColors[level] || "#FFFFFF";
        const dot = levelDots[level] || "⚪";
        const message = `${dot} ${isPositive ? "🚀" : "📉"} <b><u>${symbol}</u></b> [$${spikeData.priceUSD}] [${isPositive ? "Pump" : "Dump"}-${level}]:  (<a href="${url}"><b>${isPositive ? "+" : ""}${spikeData.value}%</b></a>) [${WATCHLIST_NAME}]`;

        // console.log(message);

        // Store the message in the appropriate level array (pumping or dumping)
        if (isPositive) {
          detectedUps[level].push(message);
        } else {
          detectedDowns[level].push(message);
        }

        // Mark this token as processed to prevent lower level alerts for the same token+direction
        // Example: If BTC-UP was processed as HIGH, don't process it again as MEDIUM or LOW
        processedTokens.add(tokenKey);
      }
    });

    // Check if any spikes were detected
    const hasDetections =
      Object.values(detectedUps).some((arr) => arr.length > 0) ||
      Object.values(detectedDowns).some((arr) => arr.length > 0);

    // If spikes were detected, create and send notifications
    if (hasDetections) {
      let combinedMessage = "";

      // Add all pumping alerts (HIGH first, then MEDIUM, then LOW)
      ["HIGH", "MEDIUM", "LOW"].forEach((level) => {
        if (detectedUps[level].length > 0) {
          combinedMessage += detectedUps[level].join("\n") + "\n\n";
        }
      });

      // Add all dumping alerts (HIGH first, then MEDIUM, then LOW)
      ["HIGH", "MEDIUM", "LOW"].forEach((level) => {
        if (detectedDowns[level].length > 0) {
          combinedMessage += detectedDowns[level].join("\n") + "\n\n";
        }
      });

      // Send notifications based on enabled services for each level
      ["HIGH", "MEDIUM", "LOW"].forEach((level) => {
        const hasUps = detectedUps[level].length > 0;
        const hasDowns = detectedDowns[level].length > 0;

        if (hasUps || hasDowns) {
          let levelMessage = "";

          if (hasUps) {
            levelMessage +=
              // "🚀 PUMPING:\n" + detectedUps[level].join("\n") + "\n\n";
              detectedUps[level].join("\n") + "\n\n";
          }

          if (hasDowns) {
            levelMessage +=
              // "📉 DUMPING:\n" + detectedDowns[level].join("\n") + "\n\n";
              detectedDowns[level].join("\n") + "\n\n";
          }

          // Send Telegram notification if enabled for this level
          if (SPIKE_THRESHOLDS[level].telegram) {
            sendTelegramMessage(levelMessage);
          }

          // Send Pushbullet notification if enabled for this level
          if (SPIKE_THRESHOLDS[level].pushbullet) {
            const title = `DexScreener ${level} Spike Alert [${WATCHLIST_NAME}]`;
            sendPushbulletMessage(title, levelMessage);
          }
        }
      });
    }
  }

  function removeCustomElements() {
    try {
      const customElements = $(".custom-8atqhb, .custom-1igwmid");
      customElements.hide();
    } catch (error) {
      log("Error hiding custom elements:", error, "error");
    }
  }

  /**
   * Automatically sort the watchlist table by 24h column descending
   */
  function autoSortBy24h() {
    try {
      // Find the 24h column header using jQuery
      const header24h = $(".ds-table-th.ds-dex-table-th-price-change-h24");
      if (!header24h.length) {
        log("❌ 24h column header not found", "error");
        return;
      }

      // Find the sort button within the header
      const sortButton = header24h.find("button").length
        ? header24h.find("button")
        : header24h;
      if (!sortButton.length) {
        log("❌ Sort button not found in 24h header", "error");
        return;
      }

      // Wait a bit for the table to be fully loaded
      setTimeout(() => {
        // Click to sort (first click might sort ascending)
        sortButton[0].click();
      }, 1000);
    } catch (error) {
      log("❌ Error auto-sorting table:", error, "error");
    }
  }

  // ========== UI INJECTION FUNCTIONS ==========

  function injectSettingsIcon() {
    // Wait for the page to load completely
    setTimeout(() => {
      // Find the Manage button container using jQuery
      const $manageButton = $(".custom-7v7dei");

      if ($manageButton.length && !$("#dexscreener-settings-icon").length) {
        // Create settings icon button using jQuery
        const $settingsIcon = $("<button>", {
          id: "dexscreener-settings-icon",
          title: "DexScreener Alert Settings",
          html: "⚙️",
          css: {
            background: "rgba(5, 163, 123, 0.5)",
            fontSize: "16px",
            cursor: "pointer",
            padding: "6px 8px",
            borderRadius: "6px",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: "8px",
          },
        });

        // Add hover effects using jQuery
        $settingsIcon.on("mouseenter", function () {
          $(this).css({
            background: "rgba(5, 163, 123, 1)",
            transform: "scale(1.1)",
          });
        });

        $settingsIcon.on("mouseleave", function () {
          $(this).css({
            background: "rgba(5, 163, 123, 0.5)",
            transform: "scale(1)",
          });
        });

        // Add click event to open settings modal using jQuery
        $settingsIcon.on("click", function () {
          showSettingsModal();
        });

        // Inject into the manage button container using jQuery
        $manageButton.append($settingsIcon);

        log(
          "✅ DexScreener settings icon injected into Manage button container",
        );
      }
    }, 5000); // Wait 5 seconds for page to fully load
  }

  // ========== TWITTER QUICK SEARCH FUNCTIONS ==========

  let twitterLinkCounter = 0; // Counter to track iterations

  function injectTwitterLinks(forceImmediate = false) {
    if (!TWITTER_QUICK_SEARCH_ENABLED) return;

    twitterLinkCounter++;

    // Only inject on every 20th iteration, unless forced immediate
    if (!forceImmediate && twitterLinkCounter % 20 !== 0) {
      log(
        `Twitter Quick Search: Skipping iteration ${twitterLinkCounter} (not 20th)`,
      );
      return;
    }

    try {
      log(
        `Twitter Quick Search: Injecting links (iteration ${twitterLinkCounter})`,
      );

      // Find all token symbols in the table
      const tokenSymbols = $(SELECTORS.TOKEN_SYMBOL);

      tokenSymbols.each(function () {
        const $symbolElement = $(this);
        const symbol = $symbolElement.text().trim();

        if (symbol && symbol !== "Unknown") {
          // Check if already converted to link
          if ($symbolElement.is("a") || $symbolElement.parent("a").length) {
            return; // Skip if already a link
          }

          // Create Twitter search link
          const twitterUrl = `https://x.com/search?q=%24${symbol}&src=typed_query`;

          // Wrap the symbol with a link
          $symbolElement.wrap(
            `<a href="${twitterUrl}" target="_blank" style="color: inherit; text-decoration: none; cursor: pointer;"></a>`,
          );

          // Add hover effect
          const $link = $symbolElement.parent("a");
          $link
            .on("mouseenter", function () {
              $(this).css({
                "text-decoration": "underline",
                color: "#1da1f2",
              });
            })
            .on("mouseleave", function () {
              $(this).css({
                "text-decoration": "none",
                color: "inherit",
              });
            });
        }
      });

      log(
        `Twitter Quick Search: Links injected for ${tokenSymbols.length} tokens`,
      );
    } catch (error) {
      log(`Twitter Quick Search injection error:`, error, "error");
    }
  }

  function removeTwitterLinks() {
    try {
      log("Twitter Quick Search: Removing links");

      // Find all Twitter links and unwrap them
      $(SELECTORS.TOKEN_SYMBOL).each(function () {
        const $symbolElement = $(this);
        const $parent = $symbolElement.parent("a");

        if (
          $parent.length &&
          $parent.attr("href") &&
          $parent.attr("href").includes("x.com/search")
        ) {
          // Remove the link wrapper, keeping the symbol text
          $parent.replaceWith($symbolElement);
        }
      });

      log("Twitter Quick Search: Links removed");
    } catch (error) {
      log(`Twitter Quick Search removal error:`, error, "error");
    }
  }

  // ========== INITIALIZATION ==========

  function isScriptEnabled() {
    return SETTINGS.SCRIPT_ENABLED !== false;
  }

  function updateMonitoringState(isEnabled) {
    if (isEnabled) {
      log("🚀 Enabling monitoring");
      // Start monitoring if not already running
      if (!window.monitoringActive) {
        window.monitoringActive = true;
        checkForSpikes();
        setupDOMObserver();
      }
    } else {
      log("⏸️ Disabling monitoring");
      // Stop monitoring
      window.monitoringActive = false;
      // Clear any existing highlights
      $(SELECTORS.TABLE_ROW).each(function () {
        const row = $(this);
        const h6Cell = row.find(SELECTORS.PRICE_CHANGE);
        removeHighlight(row[0], h6Cell[0]);
      });
    }
  }

  function initializeMonitoring() {
    // Hide unwanted custom elements after 2 seconds delay
    // Auto-sort the table by 24h column descending
    setTimeout(() => {
      removeCustomElements();
      autoSortBy24h();
      // Get watchlist name after DOM is loaded
      WATCHLIST_NAME = getWatchlistName();

      // Reset counter and inject immediately if enabled by default or from settings
      twitterLinkCounter = 0;
      setTimeout(() => injectTwitterLinks(true), 1000); // Force immediate injection
    }, 3000);

    // Set up an interval to clean up old cooldowns
    setInterval(() => {
      const currentTokens = getCurrentTokens($(SELECTORS.TABLE_ROW)); // Get the current tokens from the watchlist
      cleanupOldCooldowns(currentTokens); // Clean up old cooldowns for tokens that are no longer in the watchlist or have expired their cooldowns
    }, CLEANUP_INTERVAL); // Run the function every CLEANUP_INTERVAL milliseconds

    const thresholds = Object.values(SETTINGS.SPIKE_THRESHOLDS)
      .map((config) => config.threshold)
      .sort((a, b) => b - a);

    // Start continuous monitoring for Firefox background operation
    if (typeof browser !== "undefined" && browser.runtime) {
      if (isScriptEnabled()) {
        browser.alarms.create({ periodInMinutes: 1 }, () => {
          if (window.monitoringActive) {
            checkForSpikes();
          }
        });
        log("🦊 Firefox background monitoring enabled");
      } else {
        log("⏸️ Script is disabled in settings", "warn");
      }
    } else {
      // Standard monitoring with DOM observer
      if (isScriptEnabled()) {
        window.monitoringActive = true;
        checkForSpikes();
        setupDOMObserver();
      } else {
        log("⏸️ Script is disabled in settings", "warn");
      }
    }
  }

  function setupDOMObserver() {
    const observer = new MutationObserver(() => {
      if (isScriptEnabled()) {
        checkForSpikes();
      } else {
        log("⏸️ Script is disabled - DOM observer skipping", "warn");
      }
    });
    setTimeout(() => {
      const target = $(SELECTORS.TABLE).length
        ? $(SELECTORS.TABLE)[0]
        : document.body;
      observer.observe(target, { childList: true, subtree: true });
    }, 2000);
  }

  function keepAlive() {
    requestAnimationFrame(keepAlive);
  }

  // ========== MAIN EXECUTION ==========

  // Load settings and register menu command
  loadSecureSettings();
  GM_registerMenuCommand("Dexscreener Alert Settings", showSettingsModal);

  // Start monitoring
  setTimeout(initializeMonitoring, 2000);

  injectSettingsIcon(); // Inject settings icon
  keepAlive();
})();
