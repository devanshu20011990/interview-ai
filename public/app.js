// ─────────────────────────────────────────────────────────────
//  Interview AI Assistant — frontend
// ─────────────────────────────────────────────────────────────

const els = {
  listenBtn: document.getElementById("listenBtn"),
  askBtn: document.getElementById("askBtn"),
  manualInput: document.getElementById("manualInput"),
  transcript: document.getElementById("transcript"),
  answer: document.getElementById("answer"),
  sources: document.getElementById("sources"),
  fieldSelect: document.getElementById("fieldSelect"),
  searchMode: document.getElementById("searchMode"),
  searchHint: document.getElementById("searchHint"),
  liveBadge: document.getElementById("liveBadge"),
  copyBtn: document.getElementById("copyBtn"),
  sourceHint: document.getElementById("sourceHint"),
  dotLLM: document.getElementById("dotLLM"),
  dotTavily: document.getElementById("dotTavily"),
  dotMic: document.getElementById("dotMic"),
  srcBtns: Array.from(document.querySelectorAll(".src-btn")),
};

let activeSource = "mic";
let listening = false;
let recognition = null;        // Web Speech API (mic)
let mediaRecorder = null;      // MediaRecorder (system/tab)
let mediaStream = null;
let chunks = [];
let lastFinal = "";

// ── Init: read server config ────────────────────────────────
(async function init() {
  try {
    const cfg = await (await fetch("/api/config")).json();
    setDot(els.dotLLM, cfg.llmEnabled);
    setDot(els.dotTavily, cfg.tavilyEnabled);
    const micOk = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    setDot(els.dotMic, micOk);
    if (cfg.model) {
      els.dotLLM.parentElement.childNodes[1].textContent = ` ${cfg.model}`;
    }
    // If no Tavily key, hint that picking Tavily will fall back
    if (!cfg.tavilyEnabled) {
      const opt = els.searchMode.querySelector('option[value="tavily"]');
      if (opt) opt.textContent = "Tavily — (no key set; add TAVILY_API_KEY to use)";
    }
  } catch {
    setDot(els.dotLLM, false);
  }
})();

// Update hint when search mode changes
els.searchMode.addEventListener("change", () => {
  const m = els.searchMode.value;
  els.searchHint.textContent =
    m === "keyless" ? "Keyless: works with zero sign-up, but results can be less complete or accurate."
    : m === "tavily" ? "Tavily: higher-quality, AI-optimized results. Needs a free Tavily key in .env."
    : "Off: fully offline — answers use only the model's built-in knowledge (may be out of date).";
});

function setDot(el, ok) { el.classList.add(ok ? "ok" : "off"); }

// ── Source toggle ───────────────────────────────────────────
els.srcBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (listening) return; // don't switch mid-listen
    els.srcBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeSource = btn.dataset.src;
    els.sourceHint.textContent = activeSource === "mic"
      ? "Microphone: captures your device mic live in the browser."
      : "System / Tab: share a tab or window WITH audio (check 'Share audio') to capture the interviewer's voice.";
  });
});

// ── Listen button ───────────────────────────────────────────
els.listenBtn.addEventListener("click", () => {
  if (listening) stopListening();
  else activeSource === "mic" ? startMic() : startSystem();
});

function setListeningUI(on) {
  listening = on;
  els.listenBtn.textContent = on ? "Stop Listening" : "Start Listening";
  els.listenBtn.classList.toggle("listening", on);
  els.liveBadge.textContent = on ? "listening" : "idle";
  els.liveBadge.classList.toggle("live", on);
}

// ── MIC: Web Speech API (live, in-browser) ──────────────────
function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Speech recognition not supported in this browser. Try Chrome, or use System/Tab mode."); return; }
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    if (final) { lastFinal = final.trim(); els.transcript.textContent = lastFinal; }
    else els.transcript.innerHTML = `${lastFinal} <span class="interim">${interim}</span>`;
  };
  recognition.onerror = (e) => { if (e.error === "no-speech") return; console.warn("speech error", e.error); };
  recognition.onend = () => { if (listening) recognition.start(); }; // auto-restart

  recognition.start();
  setListeningUI(true);
  lastFinal = "";
  els.transcript.textContent = "Listening… speak the interview question.";
}

