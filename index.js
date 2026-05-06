import "dotenv/config";
import axios from "axios";
import Groq from "groq-sdk";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import readline from "readline/promises";

let client;

async function getWeather(args) {
  const city = typeof args === "string" ? args : args.city;
  const url = `https://wttr.in/${city.toLowerCase()}?format=%C+%t`;
  const { data } = await axios.get(url, { responseType: "text" });
  return `The weather of ${city} is ${data}`;
}

async function getGithubUser(args) {
  const username = typeof args === "string" ? args : args.username;
  const { data } = await axios.get(`https://api.github.com/users/${username}`);
  return {
    login: data.login,
    name: data.name,
    blog: data.blog,
    public_repos: data.public_repos,
  };
}

async function executeCommand(args) {
  const cmd = typeof args === "string" ? args : args.cmd;
  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        resolve(`ERROR: ${error.message}\n${stderr || ""}`);
      } else {
        resolve(stdout || `(no output) command "${cmd}" completed`);
      }
    });
  });
}

async function writeFile(args) {
  const obj = typeof args === "string" ? JSON.parse(args) : args;
  const filePath = obj.path;
  const content = obj.content ?? "";
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return `Wrote ${content.length} bytes to ${filePath}`;
}

async function readLocalFile(args) {
  const filePath = typeof args === "string" ? args : args.path;
  return await fs.readFile(filePath, "utf8");
}

async function fetchUrl(args) {
  const url = typeof args === "string" ? args : args.url;
  const { data } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0 ScalerCloneAgent" },
    timeout: 15000,
  });
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const MAX = 18000;
  return text.length > MAX ? text.slice(0, MAX) + "\n...[truncated]" : text;
}

const tools = {
  getWeather,
  getGithubUser,
  executeCommand,
  writeFile,
  readLocalFile,
  fetchUrl,
};

const SYSTEM_PROMPT = `
You are a CLI coding agent that works in strict START → THINK → TOOL → OBSERVE → OUTPUT loops.
Break large tasks into many small steps. Think multiple times before acting.

Tools:
1. getWeather(city: string) — live weather of a city.
2. getGithubUser(username: string) — public GitHub info about a user.
3. executeCommand(cmd: string) — runs a shell command in the user's machine. NOTE: 'cd' does NOT persist across calls; always use full relative paths from the project root instead of relying on cd.
4. writeFile({ path: string, content: string }) — writes content to a file (creates parent dirs). Pass tool_args as a JSON object string.
5. readLocalFile(path: string) — read an existing local file.
6. fetchUrl(url: string) — HTTP GET a URL and return the body (truncated to ~18k chars). Use this to study real websites before cloning them.

Rules:
1. ALWAYS reply with a single JSON object — no prose, no markdown fences.
2. Do exactly ONE step per response and wait for the next message.
3. After every TOOL step, wait for the OBSERVE step before continuing.
4. Do several THINK steps before any TOOL step.
5. For website-clone tasks: first fetchUrl the target site, THINK about the layout (header, hero, footer), then writeFile index.html, styles.css, script.js separately. Put generated files inside a clearly named subfolder (e.g. ./scaler_clone/).
6. Generate self-contained, working code. Inline reasonable placeholder images via https://placehold.co or unicode/emoji icons if real assets aren't available.
7. End every task with a single OUTPUT step summarizing what was created and how to open it.

Scaler-specific clone guidance (when the user asks to clone Scaler / scaler.com):
- Brand palette: deep navy/dark background (#0A0E27 to #131A3D), accent blue (#1A73E8 / #4F8BFF), white text, soft gradient highlights. Use a modern sans-serif (Inter, Poppins, or system-ui).
- Header: fixed top, Scaler logo (text "Scaler" in bold white), nav links (Courses, Academy, For Business, Login), prominent "Book a Free Counselling" CTA button on the right.
- Hero: large headline like "Power Ahead in Your Tech Career", supportive subheadline, two CTAs ("Get Started" primary, "Watch Demo" secondary), placeholder hero image or illustration on the right, subtle gradient background.
- Footer: 3–4 columns (About, Programs, Resources, Contact) with links, social icons, and a copyright line at the bottom.
- Use semantic HTML5 (<header>, <nav>, <section>, <footer>) and CSS Grid/Flexbox. Make it responsive — mobile-friendly at 375px width.
- Include real JavaScript: a mobile hamburger nav toggle and a smooth-scroll behavior at minimum. Don't ship an empty script.js.
- Aim for visual quality high enough that someone would say "that looks like Scaler" at a glance.

Output format — "step" MUST be exactly one of: START, THINK, TOOL, OBSERVE, OUTPUT.
NEVER use a tool name as the step (e.g. "step": "WRITEFILE" is WRONG). To call a tool, use:
  { "step": "TOOL", "tool_name": "writeFile", "tool_args": { "path": "...", "content": "..." } }

Allowed shapes:
{ "step": "START",  "content": "..." }
{ "step": "THINK",  "content": "..." }
{ "step": "TOOL",   "tool_name": "...", "tool_args": "..." | { ... } }
{ "step": "OUTPUT", "content": "..." }

Worked example for writeFile:
WRONG: { "step": "WRITEFILE", "tool_args": { "path": "a.html", "content": "<h1>hi</h1>" } }
RIGHT: { "step": "TOOL", "tool_name": "writeFile", "tool_args": { "path": "a.html", "content": "<h1>hi</h1>" } }

Example:
user: What is the weather of Delhi?
{ "step": "START",  "content": "User wants the current weather of Delhi." }
{ "step": "THINK",  "content": "I have getWeather which fetches live weather." }
{ "step": "TOOL",   "tool_name": "getWeather", "tool_args": "Delhi" }
{ "step": "OBSERVE","content": "The weather of Delhi is Partly cloudy +33°C" }
{ "step": "THINK",  "content": "Got the data, now I'll summarize for the user." }
{ "step": "OUTPUT", "content": "Weather of Delhi is Partly cloudy +33°C — carry an umbrella." }
`.trim();

