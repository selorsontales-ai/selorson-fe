import { executeArtifactRequest, SIDECAR_PROTOCOL_VERSION } from './artifact-runner.mjs';

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function readRequest() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) throw new Error('Sidecar request exceeds 8 MiB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

let request;
try {
  request = await readRequest();
  await executeArtifactRequest(request, { emit: async (message) => writeMessage(message) });
} catch (error) {
  writeMessage({
    protocolVersion: SIDECAR_PROTOCOL_VERSION,
    jobId: typeof request?.jobId === 'string' ? request.jobId : '',
    kind: 'error',
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
}
