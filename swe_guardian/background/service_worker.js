/**
 * Inevitably Productive: SWE Guardian - Service Worker
 * Handles tab management, desktop notifications, badge state, and persistent settings.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  strictness: 'balanced', // 'strict' | 'balanced' | 'lenient'
  countdownSeconds: 5,
  notifyOnClose: true,
  whitelistChannels: [
    "ThePrimeagen",
    "ByteByteGo",
    "Fireship",
    "Corey Schafer",
    "Hussein Nasser",
    "Low Level Learning",
    "Computerphile",
    "Continuous Delivery",
    "Sebastian Lague",
    "freeCodeCamp.org",
    "Zach Wilson",
    "Seattle Data Guy",
    "NeetCode",
    "Tech With Tim",
    "Traversy Media"
  ],
  whitelistKeywords: [
    "system design",
    "distributed systems",
    "kernel",
    "operating system",
    "compiler",
    "database",
    "linux",
    "concurrency",
    "asyncio",
    "performance engineering",
    "architecture",
    "sre",
    "devops",
    "data structures",
    "algorithms",
    "data engineering",
    "spark",
    "kafka",
    "airflow",
    "dbt",
    "snowflake",
    "bigquery",
    "databricks",
    "data pipeline",
    "sql",
    "computer science"
  ],
  stats: {
    totalChecked: 0,
    totalBlocked: 0,
    totalWhitelisted: 0
  },
  history: []
};

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.local.get(null);
  const initial = { ...DEFAULT_SETTINGS };

  // Preserve existing settings if upgrading
  if (details.reason === 'update') {
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      if (current[key] !== undefined) {
        initial[key] = current[key];
      }
    });
  }

  await chrome.storage.local.set(initial);
  updateBadge(initial.enabled);
  console.log('[SWE Guardian] Service worker installed and initialized.');
});

// Update extension icon badge
function updateBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald green
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' }); // Muted gray
  }
}

// Listen for storage changes to sync badge
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.enabled !== undefined) {
    updateBadge(changes.enabled.newValue);
  }
});

// Message listener for tab actions and telemetry
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'CLOSE_TAB': {
      handleCloseTab(message, sender);
      sendResponse({ status: 'ok' });
      break;
    }

    case 'LOG_VERDICT': {
      handleLogVerdict(message.payload);
      sendResponse({ status: 'ok' });
      break;
    }

    case 'GET_STATUS': {
      chrome.storage.local.get(null).then((data) => {
        sendResponse({ status: 'ok', data });
      });
      return true; // Keep message channel open for async response
    }

    case 'TOGGLE_EXTENSION': {
      chrome.storage.local.get(['enabled']).then(async (data) => {
        const nextState = !data.enabled;
        await chrome.storage.local.set({ enabled: nextState });
        updateBadge(nextState);
        sendResponse({ status: 'ok', enabled: nextState });
      });
      return true;
    }

    default:
      break;
  }
});

/**
 * Handle closing a tab when a non-SWE video is detected and countdown expires
 */
async function handleCloseTab(message, sender) {
  const tabId = sender?.tab?.id || message.tabId;
  const { title, channel, reason, videoId } = message;

  // Retrieve notification preference
  const { notifyOnClose = true, stats = { totalChecked: 0, totalBlocked: 0, totalWhitelisted: 0 } } =
    await chrome.storage.local.get(['notifyOnClose', 'stats']);

  // Increment blocked count
  stats.totalBlocked = (stats.totalBlocked || 0) + 1;
  await chrome.storage.local.set({ stats });

  // Close the tab
  if (tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (err) {
      console.warn('[SWE Guardian] Could not close tab:', err);
    }
  }

  // Show desktop notification if enabled
  if (notifyOnClose) {
    const cleanTitle = title ? (title.length > 55 ? title.substring(0, 52) + '...' : title) : 'Non-Engineering Video';
    const cleanReason = reason ? (reason.length > 100 ? reason.substring(0, 97) + '...' : reason) : 'Deemed not relevant for software/systems engineering.';

    try {
      chrome.notifications.create(`swe_guard_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Tab Closed: Filtered Distraction',
        message: `"${cleanTitle}"\n${channel ? `Channel: ${channel} • ` : ''}${cleanReason}`,
        priority: 1
      });
    } catch (notifErr) {
      console.warn('[SWE Guardian] Notification failed:', notifErr);
    }
  }
}

/**
 * Log evaluated video history and update total checked stats
 */
async function handleLogVerdict(payload) {
  if (!payload) return;

  const { stats = { totalChecked: 0, totalBlocked: 0, totalWhitelisted: 0 }, history = [] } =
    await chrome.storage.local.get(['stats', 'history']);

  stats.totalChecked = (stats.totalChecked || 0) + 1;
  if (payload.isWhitelisted) {
    stats.totalWhitelisted = (stats.totalWhitelisted || 0) + 1;
  }

  // Add to beginning of history, keep maximum 60 items
  const entry = {
    id: payload.videoId || `item_${Date.now()}`,
    title: payload.title || 'Unknown Title',
    channel: payload.channel || 'Unknown Channel',
    verdict: payload.verdict, // 'USEFUL' | 'NOT_USEFUL' | 'WHITELISTED'
    confidence: payload.confidence || 0,
    reason: payload.reason || '',
    category: payload.category || 'General',
    timestamp: Date.now(),
    url: payload.url || ''
  };

  const updatedHistory = [entry, ...history.filter(h => h.id !== entry.id)].slice(0, 60);

  await chrome.storage.local.set({ stats, history: updatedHistory });
}
