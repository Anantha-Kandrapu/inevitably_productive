# 🛡️ Inevitably Productive: SWE Guardian (Gemini Nano)

A Chrome extension powered by Chrome's built-in **Gemini Nano Prompt API** (`ai.languageModel`) that strictly inspects YouTube videos in real-time, verifying whether content has genuine technical value for **Software Engineers & Systems Engineers** (architecture, distributed systems, OS/kernel, algorithms, performance, tooling). 

If a video is deemed non-engineering fluff, drama, or clickbait distraction, it pauses playback, triggers a grace-period countdown overlay, and automatically closes the tab with a notification.

---

## 🚀 Key Features

1. **Local, Zero-Latency Gemini Nano Evaluation**:
   - Uses Chrome's on-device `ai.languageModel` (running directly on your GPU/NPU via WebGPU). No external API keys or server costs required.
   - Built-in heuristic backup engine ensures immediate testing even before the Chrome model weights finish downloading.
2. **Tab Closure & Focus Guarding**:
   - When a distraction video is detected, playback is immediately paused and a sleek countdown overlay appears (5s default, configurable).
   - If not cancelled or whitelisted, the tab is safely closed and a desktop notification is dispatched.
3. **Whitelist Management**:
   - **Channel Whitelist**: Whitelist favorite technical creators (preloaded with *ThePrimeagen, ByteByteGo, Fireship, Low Level Learning, Hussein Nasser*, etc.).
   - **Keyword Whitelist**: Match core topics like *system design, distributed systems, kernel, rust, compiler, database internals*.
   - **1-Click Quick Whitelisting**: Click "+ Whitelist Channel" or "+ Whitelist Video" directly from the in-page warning or the popup.
4. **Master Toggle & Custom Controls**:
   - Turn the extension on/off at any time.
   - Strictness profiles: **Ultra-Strict Systems & Core CS**, **Balanced SWE (Recommended)**, or **Lenient**.
   - Configurable countdown grace period (Instant, 3s, 5s, 10s).
   - Complete audit history of evaluated videos.

---

## 🛠️ Step 1: Enable Gemini Nano & Prompt API in Chrome

In your Chrome address bar, configure these flags:

1. Navigate to:
   ```text
   chrome://flags/#prompt-api
   ```
   Set **Prompt API** to **Enabled**.
2. Navigate to:
   ```text
   chrome://flags/#optimization-guide-on-device-model
   ```
   Set **Enables optimization guide on device model** to **Enabled BypassPerfRequirement**.
3. **Relaunch Google Chrome**.
4. Check Model Download (Optional but recommended):
   - Go to `chrome://components`
   - Look for **Optimization Guide On Device Model**
   - Click **Check for update** to trigger or verify downloading the ~1.5GB Gemini Nano weights.

*(Note: If the model is still downloading, SWE Guardian's internal fallback engine will seamlessly grade videos without crashing until Gemini Nano is ready).*

---

## 📦 Step 2: Load the Extension in Chrome

1. Open Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click the **Load unpacked** button in the top-left.
4. Select the project directory:
   ```text
   /Users/ark/inevitably_productive
   ```
5. Pin **SWE Guardian** to your Chrome toolbar.

---

## 🧪 Step 3: Test on YouTube

1. Open any YouTube video.
2. Observe the top-right status pill:
   - **🤖 Evaluating SWE relevance with Gemini Nano...**
   - If technical SWE/systems content: **✅ Verified Software/Systems Content**
   - If whitelisted: **⭐ Whitelisted**
3. Open a non-engineering or entertainment video:
   - Playback pauses and a dark glassmorphism warning appears:
   - *"Closing Tab to Preserve Focus (5s...)"*
   - Shows the exact reason from Gemini Nano.
   - You can click **Keep Tab (Cancel)**, **Close Tab Now**, or **+ Whitelist Channel**.
4. Click the extension toolbar icon to manage whitelists, adjust strictness, or view your history log.
