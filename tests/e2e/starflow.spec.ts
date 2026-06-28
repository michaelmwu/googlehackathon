import { test as base, expect, type Page } from "@playwright/test";

const test = base.extend<{ consoleFailures: string[] }>({
  consoleFailures: [
    async ({ page }, use) => {
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          failures.push(message.text());
        }
      });

      await use(failures);
      expect(failures).toEqual([]);
    },
    { auto: true },
  ],
});

type User = {
  id: string;
  email: string;
  displayName: string | null;
  isDemo: boolean;
};

type Step = {
  id: string;
  content: string;
  done: boolean;
  position: number;
};

type FocusTask = {
  id: string;
  title: string;
  whyItMatters: string | null;
  encouragement: string | null;
  emotionalTone: string | null;
  otherTasks: string[];
  steps: Step[];
};

type Memory = {
  id: string;
  content: string;
  createdAt: string;
};

type Reflection = {
  id: string;
  summary: string | null;
  carryForward: string | null;
  createdAt: string;
};

type AppState = {
  task: FocusTask | null;
  reflection: {
    count: number;
    latest: Reflection | null;
  };
  memory: {
    count: number;
    latest: Memory | null;
  };
};

type ApiRequest = {
  method: string;
  path: string;
  body: unknown;
};

type MockOptions = {
  signedIn?: boolean;
  memories?: Memory[];
  task?: FocusTask | null;
  reflections?: Reflection[];
};

const now = "2026-06-28T12:00:00.000Z";

function makeDemoUser(sessionNumber: number): User {
  return {
    id: `user-demo-${sessionNumber}`,
    email: `demo+playwright-${sessionNumber}@starflow.local`,
    displayName: "Demo",
    isDemo: true,
  };
}

function makeTask(overrides: Partial<FocusTask> = {}): FocusTask {
  return {
    id: "task-1",
    title: "Draft the Starflow CI plan",
    whyItMatters: "Reliable checks make the next change easier to trust.",
    encouragement: "Start with the first small verification.",
    emotionalTone: "focused",
    otherTasks: ["Update README later"],
    steps: [
      { id: "step-1", content: "Open the workflow file", done: false, position: 0 },
      { id: "step-2", content: "Run the browser checks", done: false, position: 1 },
      { id: "step-3", content: "Share the validation notes", done: false, position: 2 },
    ],
    ...overrides,
  };
}

function makeAppState(memories: Memory[], task: FocusTask | null, reflections: Reflection[]) {
  return {
    task,
    reflection: {
      count: reflections.length,
      latest: reflections[0] ?? null,
    },
    memory: {
      count: memories.length,
      latest: memories[0] ?? null,
    },
  } satisfies AppState;
}

