/**
 * Inevitably Productive: SWE Guardian - Isolated Content Script
 * Runs in YouTube's ISOLATED world.
 * Manages DOM inspection, YouTube SPA navigation, UI countdown overlay, whitelist checks,
 * and communicates with both background service worker and MAIN world evaluator.
 */

(function () {
  const MAIN_WORLD_ID = 'SWE_GUARD_MAIN_WORLD';
  const ISOLATED_WORLD_ID = 'SWE_GUARD_ISOLATED_WORLD';

  let currentVideoId = null;
  let activeCountdownTimer = null;
  let countdownRemaining = 5;
  let isEvaluating = false;
  let evaluatedVideosCache = new Map(); // videoId -> result

  console.log('[SWE Guardian] Isolated content script active on YouTube.');

  // Extract current video ID from URL
  function getVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/shorts/')[1].split('/')[0];
      }
    } catch (e) {}
    return null;
  }

  // Extract video metadata from YouTube DOM
  function extractVideoMetadata() {
    // Title
    const titleEl =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer') ||
      document.querySelector('h2.ytd-reel-player-header-renderer yt-formatted-string');
    
    let title = titleEl ? titleEl.textContent.trim() : '';
    if (!title && document.title) {
      title = document.title.replace(' - YouTube', '').trim();
    }

    // Channel Name
    const channelEl =
      document.querySelector('#owner #channel-name a') ||
      document.querySelector('ytd-channel-name a') ||
      document.querySelector('#upload-info #channel-name a') ||
      document.querySelector('ytd-reel-player-header-renderer #channel-name a');
    
    const channel = channelEl ? channelEl.textContent.trim() : '';

    // Description snippet
    const descEl =
      document.querySelector('#description-inline-expander') ||
      document.querySelector('#description yt-formatted-string') ||
      document.querySelector('meta[name="description"]');
    
    let description = '';
    if (descEl) {
      description = descEl.content || descEl.textContent || '';
      description = description.replace(/\s+/g, ' ').trim();
    }

    // Keywords/Tags
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    const tags = metaKeywords && metaKeywords.content
      ? metaKeywords.content.split(',').map(s => s.trim())
      : [];

    return { title, channel, description, tags, url: window.location.href, videoId: getVideoId() };
  }

  // Check if channel or keywords match the whitelist
  function isWhitelisted(metadata, settings) {
    const { whitelistChannels = [], whitelistKeywords = [] } = settings;

    // Check channel match (case-insensitive)
    const channelLower = (metadata.channel || '').toLowerCase();
    const channelMatch = whitelistChannels.some(c =>
      c.trim() && (channelLower === c.toLowerCase() || channelLower.includes(c.toLowerCase()))
    );
    if (channelMatch) {
      return { whitelisted: true, matchedType: 'channel', match: metadata.channel };
    }

    // Check title / tags / description keywords
    const contentText = `${metadata.title} ${(metadata.tags || []).join(' ')}`.toLowerCase();
    for (const kw of whitelistKeywords) {
      const cleanKw = kw.trim().toLowerCase();
      if (cleanKw && contentText.includes(cleanKw)) {
        return { whitelisted: true, matchedType: 'keyword', match: kw };
      }
    }

    return { whitelisted: false };
  }

  // Remove UI elements
  function removeOverlay() {
    if (activeCountdownTimer) {
      clearInterval(activeCountdownTimer);
      activeCountdownTimer = null;
    }
    const overlay = document.getElementById('swe-guardian-overlay');
    if (overlay) overlay.remove();
  }

  function removePill() {
    const pill = document.getElementById('swe-guardian-pill');
    if (pill) pill.remove();
  }

  // Show status pill in top right corner
  function showStatusPill(text, type = 'info', autoDismiss = 4000) {
    removePill();
    const pill = document.createElement('div');
    pill.id = 'swe-guardian-pill';

    let icon = '⚡';
    if (type === 'pulse') {
      pill.classList.add('swe-pulse');
      icon = '🤖';
    } else if (type === 'useful') {
      pill.classList.add('swe-useful');
      icon = '✅';
    } else if (type === 'whitelisted') {
      pill.classList.add('swe-whitelisted');
      icon = '⭐';
    }

    pill.innerHTML = `<span>${icon}</span><span>${text}</span>`;
    document.body.appendChild(pill);

    if (autoDismiss > 0) {
      setTimeout(() => {
        if (pill.parentNode) {
          pill.style.opacity = '0';
          pill.style.transform = 'translateY(-10px)';
          setTimeout(() => pill.remove(), 300);
        }
      }, autoDismiss);
    }
  }

  // Pause YouTube video
  function pauseVideo() {
    const video = document.querySelector('video');
    if (video && !video.paused) {
      try {
        video.pause();
      } catch (e) {}
    }
  }

  // Display Countdown and Tab Closure Overlay
  function showDistractionWarningModal(metadata, evalResult, settings) {
    removeOverlay();
    pauseVideo();

    const overlay = document.createElement('div');
    overlay.id = 'swe-guardian-overlay';

    countdownRemaining = settings.countdownSeconds !== undefined ? settings.countdownSeconds : 5;
    const initialCountdown = countdownRemaining;
    const perimeter = 251.2; // 2 * PI * r (r = 40)

    overlay.innerHTML = `
      <div class="swe-modal">
        <div class="swe-header-badge">
          🛡️ Non-Engineering Distraction Filtered
        </div>
        
        <div class="swe-timer-ring">
          <svg viewBox="0 0 90 90">
            <circle class="swe-timer-bg" cx="45" cy="45" r="40"></circle>
            <circle id="swe-ring-progress" class="swe-timer-progress" cx="45" cy="45" r="40"></circle>
          </svg>
          <div id="swe-countdown-num" class="swe-countdown-number">${countdownRemaining}</div>
        </div>

        <h2>Closing Tab to Preserve Focus</h2>
        <div class="swe-video-title" title="${escapeHtml(metadata.title)}">"${escapeHtml(metadata.title)}"</div>

        <div class="swe-reason-box">
          <div class="swe-reason-label">
            <span>Model Verdict</span>
            <span class="swe-model-badge">${escapeHtml(evalResult.engine || 'Gemini Nano')}</span>
          </div>
          <p class="swe-reason-text">${escapeHtml(evalResult.reason || 'Deemed not relevant for software or systems engineering.')}</p>
        </div>

        <div class="swe-actions">
          <div class="swe-actions-primary">
            <button id="swe-close-now-btn" class="swe-btn swe-btn-danger">
              Close Tab Now (${countdownRemaining}s)
            </button>
            <button id="swe-cancel-btn" class="swe-btn swe-btn-cancel">
              Keep Tab (Cancel)
            </button>
          </div>
          <div class="swe-actions-secondary">
            <button id="swe-whitelist-channel-btn" class="swe-btn-whitelist">
              + Whitelist "${escapeHtml(metadata.channel || 'Channel')}"
            </button>
            <button id="swe-whitelist-video-btn" class="swe-btn-whitelist">
              + Whitelist This Video
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const countdownNumEl = document.getElementById('swe-countdown-num');
    const ringProgressEl = document.getElementById('swe-ring-progress');
    const closeNowBtn = document.getElementById('swe-close-now-btn');
    const cancelBtn = document.getElementById('swe-cancel-btn');
    const whitelistChannelBtn = document.getElementById('swe-whitelist-channel-btn');
    const whitelistVideoBtn = document.getElementById('swe-whitelist-video-btn');

    // Trigger tab close via service worker
    const triggerTabClose = () => {
      removeOverlay();
      chrome.runtime.sendMessage({
        type: 'CLOSE_TAB',
        title: metadata.title,
        channel: metadata.channel,
        reason: evalResult.reason,
        videoId: metadata.videoId
      });
    };

    // Button event listeners
    closeNowBtn.addEventListener('click', () => {
      triggerTabClose();
    });

    cancelBtn.addEventListener('click', () => {
      removeOverlay();
      showStatusPill('Tab kept. Filter bypassed for this session.', 'info', 3000);
    });

    whitelistChannelBtn.addEventListener('click', async () => {
      removeOverlay();
      await addChannelToWhitelist(metadata.channel);
      showStatusPill(`Whitelisted channel: ${metadata.channel}`, 'whitelisted', 3500);
    });

    whitelistVideoBtn.addEventListener('click', async () => {
      removeOverlay();
      await addKeywordToWhitelist(metadata.title);
      showStatusPill('Whitelisted this video title.', 'whitelisted', 3500);
    });

    // Start Countdown
    activeCountdownTimer = setInterval(() => {
      countdownRemaining--;
      if (countdownNumEl) countdownNumEl.textContent = countdownRemaining;
      if (closeNowBtn) closeNowBtn.textContent = `Close Tab Now (${countdownRemaining}s)`;

      // Animate SVG ring progress
      if (ringProgressEl && initialCountdown > 0) {
        const offset = perimeter - (perimeter * (countdownRemaining / initialCountdown));
        ringProgressEl.style.strokeDashoffset = offset;
      }

      if (countdownRemaining <= 0) {
        clearInterval(activeCountdownTimer);
        activeCountdownTimer = null;
        triggerTabClose();
      }
    }, 1000);
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

  async function addChannelToWhitelist(channel) {
    if (!channel) return;
    const { whitelistChannels = [] } = await chrome.storage.local.get(['whitelistChannels']);
    if (!whitelistChannels.includes(channel)) {
      whitelistChannels.push(channel);
      await chrome.storage.local.set({ whitelistChannels });
    }
  }

  async function addKeywordToWhitelist(keyword) {
    if (!keyword) return;
    const { whitelistKeywords = [] } = await chrome.storage.local.get(['whitelistKeywords']);
    if (!whitelistKeywords.includes(keyword)) {
      whitelistKeywords.push(keyword);
      await chrome.storage.local.set({ whitelistKeywords });
    }
  }

  // Perform evaluation by communicating with MAIN world evaluator
  async function evaluateCurrentVideo() {
    const videoId = getVideoId();
    if (!videoId) {
      removeOverlay();
      removePill();
      return;
    }

    // Prevent re-evaluating the exact same video if already decided in this page
    if (videoId === currentVideoId && isEvaluating) return;
    currentVideoId = videoId;
    removeOverlay();

    // Check extension settings
    const settings = await chrome.storage.local.get([
      'enabled',
      'strictness',
      'countdownSeconds',
      'whitelistChannels',
      'whitelistKeywords'
    ]);

    if (settings.enabled === false) {
      removeOverlay();
      removePill();
      return;
    }

    // Wait briefly for YouTube's DOM to populate title/channel
    await new Promise(r => setTimeout(r, 600));

    const metadata = extractVideoMetadata();
    if (!metadata.title) {
      // Retry once if title wasn't ready
      await new Promise(r => setTimeout(r, 800));
      Object.assign(metadata, extractVideoMetadata());
    }

    // 1. Check Whitelist first
    const whitelistStatus = isWhitelisted(metadata, settings);
    if (whitelistStatus.whitelisted) {
      console.log(`[SWE Guardian] Whitelisted video: "${metadata.title}" by ${whitelistStatus.matchedType}: ${whitelistStatus.match}`);
      showStatusPill(`⭐ Whitelisted (${whitelistStatus.match})`, 'whitelisted', 3500);

      // Log to telemetry/history
      chrome.runtime.sendMessage({
        type: 'LOG_VERDICT',
        payload: {
          videoId,
          title: metadata.title,
          channel: metadata.channel,
          verdict: 'WHITELISTED',
          isWhitelisted: true,
          confidence: 100,
          reason: `Matched whitelisted ${whitelistStatus.matchedType}: "${whitelistStatus.match}"`,
          category: 'Whitelisted',
          url: metadata.url
        }
      });
      return;
    }

    // 2. Check in-memory cache for this video
    if (evaluatedVideosCache.has(videoId)) {
      const cached = evaluatedVideosCache.get(videoId);
      if (cached.verdict === 'NOT_USEFUL') {
        showDistractionWarningModal(metadata, cached, settings);
      }
      return;
    }

    // 3. Request evaluation from Gemini Nano (MAIN world evaluator)
    isEvaluating = true;
    showStatusPill('Evaluating SWE relevance with Gemini Nano...', 'pulse', 0);

    const requestId = `eval_${Date.now()}_${Math.random()}`;

    const handleEvaluationResponse = (event) => {
      if (
        event.source !== window ||
        !event.data ||
        event.data.target !== ISOLATED_WORLD_ID ||
        event.data.requestId !== requestId
      ) {
        return;
      }

      window.removeEventListener('message', handleEvaluationResponse);
      isEvaluating = false;

      const evalResult = event.data.payload;
      evaluatedVideosCache.set(videoId, evalResult);

      // Log to background service worker
      chrome.runtime.sendMessage({
        type: 'LOG_VERDICT',
        payload: {
          videoId,
          title: metadata.title,
          channel: metadata.channel,
          verdict: evalResult.verdict,
          confidence: evalResult.confidence,
          reason: evalResult.reason,
          category: evalResult.category,
          engine: evalResult.engine,
          url: metadata.url
        }
      });

      if (evalResult.verdict === 'USEFUL') {
        showStatusPill(`✅ SWE Verified (${evalResult.category || 'Useful'})`, 'useful', 4000);
      } else {
        removePill();
        showDistractionWarningModal(metadata, evalResult, settings);
      }
    };

    window.addEventListener('message', handleEvaluationResponse);

    // Dispatch message to MAIN world evaluator
    window.postMessage({
      target: MAIN_WORLD_ID,
      requestId,
      type: 'EVALUATE_VIDEO',
      payload: {
        videoData: metadata,
        strictness: settings.strictness || 'balanced'
      }
    }, '*');

    // Timeout safety net (in case model hangs or is unresponsive)
    setTimeout(() => {
      if (isEvaluating) {
        window.removeEventListener('message', handleEvaluationResponse);
        isEvaluating = false;
        removePill();
        console.warn('[SWE Guardian] Evaluation timed out. Bypassing check.');
      }
    }, 12000);
  }

  // YouTube navigation listeners
  window.addEventListener('yt-navigate-finish', () => {
    evaluateCurrentVideo();
  });

  window.addEventListener('spfdone', () => {
    evaluateCurrentVideo();
  });

  // Watch for popstate or URL changes
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (getVideoId()) {
        evaluateCurrentVideo();
      } else {
        removeOverlay();
        removePill();
      }
    }
  });
  observer.observe(document, { subtree: true, childList: true });

  // Storage listener for live toggle
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.enabled && changes.enabled.newValue === false) {
        removeOverlay();
        removePill();
      }
    }
  });

  // Initial run on script load
  if (getVideoId()) {
    evaluateCurrentVideo();
  }

})();
