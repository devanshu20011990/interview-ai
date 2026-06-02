# 🎙️ Interview AI Assistant (Windows-friendly, free for personal use)

A local app that **listens to interview questions** (microphone or system/tab audio) and **answers any question from any field**, optionally grounded in **live web search** for the latest developments. It runs **on your own laptop** and opens in your browser at `http://localhost:3000`.

---

## 💸 Is it free? Yes, for personal use.

You need a **brain** (an LLM) and optionally **web search**. Here is the zero-cost setup:

| Part | Free option | Key needed? |
|---|---|---|
| 🧠 LLM (the answers) | **Groq** free tier (fast) | One **free** key, no credit card |
| 🔍 Web search | **Keyless (DuckDuckGo)** built in | ❌ None |
| 🔍 Web search (better) | **Tavily** free tier (1,000/mo) | One **free** key (optional) |
| 🎤 Speech→text (mic) | Browser Web Speech API | ❌ None |

> **Why a key at all?** Wi-Fi just carries the request; the API key is your (free) account at the AI service that does the thinking. Connecting to Wi-Fi does not replace it. The only way to need *no* key is to run a local model (Ollama) — see Option 3 in `.env.example`.

---

## 🚀 Quick start on Windows (easiest)

1. **Install Node.js** (one time): download the **LTS** version from <https://nodejs.org> and install.
2. **Get a free Groq key:** <https://console.groq.com> → sign up → *API Keys* → *Create* → copy (`gsk_...`).
3. **Double-click `START-WINDOWS.bat`** in this folder.
   - First run: it installs everything, creates `.env`, and opens it in Notepad.
   - **Paste your Groq key** into `OPENAI_API_KEY=` and save.
   - Double-click `START-WINDOWS.bat` again.
4. Your browser opens at **http://localhost:3000**. Done! 🎉

Keep the black command window **open** while using the app. Close it to stop.

---

## 🖱️ Manual start (Mac/Linux or if you prefer the terminal)

```bash
npm install
cp .env.example .env        # then edit .env, add your Groq key
npm start                   # open http://localhost:3000
```

---

## 🧭 Using the app

1. Pick your **Interview field**.
2. Choose a **Web search mode** (in the sidebar):
   - **Keyless (DuckDuckGo)** — no key, but results can be **less reliable/complete**.
   - **Tavily** — **more reliable** results, needs a free Tavily key in `.env`.
   - **Off** — fully offline; answers use only the model's built-in knowledge.
3. Pick an **audio source**:
   - **Microphone** — *Start Listening*, speak, *Stop* → it answers. (100% free, no API.)
   - **System / Tab** — share a tab/window **with "Share audio" ticked** to capture the interviewer. (Needs a transcription-capable provider; see note below.)
4. Or just **type a question** and press **Ask** (Ctrl+Enter).

---

## ⚙️ Switching the LLM provider

The app speaks the **OpenAI-compatible** protocol, so you can point it anywhere by editing `.env`:

- **Groq (free, recommended):** `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `LLM_MODEL=llama-3.3-70b-versatile`
- **OpenAI (paid):** `OPENAI_BASE_URL=https://api.openai.com/v1`, `LLM_MODEL=gpt-4o-mini`
- **Local/offline (Ollama, no key, no internet for answers):** `OPENAI_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=llama3.1`

See `.env.example` for ready-to-paste blocks.

> **Note on System/Tab transcription:** it uses a Whisper endpoint. Groq/Ollama may not offer audio transcription, in which case use **Microphone mode** (free, in-browser) or add an OpenAI key just for transcription.

---

## 🏗️ How it works

```
Your laptop (browser)  ──Wi-Fi──►  AI services
  ├─ Mic  ──► Web Speech API ──► text (in-browser, free)
  └─ Tab  ──► /api/transcribe (Whisper) ──► text
                       │
                       ▼
            POST /api/answer  (local Node server)
              1) web search:  Keyless (DuckDuckGo)  OR  Tavily  OR  off
              2) LLM (Groq/OpenAI/Ollama), streamed back token-by-token
```

- `server.js` — local server: static hosting, `/api/transcribe`, `/api/answer` (SSE), `/api/config`.
- `public/` — the UI (`index.html`, `styles.css`, `app.js`).
- `START-WINDOWS.bat` — one-click launcher for Windows.

---

## ⚠️ Responsible use
Capturing the other side of a call can be subject to consent laws and meeting-platform policies. Use this for **practice, study, and accessibility**, and disclose where required.

---

## 🛣️ Optional next steps
- Wrap as a true desktop `.exe` (Electron)
- Silence detection for hands-free flow
- Text-to-speech playback of answers
- RAG over your own notes/papers
