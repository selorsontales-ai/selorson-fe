import { chromium } from 'playwright-core';

export const SIDECAR_PROTOCOL_VERSION = 1;

const DEFAULT_BRIDGE_TIMEOUT_MS = 30_000;
const DEFAULT_RUN_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const MAX_RUN_TIMEOUT_MS = 90 * 60_000;
const BRIDGE_DONE_STATES = new Set(['complete', 'completed', 'done', 'succeeded']);
const BRIDGE_FAILED_STATES = new Set(['error', 'failed']);
const BRIDGE_RATE_LIMIT_STATE = 'rate_limited';
const DEFAULT_RESUME_ACTION = 'continue';
const CHECKPOINT_SLOT = 'checkpoint';
// Claude states the limit in the conversation itself, not inside the Artifact
// frame, so the confirmation is read from the page text.
const RATE_LIMIT_TEXT =
  /hit your .{0,40}message limit|out of (free )?messages|reached your (usage |message )?limit|usage limit|hết lượt|hết hạn mức/i;
const RESET_CLOCK_TEXT = /(?:resets? at|until|lúc|đến)\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i;
const MAX_LIMIT_SCAN_CHARS = 30_000;

function boundedInteger(value, fallback, minimum, maximum) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeArtifactValue(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stateName(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (!value || typeof value !== 'object') return '';
  const state = value.status ?? value.state ?? value.phase ?? '';
  return typeof state === 'string' ? state.toLowerCase() : '';
}

/** "3:00 AM" / "15:00" → ISO timestamp of the next time that clock comes around. */
export function parseResetClock(label, now = new Date()) {
  const match = String(label ?? '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  const meridiem = match[3] ? match[3].toUpperCase() : null;
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  const reset = new Date(now);
  reset.setHours(hours, minutes, 0, 0);
  if (reset.getTime() <= now.getTime()) reset.setDate(reset.getDate() + 1);
  return reset.toISOString();
}

/**
 * Read the page for a confirmed account limit and the reset time Claude names.
 * Only this confirmation may rotate accounts; every other failure stops the job.
 */
export async function detectAccountLimit(page, now = new Date()) {
  try {
    const text = await page.evaluate(
      (limit) => (document.body.innerText || '').slice(0, limit),
      MAX_LIMIT_SCAN_CHARS
    );
    if (!RATE_LIMIT_TEXT.test(String(text ?? ''))) {
      return { limited: false, resetTime: null, resetAt: null };
    }
    const clock = String(text ?? '').match(RESET_CLOCK_TEXT);
    const resetTime = clock ? clock[1].trim() : null;
    return {
      limited: true,
      resetTime,
      resetAt: resetTime ? parseResetClock(resetTime, now) : null
    };
  } catch {
    // A detached or navigating page is not evidence of a rate limit.
    return { limited: false, resetTime: null, resetAt: null };
  }
}

function validateSelector(value, fallback) {
  const selector = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (selector.length > 200) throw new Error('DOM fallback selector is too long');
  return selector;
}

export function validateSidecarRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Sidecar request must be a JSON object');
  }
  if (request.protocolVersion !== SIDECAR_PROTOCOL_VERSION) {
    throw new Error(`Unsupported sidecar protocol version: ${request.protocolVersion}`);
  }
  if (typeof request.jobId !== 'string' || !request.jobId.trim()) {
    throw new Error('Sidecar request jobId is required');
  }
  if (typeof request.toolName !== 'string' || !request.toolName.trim()) {
    throw new Error('Sidecar request toolName is required');
  }
  if (typeof request.toolVersion !== 'string' || !request.toolVersion.trim()) {
    throw new Error('Sidecar request toolVersion is required');
  }
  if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input)) {
    throw new Error('Sidecar request input must be a JSON object');
  }
  if (
    request.checkpoint !== undefined &&
    request.checkpoint !== null &&
    (typeof request.checkpoint !== 'object' || Array.isArray(request.checkpoint))
  ) {
    throw new Error('Sidecar request checkpoint must be a JSON object');
  }

  let endpoint;
  try {
    endpoint = new URL(request.cdpEndpoint);
  } catch {
    throw new Error('Sidecar request cdpEndpoint is invalid');
  }
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port) {
    throw new Error('Sidecar CDP endpoint must be loopback HTTP with an explicit port');
  }

  return request;
}

