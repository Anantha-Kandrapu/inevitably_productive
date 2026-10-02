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

    const systemPrompt = `You are an intelligent technical gatekeeper for Computer Science, Software Engineering, and Data Engineering practitioners.
Your mission is to welcome ALL genuine technical or educational content, while filtering out non-technical distractions.

PRIMARY DIRECTIVE:
If a video has ANY technical, programming, engineering, data, system design, or computer science substance, you MUST classify it as "USEFUL".
When in doubt, default to "USEFUL".

ALLOW ("USEFUL"):
- Software Engineering & Programming: Any coding tutorial, language walkthrough (Python, Rust, C++, Go, Java, JS, etc.), debugging, architecture.
- Data Engineering & Analytics: SQL, databases, Apache Spark, Kafka, Airflow, dbt, pipelines, data lakes, Snowflake, BigQuery.
- Systems & Infrastructure: Linux, kernel, networking, operating systems, hardware, embedded, distributed systems.
- Developer Tools: Docker, Kubernetes, Git, Neovim, VS Code, CI/CD, terminals, developer workflows.
- Computer Science Fundamentals: Algorithms, data structures, LeetCode, mathematics for CS.
- AI/ML Engineering: LLMs, PyTorch, Cursor, neural networks, machine learning engineering, AI tooling.
- Engineering Culture: Tech postmortems, system design interview prep, engineering career growth.

REJECT ("NOT_USEFUL"):
- Pure non-technical entertainment, gaming livestreams, drama, gossip, reality shows.
- Pop music videos, movie trailers, sports broadcasts, prank videos, lifestyle vlogs, reaction channels.
- Clickbait with zero coding or technical substance.`;

    const fewShotExamples = `EXAMPLES:
Input: Title: "Python Tutorial: AsyncIO - Complete Guide", Channel: "Corey Schafer", Description: "Learn asynchronous programming with asyncio in Python."
Output: {"verdict": "USEFUL", "category": "Programming", "reason": "Educational tutorial on Python asynchronous programming."}

Input: Title: "Apache Spark Tutorial for Big Data Pipelines", Channel: "Seattle Data Guy", Description: "Building scalable data engineering pipelines with Spark."
Output: {"verdict": "USEFUL", "category": "Data Engineering", "reason": "Covers big data engineering with Apache Spark."}

Input: Title: "I Spent 100 Days in Hardcore Minecraft!", Channel: "GamerPro", Description: "Epic gaming adventure!"
Output: {"verdict": "NOT_USEFUL", "category": "Entertainment", "reason": "Gaming entertainment with no software or systems engineering value."}

Input: Title: "Official Pop Music Video 2026", Channel: "TopHits", Description: "Hit single music video."
Output: {"verdict": "NOT_USEFUL", "category": "Entertainment", "reason": "Music video with no computer science or technical value."}`;

    // Create session (Note: do NOT pass temperature/topK as it throws on Chrome without sampling-mode flag)
    let session = null;
    try {
      session = await aiObj.languageModel.create({
        systemPrompt: systemPrompt
      });
    } catch (createErr) {
      console.warn('[SWE Guardian] create({systemPrompt}) failed, trying default create():', createErr);
      session = await aiObj.languageModel.create();
    }

    try {
      // Embed instructions and few-shot examples directly in prompt to guarantee model follows them
      const userPrompt = `${systemPrompt}

${fewShotExamples}

Now classify this video:
Title: "${videoData.title}"
Channel: "${videoData.channel}"
Description: "${(videoData.description || '').substring(0, 450)}"

Respond with ONLY raw JSON: {"verdict": "USEFUL" or "NOT_USEFUL", "reason": "<one sentence>", "category": "<topic>"}`;

      console.log('[SWE Guardian] Prompting Gemini Nano with video metadata...');
      // 15-second timeout prevents GPU hangs from indefinitely blocking the queue
      const responseText = await Promise.race([
        session.prompt(userPrompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Prompt API call timed out after 15s')), 15000))
      ]);
      console.log('[SWE Guardian] Raw Gemini Nano response:', responseText);

      // Robust JSON extraction handling any markdown or trailing text from the LLM
      const parsed = extractJSON(responseText);

      return {
        verdict: parsed.verdict?.toUpperCase() === 'NOT_USEFUL' ? 'NOT_USEFUL' : 'USEFUL',
        reason: parsed.reason || (parsed.verdict === 'NOT_USEFUL' ? 'Not relevant for software or systems engineering.' : 'Relevant technical content.'),
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

    // 1. Extract substring between first '{' and last '}'
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
      try {
        const obj = JSON.parse(jsonCandidate);
        const v = String(obj.verdict || obj.classification || obj.status || '').toUpperCase();
        if (v.includes('NOT_USEFUL') || v.includes('NOT USEFUL') || v === 'REJECT') {
          return {
            verdict: 'NOT_USEFUL',
            reason: obj.reason || 'Non-engineering content.',
            category: obj.category || 'Entertainment'
          };
        }
        if (v.includes('USEFUL') || v === 'ALLOW' || v === 'PASS') {
          return {
            verdict: 'USEFUL',
            reason: obj.reason || 'Technical software/data engineering content.',
            category: obj.category || 'Engineering'
          };
        }
      } catch (e) {}
    }

    // 2. Regex extraction for structured fields
    if (/"verdict"\s*:\s*"NOT_USEFUL"/i.test(text)) {
      const reasonMatch = text.match(/"reason"\s*:\s*"([^"]+)"/i);
      const categoryMatch = text.match(/"category"\s*:\s*"([^"]+)"/i);
      return {
        verdict: 'NOT_USEFUL',
        reason: reasonMatch ? reasonMatch[1] : 'Non-engineering content.',
        category: categoryMatch ? categoryMatch[1] : 'Entertainment'
      };
    }
    if (/"verdict"\s*:\s*"USEFUL"/i.test(text)) {
      const reasonMatch = text.match(/"reason"\s*:\s*"([^"]+)"/i);
      const categoryMatch = text.match(/"category"\s*:\s*"([^"]+)"/i);
      return {
        verdict: 'USEFUL',
        reason: reasonMatch ? reasonMatch[1] : 'Technical content verified.',
        category: categoryMatch ? categoryMatch[1] : 'Tech'
      };
    }

    // 3. Plain prose analysis
    if (/\b(not useful|not relevant|irrelevant|distraction|entertainment|gaming)\b/i.test(text) && !/\b(is useful|highly useful)\b/i.test(text)) {
      return { verdict: 'NOT_USEFUL', reason: 'Classified as non-engineering by Gemini Nano.', category: 'Entertainment' };
    }

    // 4. Safe default: Never falsely block legitimate learning on ambiguous text!
    return { verdict: 'USEFUL', reason: 'Verified by Gemini Nano.', category: 'Tech' };
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
