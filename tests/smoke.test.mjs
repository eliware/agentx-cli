import { describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeLoader(tmp, transportStub, readlineStub) {
  const loaderPath = path.join(tmp, 'loader.mjs');
  writeFileSync(loaderPath, `
    import { pathToFileURL } from 'node:url';
    export async function resolve(specifier, context, nextResolve) {
      if (specifier.endsWith('openai-transport.mjs')) {
        return { url: pathToFileURL(${JSON.stringify(transportStub)}).href, shortCircuit: true };
      }
      if (specifier === 'node:readline/promises') {
        return { url: pathToFileURL(${JSON.stringify(readlineStub)}).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  `);
  return loaderPath;
}

describe('CLI smoke test', () => {
  test('starts, completes one turn, and persists session state', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'agentx-smoke-'));
    const transportStub = path.join(tmp, 'transport-stub.mjs');
    const readlineStub = path.join(tmp, 'readline-stub.mjs');

    try {
      writeFileSync(transportStub, `
        export function createOpenAIResponsesTransport() {
          return {
            responses: {
              create: async (_request, handlers = {}) => {
                handlers.onTextDelta?.('smoke ok');
                return {
                  id: 'resp-smoke',
                  output: [{ type: 'message', content: [{ type: 'output_text', text: 'smoke ok' }] }],
                  usage: { input_tokens: 4, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2 },
                };
              },
            },
            close() {},
          };
        }
      `);
      writeFileSync(readlineStub, `
        const queue = (process.env.AGENTX_SMOKE_INPUTS || '').split('\\n');
        export function createInterface() {
          return {
            question: async () => queue.shift() ?? '/exit',
            close() {},
          };
        }
      `);

      const result = spawnSync(process.execPath, [
        '--no-warnings',
        '--experimental-loader',
        makeLoader(tmp, transportStub, readlineStub),
        path.join(repoRoot, 'agentx.mjs'),
      ], {
        cwd: tmp,
        env: { ...process.env, AGENTX_SMOKE_INPUTS: 'hello\n/exit', agentx_api_key: 'test-key' },
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Starting new session');
      expect(result.stdout).toContain('smoke ok');
      expect(result.stdout).toContain('"turns":"1"');
      expect(existsSync(path.join(tmp, '.agentx_responseid'))).toBe(true);
      expect(JSON.parse(readFileSync(path.join(tmp, '.agentx_responseid'), 'utf8'))).toMatchObject({ response_id: 'resp-smoke' });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