async function installApiMocks(page: Page, options: MockOptions = {}) {
  let demoSessionCount = options.signedIn ? 1 : 0;
  let activeUser = options.signedIn ? makeDemoUser(demoSessionCount) : null;
  let signedIn = Boolean(activeUser);
  let memories = [...(options.memories ?? [])];
  let reflections = [...(options.reflections ?? [])];
  const requests: ApiRequest[] = [];
  let appState = makeAppState(memories, options.task ?? null, reflections);

  const updateState = () => {
    appState = makeAppState(memories, appState.task, reflections);
  };
  const resetUserOwnedState = () => {
    memories = [];
    reflections = [];
    appState = makeAppState(memories, null, reflections);
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body: unknown = null;

    if (request.postData()) {
      body = JSON.parse(request.postData() ?? "null") as unknown;
    }

    requests.push({ method, path: url.pathname, body });

    const fulfill = async (payload: unknown, status = 200) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    };
    const unauthorized = async (message: string) => fulfill({ error: message }, 401);

    if (url.pathname === "/api/config" && method === "GET") {
      await fulfill({
        googleOAuthClientId: null,
        geminiConfigured: false,
        model: "gemini-3.5-flash",
      });
      return;
    }

    if (url.pathname === "/api/me" && method === "GET") {
      await fulfill({ user: signedIn ? activeUser : null });
      return;
    }

    if (url.pathname === "/api/auth/demo" && method === "POST") {
      demoSessionCount += 1;
      activeUser = makeDemoUser(demoSessionCount);
      signedIn = true;
      resetUserOwnedState();
      await fulfill({ user: activeUser });
      return;
    }

    if (url.pathname === "/api/logout" && method === "POST") {
      activeUser = null;
      signedIn = false;
      resetUserOwnedState();
      await fulfill({ ok: true });
      return;
    }

    if (!signedIn) {
      await unauthorized("Sign in before using Starflow.");
      return;
    }

    if (url.pathname === "/api/state" && method === "GET") {
      await fulfill(appState);
      return;
    }

    if (url.pathname === "/api/memories" && method === "POST") {
      const text = typeof body === "object" && body && "text" in body ? String(body.text) : "";
      const memory = {
        id: `memory-${memories.length + 1}`,
        content: text.trim(),
        createdAt: now,
      };
      memories.unshift(memory);
      updateState();
      await fulfill({ memory, memoryState: appState.memory });
      return;
    }

    if (url.pathname === "/api/memories/categorized" && method === "GET") {
      await fulfill({
        total: memories.length,
        usedModel: false,
        model: null,
        categories:
          memories.length > 0
            ? [
                {
                  name: "Creative work",
                  summary: "Ideas and tasks that want a concrete first move.",
                  memories,
                },
              ]
            : [],
      });
      return;
    }

    if (url.pathname === "/api/triage" && method === "POST") {
      appState = { ...appState, task: makeTask() };
      await fulfill({ task: appState.task });
      return;
    }

    if (url.pathname.startsWith("/api/steps/") && method === "PATCH") {
      const stepId = url.pathname.split("/").at(-1);
      const done = typeof body === "object" && body && "done" in body ? Boolean(body.done) : false;
      const nextTask = appState.task
        ? {
            ...appState.task,
            steps: appState.task.steps.map((step) =>
              step.id === stepId ? { ...step, done } : step,
            ),
          }
        : null;
      appState = { ...appState, task: nextTask };
      await fulfill({ step: nextTask?.steps.find((step) => step.id === stepId) });
      return;
    }

    if (url.pathname === "/api/reflect/report" && method === "GET") {
      await fulfill({
        report: {
          headline: "A steady return",
          encouragement: "You made the work visible and kept the next step small.",
          observations: ["You saved one clear thought.", "You moved it into Flow."],
          threads: [{ label: "Momentum", detail: "Small checks are reducing uncertainty." }],
          carryForward: "One next step",
        },
        usedModel: false,
        example: false,
      });
      return;
    }

    if (url.pathname === "/api/reflections" && method === "GET") {
      await fulfill({ reflections });
      return;
    }

    if (url.pathname === "/api/reflect" && method === "POST") {
      const reflection = {
        id: `reflection-${reflections.length + 1}`,
        summary: "Small win: the loop stayed manageable.",
        carryForward:
          typeof body === "object" && body && "carryForward" in body
            ? String(body.carryForward)
            : "One next step",
        createdAt: now,
      };
      reflections.unshift(reflection);
      updateState();
      await fulfill({ reflection });
      return;
    }

    if (url.pathname === "/api/chat" && method === "POST") {
      await fulfill({
        reply: "I tightened that into one doable sentence.",
        uiPatch: {
          captureText: "Reply to Jordan with one honest sentence.",
        },
        task: null,
      });
      return;
    }

    await fulfill({ error: `Unhandled mock route: ${method} ${url.pathname}` }, 500);
  });

  return { requests };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test("landing explains the loop and routes into demo sign-in", async ({ isMobile, page }) => {
  await installApiMocks(page);

  await page.goto("/");

  await expect(page).toHaveTitle(/Starflow/);
  await expect(page.getByRole("heading", { name: /Starflow|scattered thoughts/ })).toBeVisible();

  if (!isMobile) {
    await expect(page.getByText("Scatter, Flow, Reflect.")).toBeVisible();
  }

  await page
    .getByRole("button", { name: /Begin Ritual|Try the Starflow loop/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Start where you are." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as demo" })).toBeEnabled();
});

test("demo users can save a Scatter thought without leaving the page", async ({ page }) => {
  const { requests } = await installApiMocks(page);

  await page.goto("/app");
  await page.getByRole("button", { name: "Continue as demo" }).click();

  const thought = "I need to prepare the demo script and send one update.";
  const textArea = page.getByPlaceholder("Type a spark of thought...");
  await expect(textArea).toBeVisible();
  await textArea.fill(thought);
  await expect(page.getByText(`${thought.length} / 8000`)).toBeVisible();

  await page.getByRole("button", { name: "Save to memory" }).click();

  await expect(page.getByText("1 thought remembered.")).toBeVisible();
  await expect(textArea).toHaveValue("");
  expect(
    requests.some(
      (request) =>
        request.method === "POST" &&
        request.path === "/api/memories" &&
        typeof request.body === "object" &&
        request.body &&
        "text" in request.body &&
        request.body.text === thought,
    ),
  ).toBe(true);
});

