import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PROMPT_LENGTH = 8_000;

type GenerateRequest = {
  prompt?: unknown;
};

type JsonBody = Record<string, unknown>;

const systemInstruction = [
  "You are the AI backend for a Google Cloud hackathon webapp.",
  "Give concise, practical, product-oriented answers.",
  "When useful, structure the response as short sections or bullets.",
].join(" ");

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function envFlag(name: string): boolean {
  return ["1", "true", "yes", "on"].includes((envValue(name) ?? "").toLowerCase());
}

function modelName(): string {
  return envValue("GEMINI_MODEL") ?? DEFAULT_MODEL;
}

function parsePort(rawPort: string | undefined): number {
  const defaultPort = 3000;

  if (!rawPort || rawPort.trim().length === 0) {
    return defaultPort;
  }

  const portCandidate = rawPort.trim();

  if (!/^\d+$/.test(portCandidate)) {
    return defaultPort;
  }

  const parsedPort = Number(portCandidate);

  if (!Number.isSafeInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    return defaultPort;
  }

  return parsedPort;
}

function logServerError(message: string, error: unknown): void {
  // biome-ignore lint/suspicious/noConsole: Server-side diagnostics belong in Cloud Run logs.
  console.error(message, error);
}

function configuredProvider(): string {
  if (envFlag("GOOGLE_GENAI_USE_ENTERPRISE")) {
    return "gemini-enterprise-agent-platform";
  }

  return "gemini-developer-api";
}

function hasUsableCredentials(): boolean {
  if (envFlag("GOOGLE_GENAI_USE_ENTERPRISE")) {
    return Boolean(envValue("GOOGLE_CLOUD_PROJECT"));
  }

  return Boolean(envValue("GEMINI_API_KEY") ?? envValue("GOOGLE_API_KEY"));
}

function createClient(): GoogleGenAI {
  if (envFlag("GOOGLE_GENAI_USE_ENTERPRISE")) {
    const project = envValue("GOOGLE_CLOUD_PROJECT");

    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_ENTERPRISE=true.");
    }

    return new GoogleGenAI({
      enterprise: true,
      project,
      location: envValue("GOOGLE_CLOUD_LOCATION") ?? "global",
      apiVersion: "v1",
    });
  }

  const apiKey = envValue("GEMINI_API_KEY") ?? envValue("GOOGLE_API_KEY");

  if (!apiKey) {
    throw new Error("Set GEMINI_API_KEY or GOOGLE_API_KEY for local Gemini Developer API use.");
  }

  return new GoogleGenAI({ apiKey });
}

function json(status: number, body: JsonBody): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function html(): Response {
  return new Response(pageHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function parseJsonRequest(request: Request): Promise<GenerateRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("Expected application/json.");
  }

  return (await request.json()) as GenerateRequest;
}

async function generateText(prompt: string): Promise<string> {
  const client = createClient();
  const response = await client.models.generateContent({
    model: modelName(),
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.4,
      maxOutputTokens: 1_200,
    },
  });

  return response.text ?? "No text was returned by the model.";
}