function preview(v, n = 100) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function runAgent(userInput, messages) {
  messages.push({ role: "user", content: userInput });

  while (true) {
    const resp = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
    });

    const raw = resp.choices[0].message.content;
    let parsed;
    try {
      // First try direct parse
      parsed = JSON.parse(raw);
    } catch {
      // Try extracting JSON object from surrounding text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
      }
      if (!parsed) {
        console.log("⚠️  Model returned invalid JSON, asking it to retry.");
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: "Your last response was not valid JSON. Reply with a single valid JSON object only.",
        });
        continue;
      }
    }

    messages.push({ role: "assistant", content: JSON.stringify(parsed) });

    // Self-heal: if the model wrote a tool name as the step (e.g. "step":"WRITEFILE"),
    // and the value matches a known tool, treat it as a TOOL call.
    const stepUpper = String(parsed.step || "").toUpperCase();
    const knownSteps = new Set(["START", "THINK", "TOOL", "OBSERVE", "OUTPUT"]);
    if (!knownSteps.has(stepUpper)) {
      const toolKey = Object.keys(tools).find((k) => k.toUpperCase() === stepUpper);
      if (toolKey) {
        parsed.step = "TOOL";
        parsed.tool_name = parsed.tool_name || toolKey;
      }
    }

    switch (parsed.step) {
      case "START":
        console.log(`\n🚀 START: ${parsed.content}`);
        break;
      case "THINK":
        console.log(`🤔 THINK: ${parsed.content}`);
        break;
      case "TOOL": {
        console.log(`🔧 TOOL : ${parsed.tool_name}(${preview(parsed.tool_args)})`);
        const fn = tools[parsed.tool_name];
        let observation;
        if (!fn) {
          observation = `Tool "${parsed.tool_name}" is not available. Available: ${Object.keys(tools).join(", ")}`;
        } else {
          try {
            observation = await fn(parsed.tool_args);
          } catch (e) {
            observation = `ERROR running ${parsed.tool_name}: ${e.message}`;
          }
        }
        console.log(`👀 OBS  : ${preview(observation, 140)}`);
        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: observation }),
        });
        break;
      }
      case "OUTPUT":
        console.log(`\n✅ OUTPUT: ${parsed.content}\n`);
        return;
      default: {
        console.log(`⚠️  Unknown step "${parsed.step}" — asking the model to correct format.`);
        messages.push({
          role: "user",
          content: JSON.stringify({
            step: "OBSERVE",
            content: `Your last response had step="${parsed.step}", which is not allowed. "step" must be exactly one of START, THINK, TOOL, OBSERVE, OUTPUT. To call a tool, use { "step": "TOOL", "tool_name": "<name>", "tool_args": ... }. Please retry the same intent with a valid step.`,
          }),
        });
        break;
      }
    }
  }
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  const taskFlagIdx = process.argv.indexOf("--task");
  if (taskFlagIdx !== -1 && process.argv[taskFlagIdx + 1]) {
    const task = process.argv[taskFlagIdx + 1];
    console.log(`Scaler Clone Agent — one-shot mode\nTask: ${task}\n`);
    await runAgent(task, messages);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("Scaler Clone Agent — chat with the agent. Type 'exit' to quit.");
  console.log("Try: \"Clone the Scaler Academy website (header, hero, footer) into ./scaler_clone\"\n");

  while (true) {
    let input;
    try {
      input = (await rl.question("you> ")).trim();
    } catch {
      break;
    }
    if (!input) continue;
    if (input === "exit" || input === "quit") break;
    try {
      await runAgent(input, messages);
    } catch (e) {
      console.error(`agent error: ${e.message}`);
    }
  }
  rl.close();
}

main();
