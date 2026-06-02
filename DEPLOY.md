# 🌐 Deploy your Interview AI Assistant (get a public URL — free)

Goal: turn your app into a link like `https://interview-ai-xxxx.onrender.com` that you can open in **any** browser, on **any** device — no downloads, no Node.js, no `.bat` file.

We'll use **Render** (free tier). You'll also need a free **GitHub** account to store the code. Total time: ~15 minutes, one time.

---

## What you'll need (all free)
1. A **GitHub** account → <https://github.com> (stores your code)
2. A **Render** account → <https://render.com> (runs your app, gives the URL)
3. Your **Groq API key** (`gsk_...`) → from <https://console.groq.com/keys>

---

## Step 1 — Put the code on GitHub

**Easiest (no commands):**
1. Log in to GitHub → click the **+** (top-right) → **New repository**.
2. Name it `interview-ai`, keep it **Public** (or Private — both work), click **Create repository**.
3. On the new repo page, click **"uploading an existing file"**.
4. **Drag in ALL your app files**, keeping the `public` folder intact:
   - `server.js`, `package.json`, `package-lock.json`, `render.yaml`,
     `.env.example`, `.gitignore`, `README.md`, `START-WINDOWS.bat`,
     and the **`public`** folder (`index.html`, `styles.css`, `app.js`).
   - ⚠️ Do **NOT** upload a `.env` file or your real key — keys go in Render later.
5. Click **Commit changes**.

---

## Step 2 — Deploy on Render

1. Log in to Render → click **New +** → **Web Service**.
2. Click **Connect GitHub**, authorize it, and pick your `interview-ai` repo.
3. Render reads `render.yaml` automatically. Confirm these (it should prefill):
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Click **Create Web Service**.

---

## Step 3 — Add your secret key

1. In your new service, open the **Environment** tab.
2. Add / confirm these variables:
   | Key | Value |
   |---|---|
   | `OPENAI_API_KEY` | your `gsk_...` Groq key |
   | `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` |
   | `LLM_MODEL` | `llama-3.3-70b-versatile` |
   | `TAVILY_API_KEY` | *(optional — leave blank to use Keyless search)* |
3. Click **Save Changes**. Render will redeploy automatically.

---

## Step 4 — Open your app 🎉

- At the top of the Render page you'll see your URL, e.g.
  **`https://interview-ai-xxxx.onrender.com`**
- Click it. That's your live app — bookmark it, open it on your phone, share it.
- Because Render serves it over **HTTPS**, the **microphone and tab-audio** features work.

---

## Good to know about the free tier
- 😴 **Sleeps when idle:** after ~15 min of no use, the free service "spins down."
  The next visit takes ~30–60 seconds to wake up — then it's normal speed. This is fine for personal use.
- 🔒 **Your key is safe:** it lives in Render's encrypted environment settings, never in the public code.
- 🔁 **Updates:** change a file on GitHub → Render redeploys automatically.

---

## Privacy reminder
A public URL means anyone with the link can use *your* app (and your Groq quota). For personal use that's usually fine. If you want to lock it down later, I can add a simple password screen — just ask.

---

### Prefer not to use GitHub?
Render can also deploy from a **public Git URL** or you can use other free hosts (Railway, Fly.io, Cyclic). Tell me which you'd like and I'll write tailored steps.
