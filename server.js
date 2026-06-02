// ─────────────────────────────────────────────────────────────
//  Interview AI Assistant — backend
//
//  Responsibilities:
//   1. Serve the web client (public/)
//   2. /api/transcribe  -> turn captured audio (system/tab) into text
//   3. /api/answer      -> web-search + LLM => up-to-date answer (streamed)
//   4. /api/config      -> tell the client which features are available
//
//  Search modes (chosen by the user in the UI, per request):
//   - "keyless" : DuckDuckGo (no key, no sign-up; results less reliable)
//   - "tavily"  : Tavily API (needs free key; higher-quality results)
//   - "none"    : no web search (offline; LLM knowledge only)
// ─────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || "whisper-1";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Helpers ──────────────────────────────────────────────────

function requireLLM(res) {
  if (!OPENAI_API_KEY) {
    res.status(400).json({ error: "No LLM key configured. Add OPENAI_API_KEY (e.g. a free Groq key) to your .env file." });
    return false;
  }
  return true;
}

/** Tavily search (needs key). Returns [{title, url, content}]. */
async function tavilySearch(query) {
  if (!TAVILY_API_KEY) return [];
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        max_results: 6,
        include_answer: false,
      }),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).map((x) => ({
      title: x.title,
      url: x.url,
      content: (x.content || "").slice(0, 1200),
    }));
  } catch (e) {
    console.error("tavily search failed:", e.message);
    return [];
  }
}

/**
 * Keyless search via DuckDuckGo (no sign-up).
 * Uses the Instant Answer API + the lite HTML endpoint as fallback.
 * Results are less reliable/structured than Tavily, but require no key.
 */
