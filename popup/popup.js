/**
 * Inevitably Productive: SWE Guardian - Popup Controller
 * Manages UI tabs, whitelist, live model capabilities check, stats, and real-time settings.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const masterToggle = document.getElementById('master-toggle');
  const footerStatusText = document.getElementById('footer-status-text');
  const statusDot = document.getElementById('status-dot');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const helpBtn = document.getElementById('help-btn');
  const helpDrawer = document.getElementById('help-drawer');
  const closeHelpBtn = document.getElementById('close-help-btn');

  // Active YouTube Context Elements
  const ytCard = document.getElementById('youtube-context-card');
  const ytTitleEl = document.getElementById('yt-video-title');
  const ytChannelEl = document.getElementById('yt-channel-name');
  const ytBadgeEl = document.getElementById('yt-eval-badge');
  const quickWhitelistChannelBtn = document.getElementById('quick-whitelist-channel');
  const quickWhitelistVideoBtn = document.getElementById('quick-whitelist-video');

  // Stats Elements
  const statBlocked = document.getElementById('stat-blocked');
  const statChecked = document.getElementById('stat-checked');
  const statWhitelisted = document.getElementById('stat-whitelisted');
  const strictnessSummary = document.getElementById('strictness-summary-text');

  // Whitelist Elements
  const channelCount = document.getElementById('channel-count');
  const newChannelInput = document.getElementById('new-channel-input');
  const addChannelBtn = document.getElementById('add-channel-btn');
  const channelTagsList = document.getElementById('channel-tags-list');

  const keywordCount = document.getElementById('keyword-count');
  const newKeywordInput = document.getElementById('new-keyword-input');
  const addKeywordBtn = document.getElementById('add-keyword-btn');
  const keywordTagsList = document.getElementById('keyword-tags-list');

  // Settings Elements
  const strictnessSelect = document.getElementById('strictness-select');
  const countdownSelect = document.getElementById('countdown-select');
  const notifyToggle = document.getElementById('notify-toggle');

  // History Elements
  const historyContainer = document.getElementById('history-items-container');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  // Navigation Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Current tab state
  let currentActiveTab = null;
  let currentYtChannel = '';
  let currentYtTitle = '';

  // Tab Switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(`tab-${btn.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Help Drawer Toggle
  helpBtn.addEventListener('click', () => {
    helpDrawer.classList.toggle('hidden');
  });
  closeHelpBtn.addEventListener('click', () => {
    helpDrawer.classList.add('hidden');
  });

  // Load and apply initial state
  await loadSettings();
  await checkPromptAPIStatus();
  await inspectCurrentTab();

  // Master Toggle Change
  masterToggle.addEventListener('change', async () => {
    const isEnabled = masterToggle.checked;
    await chrome.storage.local.set({ enabled: isEnabled });
    updateMasterStatusUI(isEnabled);
  });

  // Settings Changes
  strictnessSelect.addEventListener('change', async () => {
    const val = strictnessSelect.value;
    await chrome.storage.local.set({ strictness: val });
    updateStrictnessSummary(val);
  });

  countdownSelect.addEventListener('change', async () => {
    const val = parseInt(countdownSelect.value, 10);
    await chrome.storage.local.set({ countdownSeconds: val });
  });

  notifyToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ notifyOnClose: notifyToggle.checked });
  });

  // Whitelist: Add Channel
  addChannelBtn.addEventListener('click', () => handleAddChannel());
  newChannelInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddChannel();
  });

  // Whitelist: Add Keyword
  addKeywordBtn.addEventListener('click', () => handleAddKeyword());
  newKeywordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddKeyword();
  });

  // History: Clear
  clearHistoryBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ history: [] });
    renderHistory([]);
  });

  // Quick Action Buttons on Active YouTube tab
  quickWhitelistChannelBtn.addEventListener('click', async () => {
    if (!currentYtChannel) return;
    await addChannel(currentYtChannel);
    quickWhitelistChannelBtn.textContent = '✓ Channel Whitelisted';
    quickWhitelistChannelBtn.disabled = true;
  });

  quickWhitelistVideoBtn.addEventListener('click', async () => {
    if (!currentYtTitle) return;
    await addKeyword(currentYtTitle);
    quickWhitelistVideoBtn.textContent = '✓ Video Whitelisted';
    quickWhitelistVideoBtn.disabled = true;
  });

  /**
   * Load storage settings
   */
  async function loadSettings() {
    const data = await chrome.storage.local.get([
      'enabled',
      'strictness',
      'countdownSeconds',
      'notifyOnClose',
      'whitelistChannels',
      'whitelistKeywords',
      'stats',
      'history'
    ]);

    const isEnabled = data.enabled !== false;
    masterToggle.checked = isEnabled;
    updateMasterStatusUI(isEnabled);

    if (data.strictness) {
      strictnessSelect.value = data.strictness;
      updateStrictnessSummary(data.strictness);
    }

    if (data.countdownSeconds !== undefined) {
      countdownSelect.value = data.countdownSeconds;
    }

    if (data.notifyOnClose !== undefined) {
      notifyToggle.checked = data.notifyOnClose;
    }

    // Stats
    const stats = data.stats || { totalChecked: 0, totalBlocked: 0, totalWhitelisted: 0 };
    statBlocked.textContent = stats.totalBlocked || 0;
    statChecked.textContent = stats.totalChecked || 0;
    statWhitelisted.textContent = stats.totalWhitelisted || 0;

    // Whitelists
    renderWhitelistChannels(data.whitelistChannels || []);
    renderWhitelistKeywords(data.whitelistKeywords || []);

    // History
    renderHistory(data.history || []);
  }

  function updateMasterStatusUI(isEnabled) {
    if (isEnabled) {
      footerStatusText.textContent = 'SWE Guardian Active';
      footerStatusText.style.color = '#10b981';
    } else {
      footerStatusText.textContent = 'SWE Guardian Paused';
      footerStatusText.style.color = '#94a3b8';
    }
  }

  function updateStrictnessSummary(strictness) {
    if (strictness === 'strict') {
      strictnessSummary.textContent = 'Ultra-Strict: Only core systems engineering, kernel/OS internals, algorithms, and low-level architecture pass.';
    } else if (strictness === 'lenient') {
      strictnessSummary.textContent = 'Lenient: Allows all general tech and programming; only blocks blatant entertainment, drama, and non-tech fluff.';
    } else {
      strictnessSummary.textContent = 'Balanced: Permits real coding tutorials, system design, DevOps/SRE, and SWE deep dives; filters non-engineering fluff.';
    }
  }

  /**
   * Check Prompt API & Gemini Nano availability in browser
   */
  async function checkPromptAPIStatus() {
    try {
      const aiObject = window.ai || (typeof ai !== 'undefined' ? ai : null);
      if (aiObject && aiObject.languageModel) {
        if (typeof aiObject.languageModel.capabilities === 'function') {
          const caps = await aiObject.languageModel.capabilities();
          if (caps.available === 'readily') {
            statusDot.className = 'status-indicator-dot ready';
            statusTitle.textContent = 'Gemini Nano: Ready';
            statusDesc.textContent = 'On-device Prompt API active';
            return;
          } else if (caps.available === 'after-download') {
            statusDot.className = 'status-indicator-dot';
            statusTitle.textContent = 'Gemini Nano: Downloading';
            statusDesc.textContent = 'Chrome is downloading model weights';
            return;
          }
        } else {
          statusDot.className = 'status-indicator-dot ready';
          statusTitle.textContent = 'Gemini Nano: Available';
          statusDesc.textContent = 'Chrome Prompt API detected';
          return;
        }
      }
    } catch (e) {}

    // Fallback status
    statusDot.className = 'status-indicator-dot';
    statusTitle.textContent = 'Heuristic Engine Active';
    statusDesc.textContent = 'Enable #prompt-api for Gemini Nano';
  }

  /**
   * Check if current active tab is a YouTube video
   */
  async function inspectCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;

      currentActiveTab = tab;
      const url = new URL(tab.url);

      if (url.hostname.includes('youtube.com') && (url.pathname === '/watch' || url.pathname.startsWith('/shorts/'))) {
        ytCard.classList.remove('hidden');

        // Extract title from tab title
        currentYtTitle = tab.title ? tab.title.replace(' - YouTube', '').trim() : 'YouTube Video';
        ytTitleEl.textContent = `"${currentYtTitle}"`;

        // Check if tab is in recent history
        const { history = [], whitelistChannels = [], whitelistKeywords = [] } =
          await chrome.storage.local.get(['history', 'whitelistChannels', 'whitelistKeywords']);

        const recentMatch = history.find(h => h.url === tab.url || tab.title.includes(h.title));
        if (recentMatch) {
          currentYtChannel = recentMatch.channel;
          ytChannelEl.textContent = `Channel: ${recentMatch.channel || 'Unknown'}`;

          if (recentMatch.verdict === 'USEFUL') {
            ytBadgeEl.textContent = 'Verified Useful';
            ytBadgeEl.className = 'badge useful';
          } else if (recentMatch.verdict === 'WHITELISTED') {
            ytBadgeEl.textContent = 'Whitelisted';
            ytBadgeEl.className = 'badge whitelisted';
          } else {
            ytBadgeEl.textContent = 'Non-SWE Distraction';
            ytBadgeEl.className = 'badge blocked';
          }
        } else {
          ytChannelEl.textContent = 'Monitoring video...';
          ytBadgeEl.textContent = 'Active';
          ytBadgeEl.className = 'badge useful';
        }
      } else {
        ytCard.classList.add('hidden');
      }
    } catch (err) {
      console.warn('[SWE Guardian] Could not inspect tab:', err);
    }
  }

  /**
   * Whitelist Management: Channels
   */
  function renderWhitelistChannels(channels) {
    channelCount.textContent = channels.length;
    channelTagsList.innerHTML = '';

    channels.forEach(ch => {
      const tag = document.createElement('span');
      tag.className = 'tag-item';
      tag.innerHTML = `
        <span>${escapeHtml(ch)}</span>
        <span class="tag-remove" data-item="${escapeHtml(ch)}">&times;</span>
      `;

      tag.querySelector('.tag-remove').addEventListener('click', async (e) => {
        const itemToRemove = e.target.getAttribute('data-item');
        await removeChannel(itemToRemove);
      });

      channelTagsList.appendChild(tag);
    });
  }

  async function handleAddChannel() {
    const val = newChannelInput.value.trim();
    if (!val) return;
    await addChannel(val);
    newChannelInput.value = '';
  }

  async function addChannel(channelName) {
    const { whitelistChannels = [] } = await chrome.storage.local.get(['whitelistChannels']);
    if (!whitelistChannels.includes(channelName)) {
      const updated = [...whitelistChannels, channelName];
      await chrome.storage.local.set({ whitelistChannels: updated });
      renderWhitelistChannels(updated);
    }
  }

  async function removeChannel(channelName) {
    const { whitelistChannels = [] } = await chrome.storage.local.get(['whitelistChannels']);
    const updated = whitelistChannels.filter(c => c !== channelName);
    await chrome.storage.local.set({ whitelistChannels: updated });
    renderWhitelistChannels(updated);
  }

  /**
   * Whitelist Management: Keywords
   */
  function renderWhitelistKeywords(keywords) {
    keywordCount.textContent = keywords.length;
    keywordTagsList.innerHTML = '';

    keywords.forEach(kw => {
      const tag = document.createElement('span');
      tag.className = 'tag-item';
      tag.innerHTML = `
        <span>${escapeHtml(kw)}</span>
        <span class="tag-remove" data-item="${escapeHtml(kw)}">&times;</span>
      `;

      tag.querySelector('.tag-remove').addEventListener('click', async (e) => {
        const itemToRemove = e.target.getAttribute('data-item');
        await removeKeyword(itemToRemove);
      });

      keywordTagsList.appendChild(tag);
    });
  }

  async function handleAddKeyword() {
    const val = newKeywordInput.value.trim().toLowerCase();
    if (!val) return;
    await addKeyword(val);
    newKeywordInput.value = '';
  }

  async function addKeyword(keyword) {
    const { whitelistKeywords = [] } = await chrome.storage.local.get(['whitelistKeywords']);
    if (!whitelistKeywords.includes(keyword)) {
      const updated = [...whitelistKeywords, keyword];
      await chrome.storage.local.set({ whitelistKeywords: updated });
      renderWhitelistKeywords(updated);
    }
  }

  async function removeKeyword(keyword) {
    const { whitelistKeywords = [] } = await chrome.storage.local.get(['whitelistKeywords']);
    const updated = whitelistKeywords.filter(k => k !== keyword);
    await chrome.storage.local.set({ whitelistKeywords: updated });
    renderWhitelistKeywords(updated);
  }

  /**
   * Render History
   */
  function renderHistory(history) {
    if (!history || history.length === 0) {
      historyContainer.innerHTML = '<div class="empty-state">No evaluations recorded yet. Open YouTube to begin!</div>';
      return;
    }

    historyContainer.innerHTML = '';
    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';

      let badgeClass = 'useful';
      let badgeText = 'Useful';
      if (item.verdict === 'NOT_USEFUL') {
        badgeClass = 'blocked';
        badgeText = 'Closed';
      } else if (item.verdict === 'WHITELISTED') {
        badgeClass = 'whitelisted';
        badgeText = 'Whitelisted';
      }

      card.innerHTML = `
        <div class="history-card-top">
          <div class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="history-channel">${escapeHtml(item.channel || 'Unknown Channel')}</div>
        ${item.reason ? `<div class="history-reason">${escapeHtml(item.reason)}</div>` : ''}
      `;

      historyContainer.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
