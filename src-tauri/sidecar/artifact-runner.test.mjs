import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectAccountLimit,
  executeArtifactRequest,
  parseResetClock,
  validateSidecarRequest
} from './artifact-runner.mjs';

const NO_LIMIT_TEXT = 'Claude is drafting the chapter.';

class MockArtifactFrame {
  constructor({ states = [{ status: 'done' }], result = JSON.stringify({ blueprint: 'mock-blueprint' }) } = {}) {
    this.config = null;
    this.imports = [];
    this.action = null;
    this.states = states;
    this.result = result;
  }

  async evaluate(_callback, { operation, payload }) {
    switch (operation) {
      case 'describe':
        return { available: true, schema: 'mock-artifact/v1', tool: 'story_architect' };
      case 'configure':
        this.config = payload;
        return true;
      case 'import':
        this.imports.push(payload);
        return true;
      case 'run':
        this.action = payload;
        return true;
      case 'state':
        return this.states.length > 1 ? this.states.shift() : this.states[0];
      case 'checkpoint':
        return JSON.stringify({ cursor: 7 });
      case 'result':
        return this.result;
      default:
        throw new Error(`Unexpected mock operation: ${operation}`);
    }
  }
}

/** `pageText` may be a list so the page can start healthy and hit the limit later. */
function mockPage(artifactFrame, pageText = NO_LIMIT_TEXT) {
  const texts = Array.isArray(pageText) ? [...pageText] : [pageText];
  const mainFrame = {
    async evaluate() {
      return { available: false, schema: null, tool: null };
    }
  };
  return {
    url: () => 'https://claude.ai/chat/mock',
    mainFrame: () => mainFrame,
    frames: () => (artifactFrame ? [mainFrame, artifactFrame] : [mainFrame]),
    evaluate: async () => (texts.length > 1 ? texts.shift() : texts[0])
  };
}

function mockRequest(overrides = {}) {
  return {
    protocolVersion: 1,
    jobId: 'job-mock-artifact',
    toolName: 'story_architect',
    toolVersion: '1.0.0',
    cdpEndpoint: 'http://127.0.0.1:9333',
    input: {
      action: 'plan',
      config: { chapter: 12 },
      imports: [{ slot: 'research', name: 'research.json', text: '{"sources":[]}' }],
      runtime: { bridgeTimeoutMs: 10, runTimeoutMs: 10, pollIntervalMs: 1 },
      ...(overrides.input ?? {})
    },
    ...overrides
  };
}

async function runAgainst(page, request, messages) {
  return executeArtifactRequest(request, {
    connectOverCDP: async (endpoint) => {
      assert.equal(endpoint, request.cdpEndpoint);
      return { contexts: () => [{ pages: () => [page] }] };
    },
    emit: async (message) => messages.push(message),
    sleep: async () => {},
    now: () => new Date('2026-07-26T12:00:00+07:00')
  });
}

test('mock Artifact end-to-end uses the versioned bridge and returns the exact job result', async () => {
  const artifactFrame = new MockArtifactFrame();
  const request = mockRequest();
  const messages = [];

  const terminal = await runAgainst(mockPage(artifactFrame), request, messages);

  assert.deepEqual(artifactFrame.config, { chapter: 12 });
  assert.deepEqual(artifactFrame.imports, request.input.imports);
  assert.equal(artifactFrame.action, 'plan');
  assert.equal(terminal.jobId, request.jobId);
  assert.deepEqual(terminal.output.result, { blueprint: 'mock-blueprint' });
  assert.equal(terminal.output.artifactSchema, 'mock-artifact/v1');
  assert.equal(messages.filter((message) => message.kind === 'result').length, 1);
  assert.deepEqual(
    messages.find((message) => message.kind === 'checkpoint').payload.data,
    { cursor: 7 }
  );
  assert.equal(
    messages.find((message) => message.eventType === 'artifact_bridge_selected').payload.bridge,
    'artifact'
  );
});

test('sidecar rejects non-loopback CDP endpoints before connecting', () => {
  assert.throws(
    () =>
      validateSidecarRequest({
        protocolVersion: 1,
        jobId: 'job-1',
        toolName: 'story_architect',
        toolVersion: '1.0.0',
        cdpEndpoint: 'https://example.com:9333',
        input: {}
      }),
    /loopback HTTP/
  );
});

