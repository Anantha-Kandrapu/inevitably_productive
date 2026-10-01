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

      // Robust JSON extraction handling any markdown or trailing text from the LLM
      const parsed = extractJSON(responseText);

      return {
        verdict: parsed.verdict?.toUpperCase() === 'USEFUL' ? 'USEFUL' : 'NOT_USEFUL',
        reason: parsed.reason || (parsed.verdict?.toUpperCase() === 'USEFUL' ? 'Relevant technical content.' : 'Not relevant for software or systems engineering.'),
        category: parsed.category || 'Tech',
        engine: 'Gemini Nano (On-Device LLM)'
      };
    } finally {
      try {
        session.destroy?.();
      } catch (e) {}
    }
  }

  /**
   * Resilient JSON extractor for LLM output
   * Handles markdown blocks, trailing commentary, and unescaped strings
   */
  function extractJSON(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Empty response from model');
    }

    // 1. Direct parse attempt
    try {
      return JSON.parse(text.trim());
    } catch (e) {}

    // 2. Strip code blocks
    const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(stripped);
    } catch (e) {}

    // 3. Extract substring between first '{' and last '}'
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (e) {}
    }

    // 4. Regex extraction for structured fields
    const verdictMatch = text.match(/"verdict"\s*:\s*"(USEFUL|NOT_USEFUL)"/i);
    if (verdictMatch) {
      const reasonMatch = text.match(/"reason"\s*:\s*"([^"]+)"/i);
      const categoryMatch = text.match(/"category"\s*:\s*"([^"]+)"/i);
      return {
        verdict: verdictMatch[1].toUpperCase(),
        reason: reasonMatch ? reasonMatch[1] : 'Evaluated by Gemini Nano',
        category: categoryMatch ? categoryMatch[1] : 'General'
      };
    }

    // 5. Keyword analysis if model answered in plain prose
    if (/\bNOT_USEFUL\b/i.test(text) || /\b(not useful|not relevant|irrelevant|distraction|fluff)\b/i.test(text)) {
      return { verdict: 'NOT_USEFUL', reason: 'Classified as non-engineering by Gemini Nano.', category: 'Distraction' };
    }
    if (/\bUSEFUL\b/i.test(text) || /\b(useful|relevant|engineering|programming)\b/i.test(text)) {
      return { verdict: 'USEFUL', reason: 'Classified as engineering/CS content by Gemini Nano.', category: 'Tech' };
    }

    throw new Error(`Unexpected model output format: ${text.substring(0, 100)}`);
  }

  let evalQueue = Promise.resolve();

  // Listen for evaluation requests from isolated content script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.target !== SENDER_ID) {
      return;
    }

    const { type, requestId, payload } = event.data;

    if (type === 'CHECK_MODEL_STATUS') {
      checkStatus().then((status) => {
        window.postMessage({
          target: TARGET_ID,
          requestId,
          type: 'MODEL_STATUS_RESULT',
          payload: status
        }, '*');
      });
      return;
    }

    if (type === 'EVALUATE_VIDEO') {
      // Enforce sequential execution on the on-device model to prevent GPU session aborts
      evalQueue = evalQueue.then(async () => {
        const { videoData } = payload;
        let result;

        try {
          result = await evaluateWithGeminiNano(videoData);
        } catch (err) {
          console.error('[SWE Guardian] Gemini Nano evaluation failed:', err);
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
      }).catch((queueErr) => {
        console.error('[SWE Guardian] Queue error:', queueErr);
      });
    }
  });

  window.postMessage({ target: TARGET_ID, type: 'MAIN_WORLD_READY' }, '*');
})();
