import assert from 'node:assert/strict';
import test from 'node:test';
import { executeArtifactRequest, validateSidecarRequest } from './artifact-runner.mjs';

class MockArtifactFrame {
  constructor() {
    this.config = null;
    this.imports = [];
    this.action = null;
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
        return { status: 'done' };
      case 'checkpoint':
        return JSON.stringify({ cursor: 7 });
      case 'result':
        return JSON.stringify({ blueprint: 'mock-blueprint' });
      default:
        throw new Error(`Unexpected mock operation: ${operation}`);
    }
  }
}

test('mock Artifact end-to-end uses the versioned bridge and returns the exact job result', async () => {
  const artifactFrame = new MockArtifactFrame();
  const mainFrame = {
    async evaluate() {
      return { available: false, schema: null, tool: null };
    }
  };
  const page = {
    url: () => 'https://claude.ai/chat/mock',
    mainFrame: () => mainFrame,
    frames: () => [mainFrame, artifactFrame]
  };
  const browser = {
    contexts: () => [{ pages: () => [page] }]
  };
  const messages = [];
  const request = {
    protocolVersion: 1,
    jobId: 'job-mock-artifact',
    toolName: 'story_architect',
    toolVersion: '1.0.0',
    cdpEndpoint: 'http://127.0.0.1:9333',
    input: {
      action: 'plan',
      config: { chapter: 12 },
      imports: [{ slot: 'research', name: 'research.json', text: '{"sources":[]}' }],
      runtime: { bridgeTimeoutMs: 10, runTimeoutMs: 10, pollIntervalMs: 1 }
    }
  };

  const terminal = await executeArtifactRequest(request, {
    connectOverCDP: async (endpoint) => {
      assert.equal(endpoint, request.cdpEndpoint);
      return browser;
    },
    emit: async (message) => messages.push(message),
    sleep: async () => {}
  });

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
