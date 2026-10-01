/**
 * Inevitably Productive: SWE Guardian - Main World Evaluator
 * Directly executes Chrome's on-device Gemini Nano (Prompt API).
 * Pure LLM evaluation - NO dumb keyword matching.
 */

(function () {
  const SENDER_ID = 'SWE_GUARD_MAIN_WORLD';
  const TARGET_ID = 'SWE_GUARD_ISOLATED_WORLD';

  console.log('[SWE Guardian] Evaluator running in YouTube MAIN world.');

  // Find Chrome's built-in Prompt API
  function getAI() {
    if (typeof window !== 'undefined' && window.ai?.languageModel) return window.ai;
    if (typeof ai !== 'undefined' && ai.languageModel) return ai;
    if (typeof window !== 'undefined' && window.LanguageModel) return { languageModel: window.LanguageModel };
    return null;
  }

  /**
   * Check Gemini Nano status directly from the browser
   */
  async function checkStatus() {
    const aiObj = getAI();
    if (!aiObj?.languageModel) {
      return {
        ready: false,
        status: 'not_found',
        message: 'window.ai.languageModel not found. Enable #prompt-api in chrome://flags and relaunch.'
      };
    }

    try {
      if (typeof aiObj.languageModel.capabilities === 'function') {
        const caps = await aiObj.languageModel.capabilities();
        return {
          ready: caps.available === 'readily',
          status: caps.available, // 'readily' | 'after-download' | 'no'
          capabilities: caps
        };
      }
      return { ready: true, status: 'readily' };
    } catch (err) {
      return { ready: false, status: 'error', message: err.message };
    }
  }

  /**
   * Pure Gemini Nano LLM Evaluation
   */
  async function evaluateWithGeminiNano(videoData) {
    const aiObj = getAI();
    if (!aiObj?.languageModel) {
      throw new Error('Chrome Prompt API (window.ai.languageModel) is NOT available in this browser window. Please check chrome://flags/#prompt-api and relaunch Chrome.');
    }

    // Check capabilities first
    if (typeof aiObj.languageModel.capabilities === 'function') {
      const caps = await aiObj.languageModel.capabilities();
      console.log('[SWE Guardian] Gemini Nano capabilities:', caps);
      if (caps.available === 'no') {
        throw new Error('Gemini Nano reports available: "no". Your hardware or Chrome setup is not supported for on-device AI.');
      }
      if (caps.available === 'after-download') {
        throw new Error('Gemini Nano weights are still downloading from chrome://components ("Optimization Guide On Device Model"). Please wait for download to finish.');
      }
    }

    const systemPrompt = `You are a helpful and intelligent gatekeeper for Computer Science, Software Engineering, and Data Engineering practitioners.
Your job is to classify YouTube videos into USEFUL or NOT_USEFUL.

CLASSIFICATION RULES:
- Mark "USEFUL" for ANYTHING related to:
  * Software Engineering, coding, programming tutorials, language guides (Python, Rust, C++, Go, Java, JS, etc.)
  * Data Engineering, data pipelines, SQL, Spark, Kafka, Airflow, dbt, databases, big data
  * Systems Engineering, Linux, kernel, networking, distributed systems, architecture
  * Developer tools (Docker, K8s, Git, Neovim, VS Code, CI/CD, terminals)
  * Computer Science theory, algorithms, data structures, LeetCode, mathematics for CS
  * Tech career growth, engineering postmortems, architecture breakdowns

- Mark "NOT_USEFUL" ONLY for:
  * Non-technical entertainment, gaming livestreams, reality shows, drama, gossip
  * Pranks, lifestyle vlogs, relationship content, unboxings, clickbait with zero coding or tech substance

OUTPUT FORMAT:
Respond with ONLY a raw JSON object (no markdown, no backticks):
{"verdict": "USEFUL" or "NOT_USEFUL", "reason": "<one concise sentence explaining why>", "category": "<topic category>"}`;

    // Create session (Note: do NOT pass temperature/topK as it throws on Chrome without sampling-mode flag)
    let session = null;
    try {
      session = await aiObj.languageModel.create({
        systemPrompt: systemPrompt
      });
    } catch (createErr) {
      console.warn('[SWE Guardian] create({systemPrompt}) failed, trying create() with prompt prefix:', createErr);
      session = await aiObj.languageModel.create();
    }

    try {
      const userPrompt = `Classify this video:
Title: "${videoData.title}"
Channel: "${videoData.channel}"
Description: "${(videoData.description || '').substring(0, 500)}"

JSON:`;

      console.log('[SWE Guardian] Prompting Gemini Nano with video metadata...');
      const responseText = await session.prompt(userPrompt);
      console.log('[SWE Guardian] Raw Gemini Nano response:', responseText);

      // Clean response of any accidental markdown or code fences
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        verdict: parsed.verdict?.toUpperCase() === 'USEFUL' ? 'USEFUL' : 'NOT_USEFUL',
        reason: parsed.reason || 'Evaluated by Gemini Nano.',
        category: parsed.category || 'Tech',
        engine: 'Gemini Nano (On-Device LLM)'
      };
    } finally {
      try {
        session.destroy?.();
      } catch (e) {}
    }
  }

  // Listen for evaluation requests from isolated content script
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.target !== SENDER_ID) {
      return;
    }

    const { type, requestId, payload } = event.data;

    if (type === 'CHECK_MODEL_STATUS') {
      const status = await checkStatus();
      window.postMessage({
        target: TARGET_ID,
        requestId,
        type: 'MODEL_STATUS_RESULT',
        payload: status
      }, '*');
      return;
    }

    if (type === 'EVALUATE_VIDEO') {
      const { videoData } = payload;
      let result;

      try {
        result = await evaluateWithGeminiNano(videoData);
      } catch (err) {
        console.error('[SWE Guardian] Gemini Nano evaluation failed:', err);
        // Do NOT guess with dumb keywords! Return honest error status so user knows exactly what failed!
        result = {
          verdict: 'ERROR_OR_BYPASS',
          reason: `Gemini Nano Error: ${err.message}`,
          category: 'Error',
          engine: 'Gemini Nano',
          error: true
        };
      }

      window.postMessage({
        target: TARGET_ID,
        requestId,
        type: 'EVALUATION_RESULT',
        payload: result
      }, '*');
    }
  });

  window.postMessage({ target: TARGET_ID, type: 'MAIN_WORLD_READY' }, '*');
})();
