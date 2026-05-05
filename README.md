# Scaler Clone Agent

A conversational CLI agent — like Cursor or Windsurf — that you chat with directly in the terminal. Give it a natural-language instruction and it reasons through the task, calls real tools, and produces working files on disk. Its headline use case is cloning the [Scaler Academy](https://www.scaler.com) website into a fully working `index.html` + `styles.css` + `script.js`.

> Submission for **GenAI Assignment 02 — AI Agent CLI Tool**.

---

## Demo

```
$ npm start
Scaler Clone Agent — chat with the agent. Type 'exit' to quit.

you> Clone the Scaler Academy website with header, hero and footer into ./scaler_clone

🚀 START: User wants a Scaler Academy clone with header, hero, and footer.
🤔 THINK: I should fetch scaler.com first to study the real layout.
🔧 TOOL : fetchUrl("https://www.scaler.com")
👀 OBS  : <!doctype html><html lang="en">...
🤔 THINK: The header has nav links (Courses, Academy, For Business) and a CTA...
🔧 TOOL : writeFile({"path":"scaler_clone/index.html","content":"..."})
🔧 TOOL : writeFile({"path":"scaler_clone/styles.css","content":"..."})
🔧 TOOL : writeFile({"path":"scaler_clone/script.js","content":"..."})
✅ OUTPUT: Created scaler_clone/. Open scaler_clone/index.html in your browser.
```

Then `open scaler_clone/index.html` and the page loads in your browser.

---

## How it works — the agent loop

The agent follows a strict, repeating cycle until the task is done:

```
START → THINK → THINK → … → TOOL → OBSERVE → THINK → … → TOOL → OBSERVE → … → OUTPUT
```

- **START** — restates what the user asked for.
- **THINK** — multiple reasoning steps before any action. Forces the model to plan.
- **TOOL** — calls one of the available tools (see below).
- **OBSERVE** — the tool's result is fed back into the conversation.
- **OUTPUT** — final summary; the loop ends and control returns to the user.

Every model response is a **single JSON object** of the shape:

```json
{ "step": "TOOL", "tool_name": "writeFile", "tool_args": { "path": "...", "content": "..." } }
```

OpenAI's `response_format: json_object` mode is enabled so the model cannot accidentally emit prose or markdown fences.

The full message history persists across user turns, so you can iterate conversationally:

```
you> the hero looks plain, add a gradient and a primary CTA button
you> the footer is missing, add one with copyright and social icons
```

Each follow-up triggers more THINK / TOOL / OBSERVE cycles until the next OUTPUT.

---

## Tools available to the agent

| Tool | Signature | What it does |
|---|---|---|
| `writeFile` | `{ path, content }` | Writes a file (creates parent dirs). The primary tool for emitting HTML/CSS/JS. |
| `readLocalFile` | `path` | Reads back a file the agent previously wrote, for iteration. |
| `fetchUrl` | `url` | HTTP GET, body truncated to ~18k chars. Lets the agent study scaler.com before cloning. |
| `executeCommand` | `cmd` | Runs a shell command. Used for `mkdir`, `ls`, etc. |
| `getWeather` | `city` | Demo tool — live weather via wttr.in. |
| `getGithubUser` | `username` | Demo tool — public GitHub profile data. |

The dispatcher accepts both string and JSON-object arguments, surfaces tool errors back as observations (so the agent can recover instead of crashing), and rejects unknown tool names with a helpful list of available ones.

---

## Setup

Requires Node.js 18+ and an OpenAI API key.

```bash
git clone <your-repo-url>
cd "GenAI Assignment 2"
npm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY=sk-...
```

---

## Usage

**Interactive chat mode (default):**
```bash
npm start
```
Then type instructions at the `you>` prompt. Type `exit` or `quit` to leave.

**One-shot mode** — useful for clean demo recordings or scripting:
```bash
node index.js --task "Clone the Scaler Academy website with header, hero and footer into ./scaler_clone"
```

The agent runs the full loop once and exits.

---

## Project structure

```
.
├── index.js          # the entire agent: tools, loop, CLI
├── package.json      # dependencies (openai, axios, dotenv)
├── .env.example      # template for OPENAI_API_KEY
├── .gitignore        # excludes .env, node_modules, generated output
└── README.md         # you are here
```

Generated output lands in `./scaler_clone/` (or whichever folder you ask for). That folder is gitignored — it's an output artifact, not source.

---

## Testing

**1. Smoke test — boots without an API key:**
```bash
echo "exit" | node index.js
# expect: "Missing OPENAI_API_KEY..."
```

**2. Smoke test — boots with a key:**
```bash
echo "exit" | OPENAI_API_KEY=sk-fake node index.js
# expect: "Scaler Clone Agent — chat with the agent..."
```

**3. End-to-end:**
```bash
npm start
you> Clone Scaler Academy (header, hero, footer) into ./scaler_clone
# wait for ✅ OUTPUT
open scaler_clone/index.html
```
Verify in browser: header with nav + CTA, hero with headline + CTA, footer with link columns, no console errors, layout holds at 375px width.

**4. Iteration:**
```
you> the hero looks too plain, add a gradient background and a primary CTA
```
Confirms the loop continues across turns and re-writes only affected files.

**5. Error handling:**
```
you> fetch https://this-domain-does-not-exist-xyz.com and tell me about it
```
Agent should observe the error, THINK about it, and recover with an OUTPUT — not crash.

---

## Design notes

- **Why a single JSON object per step?** It makes the loop fully deterministic to parse, and `json_object` response format prevents the model from drifting into prose.
- **Why message history persists across user turns?** It enables Cursor-style multi-turn iteration without re-fetching scaler.com or re-explaining context every time.
- **Why both `executeCommand` and `writeFile`?** `executeCommand` alone is fragile for multi-line HTML/CSS — quoting hell. `writeFile` takes structured args and creates parent dirs, so the agent can emit big files in one shot.
- **Why a `fetchUrl` tool?** Without it, the model would hallucinate Scaler's structure from training data. With it, the agent grounds the clone in real markup it just read.

---

## Marking-scheme alignment

| Criterion | Where to look |
|---|---|
| **Agent Loop & Reasoning** | START/THINK/TOOL/OBSERVE/OUTPUT in `index.js` (`runAgent`), persistent message history across user turns, JSON-mode parsing with retry, graceful tool errors |
| **Quality of Cloned Website** | System prompt encodes Scaler's brand palette, layout, semantic HTML, responsive breakpoints, and a working JS interaction (mobile nav toggle) |
| **Code Quality & Documentation** | Single-file agent with clear sections, named tools, this README, `.env.example`, `.gitignore` |

---

## License

MIT.