async function bridgeOperation(frame, operation, payload = null) {
  return frame.evaluate(
    async ({ operation: requestedOperation, payload: operationPayload }) => {
      const bridge = window.__nf_ctl;
      if (requestedOperation === 'describe') {
        return {
          available: Boolean(bridge && bridge.schema),
          schema: bridge?.schema ?? null,
          tool: bridge?.tool ?? null
        };
      }
      if (!bridge || !bridge.schema) throw new Error('Artifact bridge is unavailable');

      switch (requestedOperation) {
        case 'configure':
          if (typeof bridge.configure !== 'function') return false;
          return bridge.configure(operationPayload);
        case 'import':
          if (typeof bridge.importFile !== 'function') return false;
          return bridge.importFile(
            operationPayload.slot,
            operationPayload.name,
            operationPayload.text
          );
        case 'run':
          if (typeof bridge.run !== 'function') throw new Error('Artifact bridge run() is unavailable');
          return (await bridge.run(operationPayload)) ?? true;
        case 'state':
          return bridge.getState?.() ?? window.__nf_signal ?? null;
        case 'checkpoint':
          return bridge.getCheckpoint?.() ?? null;
        case 'result':
          return bridge.getResult?.() ?? null;
        default:
          throw new Error(`Unknown Artifact bridge operation: ${requestedOperation}`);
      }
    },
    { operation, payload }
  );
}

async function findBridgeFrame(page, timeoutMs, sleep) {
  const deadline = Date.now() + timeoutMs;
  do {
    const frames = page.frames();
    const mainFrame = page.mainFrame();
    const orderedFrames = [...frames.filter((frame) => frame !== mainFrame), mainFrame];
    for (const frame of orderedFrames) {
      try {
        const descriptor = await bridgeOperation(frame, 'describe');
        if (descriptor?.available) return { frame, descriptor };
      } catch {
        // Cross-origin and transient frame errors are expected while Claude renders.
      }
    }
    if (Date.now() < deadline) await sleep(Math.min(100, timeoutMs));
  } while (Date.now() < deadline);
  return null;
}

async function waitForBridgeResult(frame, timeoutMs, pollIntervalMs, sleep) {
  const deadline = Date.now() + timeoutMs;
  do {
    const state = await bridgeOperation(frame, 'state');
    const currentState = stateName(state);
    if (currentState === BRIDGE_RATE_LIMIT_STATE) return { outcome: 'rate_limited', state };
    if (BRIDGE_FAILED_STATES.has(currentState)) {
      throw new Error(`Artifact bridge entered terminal state: ${currentState}`);
    }

    const result = await bridgeOperation(frame, 'result');
    if (result !== null && result !== undefined && result !== '') {
      return { outcome: 'result', state, result };
    }
    if (BRIDGE_DONE_STATES.has(currentState)) return { outcome: 'result', state, result: null };

    if (Date.now() < deadline) await sleep(pollIntervalMs);
  } while (Date.now() < deadline);
  return { outcome: 'timeout', state: null };
}