// ── SYSTEM / TAB: capture audio -> server transcription ─────
async function startSystem() {
  try {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const audioTracks = mediaStream.getAudioTracks();
    if (!audioTracks.length) {
      alert("No audio track captured. When sharing, enable the 'Share audio' / 'Share tab audio' checkbox.");
      mediaStream.getTracks().forEach((t) => t.stop());
      return;
    }
    const audioOnly = new MediaStream(audioTracks);
    mediaRecorder = new MediaRecorder(audioOnly, { mimeType: pickMime() });
    chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = transcribeCaptured;

    // Stop if the user ends the screen share from the browser UI
    audioTracks[0].addEventListener("ended", stopListening);

    mediaRecorder.start();
    setListeningUI(true);
    els.transcript.textContent = "Capturing system audio… click Stop when the question is finished.";
  } catch (e) {
    console.error(e);
    alert("Could not start screen/tab capture: " + e.message);
  }
}

function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  return opts.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

async function transcribeCaptured() {
  if (!chunks.length) return;
  const blob = new Blob(chunks, { type: chunks[0].type || "audio/webm" });
  els.transcript.textContent = "Transcribing captured audio…";
  const form = new FormData();
  form.append("audio", blob, "audio.webm");
  try {
    const r = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await r.json();
    if (data.text) {
      els.transcript.textContent = data.text;
      askQuestion(data.text);
    } else {
      els.transcript.textContent = "(No speech detected) " + (data.error || "");
    }
  } catch (e) {
    els.transcript.textContent = "Transcription error: " + e.message;
  }
}

function stopListening() {
  if (recognition) { recognition.stop(); recognition = null; }
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  setListeningUI(false);

  // For mic: when stopped, auto-ask the final transcript
  if (lastFinal) askQuestion(lastFinal);
}

// ── Manual ask ──────────────────────────────────────────────
els.askBtn.addEventListener("click", () => {
  const q = els.manualInput.value.trim();
  if (q) { els.transcript.textContent = q; askQuestion(q); }
});
els.manualInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) els.askBtn.click();
});

// ── Ask the backend (SSE streaming) ─────────────────────────
async function askQuestion(question) {
  els.answer.innerHTML = '<span class="cursor">&nbsp;</span>';
  els.sources.innerHTML = "";
  let answerText = "";

  try {
    const resp = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, field: els.fieldSelect.value, searchMode: els.searchMode.value }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      els.answer.textContent = "Error: " + (err.error || resp.statusText);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() || "";
      for (const ev of events) {
        const lines = ev.split("\n");
        const type = (lines.find((l) => l.startsWith("event:")) || "").slice(6).trim();
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const data = dataLine.slice(5).trim();
        if (type === "searchinfo") {
          const used = JSON.parse(data).used;
          if (used === "tavily-unavailable") {
            els.sources.innerHTML = '<div class="src-note">⚠️ Tavily selected but no key set — answer uses LLM knowledge only.</div>';
          }
        }
        else if (type === "sources") renderSources(JSON.parse(data));
        else if (type === "token") {
          answerText += JSON.parse(data);
          els.answer.innerHTML = formatAnswer(answerText) + '<span class="cursor">&nbsp;</span>';
          els.answer.scrollTop = els.answer.scrollHeight;
        } else if (type === "error") {
          els.answer.textContent = "Error: " + (JSON.parse(data).error || "unknown");
        } else if (type === "done") {
          els.answer.innerHTML = formatAnswer(answerText);
        }
      }
    }
    if (answerText) els.answer.innerHTML = formatAnswer(answerText);
  } catch (e) {
    els.answer.textContent = "Request failed: " + e.message;
  }
}

function renderSources(sources) {
  if (!sources || !sources.length) return;
  els.sources.innerHTML = "";
  sources.forEach((s, i) => {
    const a = document.createElement("a");
    a.href = s.url; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = `<span class="src-title">[${i + 1}] ${escapeHtml(s.title || s.url)}</span>`;
    els.sources.appendChild(a);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Escape, then bold the known section headers for easy live scanning.
function formatAnswer(s) {
  let html = escapeHtml(s);
  html = html.replace(/^(Answer:|Example:|Likely follow-up questions:)/gim,
    '<span class="ans-head">$1</span>');
  return html;
}

// ── Copy answer ─────────────────────────────────────────────
els.copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(els.answer.textContent || "").then(() => {
    els.copyBtn.textContent = "Copied!";
    setTimeout(() => (els.copyBtn.textContent = "Copy"), 1200);
  });
});