async function duckduckgoSearch(query) {
  const results = [];

  // 1) Instant Answer API (definitions, abstracts, related topics)
  try {
    const u = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(u, { headers: { "User-Agent": "InterviewAI/1.0" } });
    if (r.ok) {
      const d = await r.json();
      if (d.AbstractText) {
        results.push({ title: d.Heading || query, url: d.AbstractURL || "", content: d.AbstractText.slice(0, 1200) });
      }
      for (const t of d.RelatedTopics || []) {
        if (t.Text && t.FirstURL) results.push({ title: t.Text.slice(0, 90), url: t.FirstURL, content: t.Text.slice(0, 600) });
        if (results.length >= 6) break;
      }
    }
  } catch (e) {
    console.error("ddg instant answer failed:", e.message);
  }

  // 2) Fallback: HTML results page (titles + snippets) if we got little
  if (results.length < 3) {
    try {
      const u = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
      if (r.ok) {
        const html = await r.text();
        const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
        let m;
        while ((m = re.exec(html)) && results.length < 6) {
          const url = decodeURIComponent((m[1].match(/uddg=([^&]+)/) || [, m[1]])[1]);
          const title = stripTags(m[2]);
          const snippet = stripTags(m[3]);
          if (title) results.push({ title, url, content: snippet.slice(0, 800) });
        }
      }
    } catch (e) {
      console.error("ddg html failed:", e.message);
    }
  }

  return results.slice(0, 6);
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/** Dispatch to the chosen search mode. */
async function runSearch(query, mode) {
  if (mode === "none") return { sources: [], used: "none" };
  if (mode === "tavily") {
    if (!TAVILY_API_KEY) return { sources: [], used: "tavily-unavailable" };
    return { sources: await tavilySearch(query), used: "tavily" };
  }
  // default: keyless
  return { sources: await duckduckgoSearch(query), used: "keyless" };
}

// ── Routes ───────────────────────────────────────────────────

app.get("/api/config", (req, res) => {
  res.json({
    llmEnabled: !!OPENAI_API_KEY,
    tavilyEnabled: !!TAVILY_API_KEY,   // whether Tavily key is present
    keylessEnabled: true,              // always available
    transcriptionEnabled: !!OPENAI_API_KEY,
    model: LLM_MODEL,
  });
});

// Transcribe captured system/tab audio chunks (mic uses in-browser Web Speech API instead)
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!requireLLM(res)) return;
  if (!req.file) return res.status(400).json({ error: "No audio uploaded." });

  try {
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
    form.append("file", blob, "audio.webm");
    form.append("model", TRANSCRIBE_MODEL);

    const r = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: "Transcription failed (your LLM provider may not support audio). Use Microphone mode for free transcription.", detail: txt.slice(0, 300) });
    }
    const data = await r.json();
    res.json({ text: (data.text || "").trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate an answer: web search -> LLM (streamed back to client)
app.post("/api/answer", async (req, res) => {
  if (!requireLLM(res)) return;
  const question = (req.body?.question || "").trim();
  const field = (req.body?.field || "general").trim();
  const searchMode = (req.body?.searchMode || "keyless").trim(); // keyless | tavily | none
  if (!question) return res.status(400).json({ error: "Empty question." });

  // 1) Ground with chosen web search mode
  const { sources, used } = await runSearch(question, searchMode);
  const sourceBlock = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.content}`).join("\n\n")
    : "(No live web results available — answer from your own knowledge and clearly note any recency limits.)";

  const system = [
    "You are an expert interview assistant that helps a candidate answer questions in real time.",
    `The interview field/domain is: ${field}.`,
    "ALWAYS give the COMPLETE answer yourself, in full, ready to be spoken aloud in an interview.",
    "CRITICAL: Never tell the user to 'refer to the documentation', 'check the docs', 'read the manual', 'see the official guide', 'look it up', or to consult any external resource. You must extract the actual answer FROM those sources and state it directly. The candidate cannot go read anything during an interview — they must be able to say your answer out loud immediately.",
    "If the provided web sources contain the relevant information, synthesize and explain it in your own words as the answer. Do NOT just point to where the answer lives.",
    "Be specific and concrete: include the actual definitions, steps, code, commands, numbers, examples, or explanations the question calls for — not a description of where to find them.",
    "Prioritize accuracy and the LATEST research/developments. You may cite sources inline like [1], [2] to back up claims, but the answer itself must be self-contained.",
    "",
    "LENGTH & STYLE: Aim for a BALANCED answer that takes roughly 30-60 seconds to speak aloud. Write in natural, flowing PARAGRAPHS (not bullet lists) so it sounds conversational and human when spoken. Lead with a direct 1-2 sentence answer, then expand with the key supporting points woven into prose. No filler, no deflection, no 'I would recommend reading'.",
    "",
    "LANGUAGE: Use simple, plain, everyday language that is easy to say out loud and easy for anyone to understand. Prefer short, common words over technical jargon. When a technical term is necessary, briefly explain it in plain words. Avoid buzzwords, complex phrasing, and run-on sentences. Imagine explaining it clearly to a smart person who is new to the topic.",
    "",
    "ALWAYS structure your response in exactly these three parts, using these exact headers:",
    "Answer:",
    "(the natural spoken paragraphs described above)",
    "",
    "Example:",
    "(one short, concrete, real-world example or code/scenario that illustrates the point — keep it brief and speakable)",
    "",
    "Likely follow-up questions:",
    "(2-3 short questions the interviewer is likely to ask next, as a simple list)",
    "",
    "If you are genuinely unsure or the sources lack detail, give your best expert answer from your own knowledge and briefly note the caveat — but still answer fully.",
  ].join("\n");

  const userMsg = `Interview question:\n"${question}"\n\nUse the web sources below as reference material to construct your own complete spoken answer. Do not tell me to read them — give me the answer itself.\n\nWeb sources:\n${sourceBlock}`;

  // 2) Stream the LLM answer (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Tell the client which search was actually used, then the sources
  res.write(`event: searchinfo\ndata: ${JSON.stringify({ used })}\n\n`);
  res.write(`event: sources\ndata: ${JSON.stringify(sources)}\n\n`);

  try {
    const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        stream: true,
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!r.ok || !r.body) {
      const txt = await r.text();
      res.write(`event: error\ndata: ${JSON.stringify({ error: txt.slice(0, 500) })}\n\n`);
      return res.end();
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) res.write(`event: token\ndata: ${JSON.stringify(delta)}\n\n`);
        } catch {
          /* ignore keep-alive / partial lines */
        }
      }
    }
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (e) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  Interview AI Assistant running:  http://localhost:${PORT}`);
  console.log(`  LLM:        ${OPENAI_API_KEY ? LLM_MODEL : "NOT configured (set OPENAI_API_KEY — a free Groq key works)"}`);
  console.log(`  Search:     keyless (DuckDuckGo) always on; Tavily ${TAVILY_API_KEY ? "ENABLED" : "not configured (optional)"}`);
  console.log(`  Open the app in your browser at the URL above.\n`);
});