async function runBridge(page, frame, request, descriptor, runtime, emit) {
  const input = request.input;
  if (input.config && Object.keys(input.config).length > 0) {
    const configured = await bridgeOperation(frame, 'configure', input.config);
    if (configured !== true) throw new Error('Artifact bridge rejected configure()');
  }

  const imports = Array.isArray(input.imports) ? [...input.imports] : [];
  // Resuming means the Artifact is handed the progress of the previous account
  // and continues it. Running the original action instead would discard that
  // progress and produce a second draft of the same chapter.
  const resuming = request.checkpoint !== undefined && request.checkpoint !== null;
  if (resuming && !imports.some((imported) => imported?.slot === CHECKPOINT_SLOT)) {
    imports.push({
      slot: CHECKPOINT_SLOT,
      name: 'checkpoint.json',
      text: JSON.stringify(request.checkpoint)
    });
  }
  for (const imported of imports) {
    if (
      !imported ||
      typeof imported.slot !== 'string' ||
      typeof imported.name !== 'string' ||
      typeof imported.text !== 'string'
    ) {
      throw new Error('Artifact import requires string slot, name, and text fields');
    }
    const accepted = await bridgeOperation(frame, 'import', imported);
    if (accepted !== true) {
      throw new Error(`Artifact bridge rejected import slot: ${imported.slot}`);
    }
  }

  const action = resolveAction(input, resuming);
  const started = await bridgeOperation(frame, 'run', action);
  if (typeof started === 'string' && started.startsWith('ERR:')) {
    throw new Error(started.slice(4).trim() || 'Artifact bridge run() failed');
  }

  await emit({
    protocolVersion: SIDECAR_PROTOCOL_VERSION,
    jobId: request.jobId,
    kind: 'event',
    eventType: 'artifact_bridge_selected',
    payload: {
      bridge: 'artifact',
      schema: descriptor.schema,
      tool: descriptor.tool,
      action,
      resumed: resuming
    }
  });

  const completed = await waitForBridgeResult(
    frame,
    runtime.runTimeoutMs,
    runtime.pollIntervalMs,
    runtime.sleep
  );
  // Persist progress before deciding the outcome, so a rotation never trades
  // away work the Artifact already did.
  const checkpoint = normalizeArtifactValue(await bridgeOperation(frame, 'checkpoint'));
  if (checkpoint !== null) {
    await emit({
      protocolVersion: SIDECAR_PROTOCOL_VERSION,
      jobId: request.jobId,
      kind: 'checkpoint',
      payload: {
        schemaVersion: SIDECAR_PROTOCOL_VERSION,
        bridge: 'artifact',
        data: checkpoint
      }
    });
  }

  if (completed.outcome === 'rate_limited') {
    const limit = await detectAccountLimit(page, runtime.now());
    return rateLimited('artifact', limit, 'bridge');
  }
  if (completed.outcome === 'timeout') {
    // A silent stall is only a rotation reason when the page itself confirms
    // the account ran out; otherwise it stays a diagnosable failure.
    const limit = await detectAccountLimit(page, runtime.now());
    if (limit.limited) return rateLimited('artifact', limit, 'page_after_timeout');
    throw new Error(`Artifact bridge did not finish within ${runtime.runTimeoutMs} milliseconds`);
  }

  return {
    outcome: 'result',
    output: {
      schemaVersion: SIDECAR_PROTOCOL_VERSION,
      bridge: 'artifact',
      artifactSchema: descriptor.schema,
      artifactTool: descriptor.tool,
      state: completed.state,
      result: normalizeArtifactValue(completed.result)
    }
  };
}

function resolveAction(input, resuming) {
  const primary = typeof input.action === 'string' && input.action.trim() ? input.action.trim() : 'default';
  if (!resuming) return primary;
  return typeof input.resumeAction === 'string' && input.resumeAction.trim()
    ? input.resumeAction.trim()
    : DEFAULT_RESUME_ACTION;
}

function rateLimited(bridge, limit, source) {
  return {
    outcome: 'rate_limited',
    rateLimit: {
      bridge,
      source,
      resetAt: limit.resetAt,
      resetTime: limit.resetTime
    }
  };
}

async function frameWithSelector(page, selector) {
  for (const frame of page.frames()) {
    try {
      if ((await frame.locator(selector).count()) > 0) return frame;
    } catch {
      // Ignore detached frames and try the next bounded candidate.
    }
  }
  return null;
}

