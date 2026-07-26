import { chromium } from 'playwright-core';

export const SIDECAR_PROTOCOL_VERSION = 1;

const DEFAULT_BRIDGE_TIMEOUT_MS = 30_000;
const DEFAULT_RUN_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const MAX_RUN_TIMEOUT_MS = 90 * 60_000;
const BRIDGE_DONE_STATES = new Set(['complete', 'completed', 'done', 'succeeded']);
const BRIDGE_FAILED_STATES = new Set(['error', 'failed', 'rate_limited']);

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
    if (BRIDGE_FAILED_STATES.has(currentState)) {
      throw new Error(`Artifact bridge entered terminal state: ${currentState}`);
    }

    const result = await bridgeOperation(frame, 'result');
    if (result !== null && result !== undefined && result !== '') {
      return { state, result };
    }
    if (BRIDGE_DONE_STATES.has(currentState)) return { state, result: null };

    if (Date.now() < deadline) await sleep(pollIntervalMs);
  } while (Date.now() < deadline);
  throw new Error(`Artifact bridge did not finish within ${timeoutMs} milliseconds`);
}

async function runBridge(frame, request, descriptor, runtime, emit) {
  const input = request.input;
  if (input.config && Object.keys(input.config).length > 0) {
    const configured = await bridgeOperation(frame, 'configure', input.config);
    if (configured !== true) throw new Error('Artifact bridge rejected configure()');
  }

  const imports = Array.isArray(input.imports) ? input.imports : [];
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

  const action = typeof input.action === 'string' && input.action.trim() ? input.action.trim() : 'default';
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
      tool: descriptor.tool
    }
  });

  const completed = await waitForBridgeResult(
    frame,
    runtime.runTimeoutMs,
    runtime.pollIntervalMs,
    runtime.sleep
  );
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

  return {
    schemaVersion: SIDECAR_PROTOCOL_VERSION,
    bridge: 'artifact',
    artifactSchema: descriptor.schema,
    artifactTool: descriptor.tool,
    state: completed.state,
    result: normalizeArtifactValue(completed.result)
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
          schemaVersion: SIDECAR_PROTOCOL_VERSION,
          bridge: 'dom',
          state,
          result: normalizeArtifactValue(rawResult)
        };
      }
    }

    if (Date.now() < deadline) await runtime.sleep(runtime.pollIntervalMs);
  } while (Date.now() < deadline);
  throw new Error(`DOM fallback did not finish within ${runtime.runTimeoutMs} milliseconds`);
}

function selectClaudePage(browser) {
  const pages = browser.contexts().flatMap((context) => context.pages());
  if (pages.length === 0) throw new Error('CDP browser has no pages');
  return pages.find((page) => page.url().includes('claude.ai')) ?? pages[0];
}

export async function executeArtifactRequest(
  request,
  { connectOverCDP = (endpoint) => chromium.connectOverCDP(endpoint), emit = async () => {}, sleep } = {}
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
    sleep: sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
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
  const bridge = await findBridgeFrame(page, runtime.bridgeTimeoutMs, runtime.sleep);
  const output = bridge
    ? await runBridge(bridge.frame, request, bridge.descriptor, runtime, emit)
    : await runDomFallback(page, request, runtime, emit);

  const result = {
    protocolVersion: SIDECAR_PROTOCOL_VERSION,
    jobId: request.jobId,
    kind: 'result',
    output: {
      ...output,
      toolName: request.toolName,
      toolVersion: request.toolVersion
    }
  };
  await emit(result);
  return result;
}
