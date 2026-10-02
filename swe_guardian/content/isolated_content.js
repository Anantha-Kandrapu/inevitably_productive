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

  // Curated pool of 50 distinct psychological friction phrases to destroy muscle-memory bypassing
  const FRICTION_PHRASES = [
    "I am choosing to procrastinate on my engineering goals",
    "This video is not making me a better engineer",
    "I am actively avoiding deep work and hard problems",
    "My future self will regret watching this distraction",
    "I am trading my focus and time for cheap dopamine",
    "This content will not help me build better software",
    "I am ignoring my engineering priorities right now",
    "I am wasting valuable hours of my life on fluff",
    "I am giving in to distraction instead of shipping code",
    "This entertainment is stealing my prime cognitive energy",
    "I am procrastinating instead of mastering my craft",
    "I am choosing short term pleasure over long term mastery",
    "Watching this video will not advance my career",
    "I am letting an algorithm dictate my attention span",
    "I am choosing brain rot over technical excellence",
    "I am running away from the code I need to write",
    "This distraction is a conscious waste of my potential",
    "I am sabotaging my productivity and focus today",
    "I am surrendering my discipline to mindless entertainment",
    "I will have to work late because I am watching this",
    "This video does not solve any distributed systems problems",
    "I am consuming passive content instead of creating value",
    "I am letting distraction defeat my professional ambition",
    "I am trading real progress for empty entertainment",
    "I am stalling because the actual work is mentally demanding",
    "This clickbait will be completely forgotten in an hour",
    "I am choosing comfort over engineering growth",
    "I am choosing to fall behind on my technical roadmap",
    "I acknowledge that watching this is counterproductive",
    "I am allowing this tab to derail my momentum",
    "I am prioritizing boredom relief over my ambitions",
    "This content will not help me pass any technical interview",
    "I am letting YouTube recommendations control my schedule",
    "I am escaping into fluff instead of solving hard bugs",
    "I know I should close this tab and get back to work",
    "I am trading my peak mental hours for internet noise",
    "This tab is an obstacle between me and my goals",
    "I am choosing to be distracted instead of building systems",
    "I am giving away my attention to low value media",
    "I am rationalizing a distraction that I know is useless",
    "I am delaying my success by watching this video",
    "I am consciously choosing to lose momentum on my project",
    "This video will not teach me how to design scalable architectures",
    "I am choosing passive consumption over active learning",
    "I am letting procrastination take control of my day",
    "I am sacrificing my focus on the altar of boredom",
    "I am choosing entertainment over engineering discipline",
    "I know this content has zero technical or educational value",
    "I am wasting my focus and I will regret this later",
    "I am overriding the guardian because I lack discipline right now"
  ];

  // Display Countdown and Tab Closure Overlay
  function showDistractionWarningModal(metadata, evalResult, settings) {
    removeOverlay();
    pauseVideo();

    const overlay = document.createElement('div');
    overlay.id = 'swe-guardian-overlay';

    countdownRemaining = settings.countdownSeconds !== undefined ? settings.countdownSeconds : 5;
    const initialCountdown = countdownRemaining;
    const perimeter = 251.2; // 2 * PI * r (r = 40)

    // Select a random phrase from the 50 friction phrases
    const requiredPhrase = FRICTION_PHRASES[Math.floor(Math.random() * FRICTION_PHRASES.length)];

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
          <button id="swe-close-now-btn" class="swe-btn swe-btn-danger">
            Close Tab Now (${countdownRemaining}s)
          </button>
          
          <div class="swe-override-section">
            <button id="swe-toggle-override-btn" class="swe-override-link">
              Emergency Override (Keep Tab)...
            </button>
            <div id="swe-override-box" class="swe-override-box hidden">
              <div class="swe-friction-prompt">
                To override, manually type the exact phrase below (no paste):
                <strong>"${escapeHtml(requiredPhrase)}"</strong>
              </div>
              <div class="swe-friction-input-row">
                <input type="text" id="swe-friction-input" placeholder="Type exact phrase to unlock..." autocomplete="off">
                <button id="swe-confirm-override-btn" class="swe-btn-confirm-override" disabled>Keep Tab</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const countdownNumEl = document.getElementById('swe-countdown-num');
    const ringProgressEl = document.getElementById('swe-ring-progress');
    const closeNowBtn = document.getElementById('swe-close-now-btn');
    const toggleOverrideBtn = document.getElementById('swe-toggle-override-btn');
    const overrideBox = document.getElementById('swe-override-box');
    const frictionInput = document.getElementById('swe-friction-input');
    const confirmOverrideBtn = document.getElementById('swe-confirm-override-btn');

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

    closeNowBtn.addEventListener('click', () => {
      triggerTabClose();
    });

    // High friction override logic with anti-paste
    toggleOverrideBtn.addEventListener('click', () => {
      overrideBox.classList.toggle('hidden');
      if (!overrideBox.classList.contains('hidden')) {
        frictionInput.focus();
      }
    });

    // Prevent pasting to enforce conscious typing
    frictionInput.addEventListener('paste', (e) => {
      e.preventDefault();
      showStatusPill('Pasting disabled! You must physically type the phrase.', 'info', 3000);
    });

    frictionInput.addEventListener('input', () => {
      if (frictionInput.value.trim().toLowerCase() === requiredPhrase.toLowerCase()) {
        confirmOverrideBtn.disabled = false;
      } else {
        confirmOverrideBtn.disabled = true;
      }
    });

    confirmOverrideBtn.addEventListener('click', () => {
      if (frictionInput.value.trim().toLowerCase() === requiredPhrase.toLowerCase()) {
        removeOverlay();
        showStatusPill('Tab kept via override. Stay disciplined!', 'info', 4000);
      }
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
  async function evaluateCurrentVideo(force = false) {
    const videoId = getVideoId();
    if (!videoId) {
      removeOverlay();
      removePill();
      return;
    }

    // Prevent re-evaluating the exact same video unless forced or not evaluating
    if (!force && videoId === currentVideoId && isEvaluating) return;
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

    // Check in-memory cache for this video unless forced
    if (!force && evaluatedVideosCache.has(videoId)) {
      const cached = evaluatedVideosCache.get(videoId);
      if (cached.verdict === 'NOT_USEFUL') {
        const metadata = extractVideoMetadata();
        showDistractionWarningModal(metadata, cached, settings);
      }
      return;
    }

    // Wait briefly for YouTube's DOM to populate fresh title/channel
    await new Promise(r => setTimeout(r, 600));

    let metadata = extractVideoMetadata();
    if (!metadata.title || metadata.title.toLowerCase().startsWith('youtube')) {
      // Retry if title wasn't updated yet
      await new Promise(r => setTimeout(r, 600));
      metadata = extractVideoMetadata();
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
        showStatusPill(`✅ SWE Verified: ${evalResult.reason || 'Useful'}`, 'useful', 5000);
      } else if (evalResult.verdict === 'NOT_USEFUL') {
        removePill();
        showDistractionWarningModal(metadata, evalResult, settings);
      } else {
        // Model error or downloading: NEVER close the tab! Display honest status.
        console.warn('[SWE Guardian]', evalResult.reason);
        showStatusPill(`⚠️ ${evalResult.reason || 'Gemini Nano not ready (tab kept)'}`, 'info', 7000);
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

    // Generous timeout safety net for on-device local model inference
    setTimeout(() => {
      if (isEvaluating && currentVideoId === videoId) {
        window.removeEventListener('message', handleEvaluationResponse);
        isEvaluating = false;
        removePill();
        console.warn('[SWE Guardian] Evaluation timed out. Bypassing check.');
      }
    }, 35000);
  }

  // Debounced navigation handler to prevent concurrent prompt collisions
  let navDebounce = null;
  function scheduleEvaluation(force = false) {
    clearTimeout(navDebounce);
    navDebounce = setTimeout(() => {
      evaluateCurrentVideo(force);
    }, 400);
  }

  // 1. Listen for background sweep messages from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'FORCE_REEVALUATE') {
      console.log('[SWE Guardian] Received FORCE_REEVALUATE command from background sweep.');
      evaluatedVideosCache.delete(getVideoId());
      scheduleEvaluation(true);
      sendResponse({ status: 'ok' });
    }
  });

  // 2. Active Heartbeat (runs every 750ms)
  // Ensures video transitions via autoplay, playlists, or recommended clicks NEVER slip past
  setInterval(() => {
    const activeVid = getVideoId();
    if (activeVid && activeVid !== currentVideoId) {
      console.log(`[SWE Guardian] Heartbeat detected video transition: ${currentVideoId} -> ${activeVid}`);
      isEvaluating = false;
      currentVideoId = null; // Reset so evaluation proceeds
      scheduleEvaluation();
    }
  }, 750);

  // 3. In-tab Periodic Sweep (runs every 5 minutes on already-open tabs)
  setInterval(() => {
    const activeVid = getVideoId();
    if (activeVid) {
      console.log('[SWE Guardian] Running 5-minute periodic sweep on active tab.');
      scheduleEvaluation(true);
    }
  }, 5 * 60 * 1000);

  // 4. YouTube SPA Event Listeners (attached to document, window, and popstate)
  document.addEventListener('yt-navigate-finish', () => scheduleEvaluation());
  document.addEventListener('yt-page-data-updated', () => scheduleEvaluation());
  window.addEventListener('yt-navigate-finish', () => scheduleEvaluation());
  window.addEventListener('spfdone', () => scheduleEvaluation());
  window.addEventListener('popstate', () => scheduleEvaluation());

  // Watch for DOM URL changes
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (getVideoId()) {
        scheduleEvaluation();
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
    scheduleEvaluation();
  }

})();