async function runDomFallback(page, request, runtime, emit) {
  const fallback = request.input.domFallback ?? {};
  const runSelector = validateSelector(fallback.runSelector, '[data-selorson-run]');
  const resultSelector = validateSelector(fallback.resultSelector, '[data-selorson-result]');
  const stateSelector = validateSelector(fallback.stateSelector, '[data-selorson-state]');
  const frame = await frameWithSelector(page, runSelector);
  if (!frame) throw new Error('Artifact bridge unavailable and DOM fallback run control was not found');

  await emit({
    protocolVersion: SIDECAR_PROTOCOL_VERSION,
    jobId: request.jobId,
    kind: 'event',
    eventType: 'artifact_bridge_selected',
    payload: { bridge: 'dom' }
  });
  await frame.locator(runSelector).first().click({ timeout: runtime.bridgeTimeoutMs });

  const deadline = Date.now() + runtime.runTimeoutMs;
  do {
    const stateLocator = frame.locator(stateSelector).first();
    const state =
      (await stateLocator.count()) > 0
        ? String((await stateLocator.textContent()) ?? '').trim().toLowerCase()
        : '';
    if (state === BRIDGE_RATE_LIMIT_STATE) {
      return rateLimited('dom', await detectAccountLimit(page, runtime.now()), 'dom_state');
    }
    if (BRIDGE_FAILED_STATES.has(state)) {
      throw new Error(`DOM fallback entered terminal state: ${state}`);
    }

    const resultLocator = frame.locator(resultSelector).first();
    if ((await resultLocator.count()) > 0) {
      const rawResult = await resultLocator.evaluate((element) =>
        'value' in element ? element.value : element.textContent
      );
      if (rawResult !== null && rawResult !== undefined && String(rawResult).trim()) {
        return {
          outcome: 'result',
          output: {
            schemaVersion: SIDECAR_PROTOCOL_VERSION,
            bridge: 'dom',
            state,
            result: normalizeArtifactValue(rawResult)
          }
        };
      }
    }

    if (Date.now() < deadline) await runtime.sleep(runtime.pollIntervalMs);
  } while (Date.now() < deadline);

  const limit = await detectAccountLimit(page, runtime.now());
  if (limit.limited) return rateLimited('dom', limit, 'page_after_timeout');
  throw new Error(`DOM fallback did not finish within ${runtime.runTimeoutMs} milliseconds`);
}

function selectClaudePage(browser) {
  const pages = browser.contexts().flatMap((context) => context.pages());
  if (pages.length === 0) throw new Error('CDP browser has no pages');
  return pages.find((page) => page.url().includes('claude.ai')) ?? pages[0];
}

export async function executeArtifactRequest(
  request,
  {
    connectOverCDP = (endpoint) => chromium.connectOverCDP(endpoint),
    emit = async () => {},
    sleep,
    now
  } = {}
) {
  validateSidecarRequest(request);
  const runtimeInput = request.input.runtime ?? {};
  const runtime = {
    bridgeTimeoutMs: boundedInteger(
      runtimeInput.bridgeTimeoutMs,
      DEFAULT_BRIDGE_TIMEOUT_MS,
      10,
      60_000
    ),
    runTimeoutMs: boundedInteger(
      runtimeInput.runTimeoutMs,
      DEFAULT_RUN_TIMEOUT_MS,
      10,
      MAX_RUN_TIMEOUT_MS
    ),
    pollIntervalMs: boundedInteger(
      runtimeInput.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
      1,
      5_000
    ),
    sleep: sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
    now: now ?? (() => new Date())
  };

  await emit({
    protocolVersion: SIDECAR_PROTOCOL_VERSION,
    jobId: request.jobId,
    kind: 'event',
    eventType: 'connecting_cdp',
    payload: {}
  });
  const browser = await connectOverCDP(request.cdpEndpoint);
  const page = selectClaudePage(browser);

  // An account that is already out of messages shows a blocking modal, so the
  // limit is read before anything tries to drive the Artifact.
  const limitOnOpen = await detectAccountLimit(page, runtime.now());
  const completed = limitOnOpen.limited
    ? rateLimited('none', limitOnOpen, 'page_on_open')
    : await runRequest(page, request, runtime, emit);

  const terminal =
    completed.outcome === 'rate_limited'
      ? {
          protocolVersion: SIDECAR_PROTOCOL_VERSION,
          jobId: request.jobId,
          kind: 'rate_limited',
          payload: {
            ...completed.rateLimit,
            toolName: request.toolName,
            toolVersion: request.toolVersion
          }
        }
      : {
          protocolVersion: SIDECAR_PROTOCOL_VERSION,
          jobId: request.jobId,
          kind: 'result',
          output: {
            ...completed.output,
            toolName: request.toolName,
            toolVersion: request.toolVersion
          }
        };
  await emit(terminal);
  return terminal;
}

async function runRequest(page, request, runtime, emit) {
  const bridge = await findBridgeFrame(page, runtime.bridgeTimeoutMs, runtime.sleep);
  return bridge
    ? runBridge(page, bridge.frame, request, bridge.descriptor, runtime, emit)
    : runDomFallback(page, request, runtime, emit);
}