async function handleGenerate(request: Request): Promise<Response> {
  let body: GenerateRequest;

  try {
    body = await parseJsonRequest(request);
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Invalid JSON request." });
  }

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return json(400, { error: "Prompt is required." });
  }

  const prompt = body.prompt.trim();

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return json(400, { error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.` });
  }

  if (!hasUsableCredentials()) {
    return json(503, {
      error:
        "Gemini is not configured. Set GEMINI_API_KEY locally or GOOGLE_GENAI_USE_ENTERPRISE=true with GOOGLE_CLOUD_PROJECT on Google Cloud.",
    });
  }

  try {
    const text = await generateText(prompt);
    return json(200, {
      text,
      model: modelName(),
      provider: configuredProvider(),
    });
  } catch (error) {
    logServerError("Gemini request failed.", error);
    return json(502, {
      error: "Gemini request failed. Check the server logs for details.",
    });
  }
}

function handleRequest(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return html();
  }

  if (request.method === "GET" && url.pathname === "/healthz") {
    return json(200, {
      ok: true,
      provider: configuredProvider(),
      geminiConfigured: hasUsableCredentials(),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/generate") {
    return handleGenerate(request);
  }

  return json(404, { error: "Not found." });
}

const port = parsePort(process.env.PORT);

Bun.serve({
  hostname: "0.0.0.0",
  port,
  fetch: handleRequest,
});

// biome-ignore lint/suspicious/noConsole: Startup logging is useful in Cloud Run logs.
console.log(`Saskatoon webapp listening on http://0.0.0.0:${port}`);

const pageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Saskatoon AI</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f4ee;
        --ink: #181816;
        --muted: #68655f;
        --line: #d8d2c5;
        --panel: #fffdf8;
        --accent: #0f7a65;
        --accent-ink: #ffffff;
        --warn: #9b5a14;
        --shadow: 0 18px 44px rgba(37, 34, 28, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--ink);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      button,
      textarea {
        font: inherit;
      }

      .shell {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        min-height: 56px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 760;
        letter-spacing: 0;
      }

      .mark {
        display: grid;
        width: 36px;
        height: 36px;
        place-items: center;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
        color: var(--accent);
        font-weight: 900;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 14px;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 99px;
        background: var(--warn);
      }

      main {
        display: grid;
        grid-template-columns: minmax(0, 0.92fr) minmax(360px, 1.08fr);
        gap: 28px;
        align-items: stretch;
        padding: 40px 0 0;
      }

      .intro {
        display: flex;
        min-height: 560px;
        flex-direction: column;
        justify-content: space-between;
        padding: 8px 0 18px;
      }

      h1 {
        max-width: 680px;
        margin: 0;
        font-size: clamp(42px, 6vw, 76px);
        line-height: 0.96;
        letter-spacing: 0;
      }

      .lede {
        max-width: 560px;
        margin: 24px 0 0;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.6;
      }

      .facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        max-width: 620px;
      }

      .fact {
        border-top: 1px solid var(--line);
        padding-top: 14px;
      }

      .fact strong {
        display: block;
        font-size: 15px;
      }

      .fact span {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.4;
      }

      .workspace {
        display: flex;
        min-height: 560px;
        flex-direction: column;
        gap: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        box-shadow: var(--shadow);
        padding: 16px;
      }

      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 36px;
      }

      .toolbar h2 {
        margin: 0;
        font-size: 15px;
        letter-spacing: 0;
      }

      .model {
        color: var(--muted);
        font-size: 13px;
      }

      textarea {
        width: 100%;
        min-height: 168px;
        resize: vertical;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
        color: var(--ink);
        padding: 14px;
        line-height: 1.5;
        outline: none;
      }

      textarea:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(15, 122, 101, 0.16);
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .count {
        color: var(--muted);
        font-size: 13px;
      }

      button {
        display: inline-flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 0;
        border-radius: 8px;
        background: var(--accent);
        color: var(--accent-ink);
        cursor: pointer;
        font-weight: 720;
        padding: 0 16px;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.68;
      }

      .output {
        flex: 1;
        min-height: 220px;
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fbfaf6;
        padding: 16px;
        white-space: pre-wrap;
        line-height: 1.55;
      }

      .output[data-empty="true"] {
        color: var(--muted);
      }

      @media (max-width: 860px) {
        main {
          grid-template-columns: 1fr;
          padding-top: 28px;
        }

        .intro,
        .workspace {
          min-height: auto;
        }

        .intro {
          gap: 36px;
        }
      }

      @media (max-width: 620px) {
        .shell {
          width: min(100vw - 24px, 1120px);
          padding-top: 18px;
        }

        header,
        .actions {
          align-items: flex-start;
          flex-direction: column;
        }

        h1 {
          font-size: 42px;
        }

        .facts {
          grid-template-columns: 1fr;
        }

        button {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <div class="brand">
          <div class="mark" aria-hidden="true">S</div>
          <span>Saskatoon AI</span>
        </div>
        <div class="status">
          <span class="dot" id="statusDot"></span>
          <span id="statusText">Checking Gemini</span>
        </div>
      </header>

      <main>
        <section class="intro" aria-labelledby="headline">
          <div>
            <h1 id="headline">Ship a Google Cloud AI webapp fast.</h1>
            <p class="lede">
              A Cloud Run-ready starter with Gemini wired through a server endpoint, keeping
              credentials out of the browser and leaving room for Agent Platform workflows.
            </p>
          </div>
          <div class="facts" aria-label="Stack">
            <div class="fact">
              <strong>Bun + TypeScript</strong>
              <span>Single runtime for local development and production.</span>
            </div>
            <div class="fact">
              <strong>Gemini SDK</strong>
              <span>Uses the current Google GenAI package server-side.</span>
            </div>
            <div class="fact">
              <strong>Cloud Run</strong>
              <span>Listens on PORT and binds to 0.0.0.0.</span>
            </div>
          </div>
        </section>

        <section class="workspace" aria-label="Gemini workspace">
          <div class="toolbar">
            <h2>Prompt</h2>
            <span class="model" id="modelLabel">gemini-2.5-flash</span>
          </div>
          <textarea
            id="prompt"
            maxlength="8000"
            spellcheck="true"
          >Draft a 90-second hackathon demo narrative for this app. Include the problem, the Google Cloud architecture, and the user payoff.</textarea>
          <div class="actions">
            <span class="count" id="count">0 / 8000</span>
            <button id="submit" type="button">
              <span aria-hidden="true">-></span>
              Generate
            </button>
          </div>
          <div class="output" id="output" data-empty="true">Gemini output will appear here.</div>
        </section>
      </main>
    </div>

    <script>
      const promptEl = document.querySelector("#prompt");
      const countEl = document.querySelector("#count");
      const outputEl = document.querySelector("#output");
      const submitEl = document.querySelector("#submit");
      const statusTextEl = document.querySelector("#statusText");
      const statusDotEl = document.querySelector("#statusDot");
      const modelLabelEl = document.querySelector("#modelLabel");

      function setOutput(text, isEmpty = false) {
        outputEl.textContent = text;
        outputEl.dataset.empty = String(isEmpty);
      }

      function updateCount() {
        countEl.textContent = promptEl.value.length + " / 8000";
      }

      async function refreshStatus() {
        try {
          const response = await fetch("/healthz");
          const data = await response.json();
          statusTextEl.textContent = data.geminiConfigured ? "Gemini configured" : "Gemini not configured";
          statusDotEl.style.background = data.geminiConfigured ? "#0f7a65" : "#9b5a14";
        } catch {
          statusTextEl.textContent = "Status unavailable";
          statusDotEl.style.background = "#a43f3a";
        }
      }

      async function generate() {
        const prompt = promptEl.value.trim();

        if (!prompt) {
          setOutput("Prompt is required.", true);
          return;
        }

        submitEl.disabled = true;
        setOutput("Generating...");

        try {
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const data = await response.json();

          if (!response.ok) {
            setOutput(data.error ?? "Request failed.", true);
            return;
          }

          modelLabelEl.textContent = data.model ?? "Gemini";
          setOutput(data.text ?? "No text returned.");
        } catch {
          setOutput("Request failed before reaching the server.", true);
        } finally {
          submitEl.disabled = false;
        }
      }

      promptEl.addEventListener("input", updateCount);
      submitEl.addEventListener("click", generate);
      promptEl.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          generate();
        }
      });

      updateCount();
      refreshStatus();
    </script>
  </body>
</html>`;