test('a confirmed limit on open is reported as rate_limited with the reset time', async () => {
  const page = mockPage(
    new MockArtifactFrame(),
    'You are out of free messages until 3:00 PM. Upgrade to keep chatting.'
  );
  const messages = [];

  const terminal = await runAgainst(page, mockRequest(), messages);

  assert.equal(terminal.kind, 'rate_limited');
  assert.equal(terminal.payload.source, 'page_on_open');
  assert.equal(terminal.payload.resetTime, '3:00 PM');
  assert.equal(
    new Date(terminal.payload.resetAt).toISOString(),
    new Date('2026-07-26T15:00:00+07:00').toISOString()
  );
  assert.equal(messages.filter((message) => message.kind === 'result').length, 0);
});

test('a rate-limited bridge state saves the checkpoint before reporting the limit', async () => {
  const artifactFrame = new MockArtifactFrame({
    states: [{ status: 'rate_limited' }],
    result: ''
  });
  const page = mockPage(artifactFrame, [
    NO_LIMIT_TEXT,
    'You have hit your usage limit. Resets at 2:30 AM.'
  ]);
  const messages = [];

  const terminal = await runAgainst(page, mockRequest(), messages);

  const kinds = messages.map((message) => message.kind);
  assert.ok(kinds.indexOf('checkpoint') < kinds.indexOf('rate_limited'));
  assert.deepEqual(
    messages.find((message) => message.kind === 'checkpoint').payload.data,
    { cursor: 7 }
  );
  assert.equal(terminal.kind, 'rate_limited');
  assert.equal(terminal.payload.source, 'bridge');
  assert.equal(terminal.payload.resetTime, '2:30 AM');
});

test('a generic bridge failure never reports a rate limit', async () => {
  const artifactFrame = new MockArtifactFrame({ states: [{ status: 'error' }], result: '' });
  const messages = [];

  await assert.rejects(
    runAgainst(mockPage(artifactFrame), mockRequest(), messages),
    /terminal state: error/
  );
  assert.equal(messages.filter((message) => message.kind === 'rate_limited').length, 0);
});

test('a stall without a confirmed limit stays a failure instead of rotating', async () => {
  const artifactFrame = new MockArtifactFrame({ states: [{ status: 'running' }], result: '' });
  const messages = [];

  await assert.rejects(
    runAgainst(mockPage(artifactFrame), mockRequest(), messages),
    /did not finish within/
  );
  assert.equal(messages.filter((message) => message.kind === 'rate_limited').length, 0);
});

test('a checkpointed job continues on the next account instead of restarting', async () => {
  const artifactFrame = new MockArtifactFrame();
  const request = mockRequest({ checkpoint: { cursor: 7, scenes: 2 } });
  const messages = [];

  const terminal = await runAgainst(mockPage(artifactFrame), request, messages);

  const resumed = artifactFrame.imports.find((imported) => imported.slot === 'checkpoint');
  assert.deepEqual(JSON.parse(resumed.text), { cursor: 7, scenes: 2 });
  assert.equal(artifactFrame.action, 'continue');
  assert.equal(terminal.kind, 'result');
  const selected = messages.find((message) => message.eventType === 'artifact_bridge_selected');
  assert.equal(selected.payload.resumed, true);
  assert.equal(selected.payload.action, 'continue');
});

test('a resume action declared by the tool overrides the default continue', async () => {
  const artifactFrame = new MockArtifactFrame();
  const request = mockRequest({
    checkpoint: { cursor: 1 },
    input: { action: 'plan', resumeAction: 'continue_with_context' }
  });

  await runAgainst(mockPage(artifactFrame), request, []);

  assert.equal(artifactFrame.action, 'continue_with_context');
});

test('a malformed checkpoint is rejected before the browser is touched', () => {
  assert.throws(
    () => validateSidecarRequest(mockRequest({ checkpoint: ['not', 'an', 'object'] })),
    /checkpoint must be a JSON object/
  );
});

test('reset clocks resolve to the next occurrence of that time', () => {
  const now = new Date('2026-07-26T12:00:00+07:00');

  assert.equal(
    new Date(parseResetClock('3:00 PM', now)).toISOString(),
    new Date('2026-07-26T15:00:00+07:00').toISOString()
  );
  assert.equal(
    new Date(parseResetClock('9 AM', now)).toISOString(),
    new Date('2026-07-27T09:00:00+07:00').toISOString()
  );
  assert.equal(parseResetClock('not a clock', now), null);
  assert.equal(parseResetClock('26:00', now), null);
});

test('unrelated page text is never read as a rate limit', async () => {
  const page = mockPage(null, 'Claude is drafting chapter 12 and has plenty of messages left.');

  assert.deepEqual(await detectAccountLimit(page), {
    limited: false,
    resetTime: null,
    resetAt: null
  });
});