test("a new demo sign-in starts with empty user-owned state", async ({ page }) => {
  await installApiMocks(page);

  await page.goto("/app");
  await page.getByRole("button", { name: "Continue as demo" }).click();

  await page.getByPlaceholder("Type a spark of thought...").fill("Remember this only once.");
  await page.getByRole("button", { name: "Save to memory" }).click();
  await expect(page.getByText("1 thought remembered.")).toBeVisible();

  await page.getByRole("button", { name: "Demo" }).first().click();
  await expect(page.getByRole("heading", { name: "Start where you are." })).toBeVisible();

  await page.getByRole("button", { name: "Continue as demo" }).click();
  await expect(page.getByText("1 thought remembered.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View categorized thoughts" })).toHaveCount(0);
});

test("saved thoughts open the thought map and can start a Flow task", async ({ page }) => {
  const memory = {
    id: "memory-1",
    content: "Add CI checks for linting, build, and browser coverage.",
    createdAt: now,
  };
  const { requests } = await installApiMocks(page, { signedIn: true, memories: [memory] });

  await page.goto("/app");
  await page.getByRole("button", { name: "View categorized thoughts" }).click();

  await expect(page.getByRole("heading", { name: "What you have been carrying." })).toBeVisible();
  await expect(page.getByText("Creative work")).toBeVisible();
  await expect(page.getByText(memory.content)).toBeVisible();

  await page.getByRole("button", { name: "Start Flow" }).click();

  await expect(page.getByRole("heading", { name: "Draft the Starflow CI plan" })).toBeVisible();
  await expect(page.getByText("Open the workflow file")).toBeVisible();
  expect(requests.some((request) => request.path === "/api/triage")).toBe(true);
});

test("focus steps persist completion and reveal the reflection handoff", async ({ page }) => {
  const { requests } = await installApiMocks(page, {
    signedIn: true,
    task: makeTask(),
  });

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "Draft the Starflow CI plan" })).toBeVisible();
  await page.getByRole("button", { name: /Open the workflow file/ }).click();
  await page.getByRole("button", { name: /Run the browser checks/ }).click();
  await page.getByRole("button", { name: /Share the validation notes/ }).click();

  await expect(page.getByText("Flow complete")).toBeVisible();
  await page.locator("#app").getByRole("button", { name: "Reflect" }).last().click();

  await expect(page.getByRole("heading", { name: "A steady return" })).toBeVisible();
  expect(
    requests.filter(
      (request) => request.method === "PATCH" && request.path.startsWith("/api/steps/"),
    ),
  ).toHaveLength(3);
});

test("Reflect loads the day map and saves a reflection", async ({ page }) => {
  await installApiMocks(page, { signedIn: true, memories: [] });

  await page.goto("/app");
  await page.getByRole("button", { name: "Reflect" }).click();

  await expect(page.getByRole("heading", { name: "A steady return" })).toBeVisible();
  await page.getByRole("button", { name: "I made something visible" }).click();
  await page.getByRole("button", { name: "One next step" }).click();
  await page.getByRole("button", { name: "Save reflection" }).click();

  await expect(
    page
      .locator("div")
      .filter({ hasText: /^Small win: the loop stayed manageable\.$/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByText("1 saved reflections.")).toBeVisible();
});

test("the page agent can patch capture text through chat", async ({ page }) => {
  await installApiMocks(page, { signedIn: true });

  await page.goto("/app");
  await page.getByLabel("Open Starflow agent").click();
  await expect(page.getByText("Record and translate")).toBeVisible();

  await page.getByPlaceholder("Talk to me...").fill("rewrite this as a tiny next step");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("I tightened that into one doable sentence.")).toBeVisible();
  await expect(page.getByPlaceholder("Type a spark of thought...")).toHaveValue(
    "Reply to Jordan with one honest sentence.",
  );
});

test("mobile navigation keeps Scatter, Flow, and Reflect reachable", async ({ isMobile, page }) => {
  test.skip(!isMobile, "Bottom navigation is only rendered on mobile viewports.");

  const memory = {
    id: "memory-1",
    content: "Turn the latest work into a dependable check suite.",
    createdAt: now,
  };
  await installApiMocks(page, { signedIn: true, memories: [memory] });

  await page.goto("/app");

  const bottomNav = page.getByRole("navigation").filter({ hasText: "Scatter" }).last();
  await expect(bottomNav.getByRole("button", { name: "Scatter" })).toBeVisible();

  await bottomNav.getByRole("button", { name: "Flow" }).click();
  await expect(page.getByRole("heading", { name: "Draft the Starflow CI plan" })).toBeVisible();

  await bottomNav.getByRole("button", { name: "Reflect" }).click();
  await expect(page.getByRole("heading", { name: "A steady return" })).toBeVisible();
});
