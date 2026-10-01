/**
 * Inevitably Productive: SWE Guardian - Main World Evaluator
 * Runs inside YouTube's MAIN JavaScript world to access Chrome's built-in Gemini Nano (ai.languageModel).
 * Communicates with the isolated content script via window.postMessage.
 */

(function () {
  const SENDER_ID = 'SWE_GUARD_MAIN_WORLD';
  const TARGET_ID = 'SWE_GUARD_ISOLATED_WORLD';

  let aiSession = null;
  let cachedCapabilities = null;

  console.log('[SWE Guardian - Main World] Evaluator initialized.');

  // Check Gemini Nano availability
  async function checkModelCapabilities() {
    try {
      const aiObject = window.ai || (typeof ai !== 'undefined' ? ai : null);
      if (!aiObject || !aiObject.languageModel) {
        return { available: 'no', reason: 'window.ai.languageModel is undefined' };
      }

      if (typeof aiObject.languageModel.capabilities === 'function') {
        const caps = await aiObject.languageModel.capabilities();
        cachedCapabilities = caps;
        return caps;
      }

      return { available: 'readily' };
    } catch (err) {
      console.warn('[SWE Guardian] Error checking capabilities:', err);
      return { available: 'no', error: err.message };
    }
  }

  // Build the system prompt tailored to software & systems engineering
  function buildSystemPrompt(strictness = 'balanced') {
    let strictnessGuidance = '';
    if (strictness === 'strict') {
      strictnessGuidance = `
STRICTNESS: ULTRA-STRICT SYSTEMS & CORE SWE ONLY.
- MUST contain concrete technical substance: system architecture, operating systems, compilers, distributed systems, memory management, database internals, algorithms, high-performance networking, low-level debugging, kernel development, or real code walkthroughs.
- REJECT: High-level tech news, tech company gossip, superficial "day in the life" vlogs, generic productivity tips, low-effort listicles ("Top 5 languages in 2026").
`;
    } else if (strictness === 'lenient') {
      strictnessGuidance = `
STRICTNESS: LENIENT.
- PERMIT: Any computer science, programming, IT, software engineering, tech career advice, or tech tooling topic.
- ONLY REJECT: Blatant non-technical content, pure gaming/entertainment, clickbait drama, politics, sports, music, and completely unrelated fluff.
`;
    } else {
      // Balanced
      strictnessGuidance = `
STRICTNESS: BALANCED SWE & SYSTEMS.
- PERMIT: High quality coding tutorials, systems architecture, DevOps/SRE, software design patterns, developer tools, database engineering, SWE career progression, technical postmortems, and technical deep dives.
- REJECT: Pure entertainment, clickbait drama, gaming livestreams, non-technical lifestyle vlogs, dropshipping/crypto scams, and superficial hype.
`;
    }

    return `You are an elite, objective technical gatekeeper for professional Software Engineers and Systems Engineers.
Your duty is to judge whether a YouTube video is genuinely valuable, technical, educational, or professional for someone in Software Engineering, Systems Engineering, DevOps/SRE, or Computer Science.

${strictnessGuidance}

RESPONSE FORMAT:
You MUST respond with a JSON object strictly adhering to this structure:
{
  "verdict": "USEFUL" or "NOT_USEFUL",
  "confidence": <integer between 0 and 100>,
  "category": "<e.g., Systems Architecture, Distributed Systems, Web Dev, DevOps, Clickbait/Fluff, Entertainment>",
  "reason": "<One clear, punchy sentence explaining why this video is or is not useful for a software/systems engineer>"
}

Do NOT wrap in markdown backticks or include any conversational filler. Only output valid JSON.`;
  }

  /**
   * Get or create a Gemini Nano session
   */
  async function getOrCreateSession(strictness) {
    const aiObject = window.ai || (typeof ai !== 'undefined' ? ai : null);
    if (!aiObject || !aiObject.languageModel) {
      return null;
    }

    try {
      const systemPrompt = buildSystemPrompt(strictness);
      const session = await aiObject.languageModel.create({
        systemPrompt: systemPrompt,
        temperature: 0.2, // Low temperature for consistent, strict classification
        topK: 3
      });
      return session;
    } catch (err) {
      console.warn('[SWE Guardian] Failed to create Gemini Nano session:', err);
      return null;
    }
  }

  /**
   * Run evaluation with Gemini Nano
   */
  async function evaluateWithGeminiNano(videoData, strictness) {
    const aiObject = window.ai || (typeof ai !== 'undefined' ? ai : null);
    if (!aiObject || !aiObject.languageModel) {
      throw new Error('Gemini Nano API not available');
    }

    const session = await getOrCreateSession(strictness);
    if (!session) {
      throw new Error('Could not establish language model session');
    }

    const promptText = `Evaluate this YouTube video for software and systems engineering value:
Title: "${videoData.title}"
Channel: "${videoData.channel}"
Description Snippet: "${(videoData.description || '').substring(0, 400)}"
Keywords/Tags: "${(videoData.tags || []).join(', ')}"

Provide your verdict as raw JSON.`;

    const rawResponse = await session.prompt(promptText);
    session.destroy?.(); // Clean up session memory

    // Parse JSON safely
    const cleaned = rawResponse
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return {
      verdict: parsed.verdict === 'USEFUL' ? 'USEFUL' : 'NOT_USEFUL',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 85,
      category: parsed.category || 'General',
      reason: parsed.reason || (parsed.verdict === 'USEFUL' ? 'Relevant technical topic.' : 'Deemed unrelated to engineering.'),
      engine: 'Gemini Nano (On-Device)'
    };
  }

  /**
   * High-accuracy heuristic fallback when Gemini Nano flag is not yet enabled or downloading
   */
  function fallbackHeuristicEvaluate(videoData, strictness) {
    const text = `${videoData.title} ${videoData.channel} ${videoData.description} ${(videoData.tags || []).join(' ')}`.toLowerCase();

    const techPositiveKeywords = [
      'system design', 'distributed systems', 'rust', 'c++', 'golang', 'python', 'javascript', 'typescript',
      'linux', 'kernel', 'kubernetes', 'docker', 'database', 'sql', 'nosql', 'postgres', 'architecture',
      'compiler', 'assembly', 'concurrency', 'multithreading', 'devops', 'sre', 'ci/cd', 'git', 'algorithm',
      'data structure', 'leetcode', 'api design', 'microservices', 'networking', 'tcp', 'http', 'debugging',
      'refactoring', 'software engineering', 'systems engineering', 'web development', 'frontend', 'backend',
      'cloud computing', 'aws', 'gcp', 'azure', 'embedded', 'cybersecurity', 'cryptography', 'machine learning engineering'
    ];

    const fluffNegativeKeywords = [
      'reacting to', 'drama', 'prank', 'girlfriend', 'boyfriend', 'vlog', 'day in the life of a 22 year old',
      'i quit my', 'why i was fired', 'exposed', 'crypto moon', '100x gem', 'dropshipping', 'passive income',
      'tiktok', 'asmr', 'mukbang', 'unboxing iphone', 'challenge', 'fortnite', 'minecraft', 'gta', 'speedrun',
      'mrbeast', 'sidemen', 'insane reveal'
    ];

    let positiveScore = 0;
    let negativeScore = 0;
    const matchedPositive = [];
    const matchedNegative = [];

    techPositiveKeywords.forEach(kw => {
      if (text.includes(kw)) {
        positiveScore += 2;
        matchedPositive.push(kw);
      }
    });

    fluffNegativeKeywords.forEach(kw => {
      if (text.includes(kw)) {
        negativeScore += 3;
        matchedNegative.push(kw);
      }
    });

    // Known channels bonus
    const knownGoodChannels = [
      'theprimeagen', 'bytebytego', 'fireship', 'low level learning', 'computerphile',
      'sebastian lague', 'continuous delivery', 'hussein nasser', 'tsoding', 'mit opencourseware'
    ];
    if (knownGoodChannels.some(c => (videoData.channel || '').toLowerCase().includes(c))) {
      positiveScore += 8;
    }

    let isUseful = positiveScore > negativeScore && positiveScore >= (strictness === 'strict' ? 4 : 2);
    let reason = '';
    let category = 'Engineering';

    if (isUseful) {
      reason = `Recognized key engineering concepts: ${matchedPositive.slice(0, 3).join(', ') || 'technical content'}.`;
      category = 'Software / Systems';
    } else {
      if (matchedNegative.length > 0) {
        reason = `Detected non-technical/fluff indicators: ${matchedNegative.slice(0, 2).join(', ')}.`;
        category = 'Entertainment / Fluff';
      } else {
        reason = `Lacks clear software or systems engineering indicators.`;
        category = 'Non-Technical';
      }
    }

    return {
      verdict: isUseful ? 'USEFUL' : 'NOT_USEFUL',
      confidence: 80,
      category,
      reason,
      engine: 'Built-in Heuristic Fallback (Enable Gemini Nano flag for full AI)'
    };
  }

  // Handle messages from the isolated content script
  window.addEventListener('message', async (event) => {
    // Only accept messages from the same window and target ID
    if (event.source !== window || !event.data || event.data.target !== SENDER_ID) {
      return;
    }

    const { type, requestId, payload } = event.data;

    if (type === 'CHECK_MODEL_STATUS') {
      const caps = await checkModelCapabilities();
      window.postMessage({
        target: TARGET_ID,
        requestId,
        type: 'MODEL_STATUS_RESULT',
        payload: {
          available: caps.available || 'no',
          hasWindowAI: !!(window.ai || (typeof ai !== 'undefined' ? ai : null)),
          capabilities: caps
        }
      }, '*');
      return;
    }

    if (type === 'EVALUATE_VIDEO') {
      const { videoData, strictness } = payload;
      let result;

      try {
        // Attempt Gemini Nano
        result = await evaluateWithGeminiNano(videoData, strictness);
      } catch (nanoErr) {
        // Graceful fallback to deterministic heuristic classifier
        result = fallbackHeuristicEvaluate(videoData, strictness);
      }

      window.postMessage({
        target: TARGET_ID,
        requestId,
        type: 'EVALUATION_RESULT',
        payload: result
      }, '*');
    }
  });

  // Announce readiness
  window.postMessage({
    target: TARGET_ID,
    type: 'MAIN_WORLD_READY'
  }, '*');

})();
