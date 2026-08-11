import { describe, expect, jest, test } from '@jest/globals';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadPromptTemplate, appendCliTranscript, buildRequestMessage, buildRequestOverride, resolveAgentApiKey, WORKER_ROLE_MESSAGE, withGoalTools } from '../src/agent-flow.mjs';
import { sendMessage } from '../src/agent-session/session-service.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

describe('agent flow helpers', () => {
  test('withGoalTools requires and filters goal tools by mode', () => {
    const template = { tools: [{ name: 'goal_update' }, { name: 'lookup' }, {}], tool_choice: 'auto' };

    expect(withGoalTools(template, true)).toEqual({
      tools: [{ name: 'lookup' }, {}, { name: 'goal_update' }],
      tool_choice: 'required',
    });
    expect(withGoalTools(template, false)).toEqual({
      tools: [{ name: 'lookup' }, {}],
      tool_choice: 'auto',
    });
    expect(withGoalTools(undefined, false)).toEqual({ tools: [] });
    expect(withGoalTools(undefined, true)).toEqual({ tools: [], tool_choice: 'required' });
  });

  test('resolveAgentApiKey prefers the lowercase env var and falls back to uppercase', () => {
    expect(resolveAgentApiKey({ agentx_api_key: 'lower', AGENTX_API_KEY: 'upper' })).toBe('lower');
    expect(resolveAgentApiKey({ AGENTX_API_KEY: 'upper' })).toBe('upper');
  });


  test('resolveAgentApiKey reads from process.env when no env object is passed', () => {
    const originalLowerApiKey = process.env.agentx_api_key;
    const originalUpperApiKey = process.env.AGENTX_API_KEY;

    try {
      delete process.env.agentx_api_key;
      process.env.AGENTX_API_KEY = 'process-upper';
      expect(resolveAgentApiKey()).toBe('process-upper');
    } finally {
      if (originalLowerApiKey === undefined) delete process.env.agentx_api_key; else process.env.agentx_api_key = originalLowerApiKey;
      if (originalUpperApiKey === undefined) delete process.env.AGENTX_API_KEY; else process.env.AGENTX_API_KEY = originalUpperApiKey;
    }
  });

  test('resolveAgentApiKey explains when no key is configured', () => {
    expect(() => resolveAgentApiKey({})).toThrow('Set agentx_api_key or AGENTX_API_KEY in your shell environment.');
  });

  test('loadPromptTemplate falls back to the OS home directory when the platform home is unavailable', async () => {
    jest.resetModules();
    await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '' }));
    const { loadPromptTemplate: loadPromptTemplateWithFallback } = await import('../src/agent-flow.mjs');
    const tmp = makeTempDir('agentx-prompt-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'mcp.json');
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      writeFileSync(mcpPath, JSON.stringify([]));
      await expect(loadPromptTemplateWithFallback(promptPath, mcpPath)).resolves.toEqual({ input: [], tools: [] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('loadPromptTemplate wraps prompt file errors with the prompt path', async () => {
    const tmp = makeTempDir('agentx-prompt-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      writeFileSync(promptPath, '{not json');
      await expect(loadPromptTemplate(promptPath)).rejects.toThrow(`Unable to read prompt template at ${promptPath}`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('loadPromptTemplate wraps non-missing MCP file errors', async () => {
    const tmp = makeTempDir('agentx-prompt-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'mcp.json');
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      writeFileSync(mcpPath, '{not json');
      await expect(loadPromptTemplate(promptPath, mcpPath)).rejects.toThrow(`Unable to read prompt template at ${promptPath}`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('loadPromptTemplate merges top-level MCP tool arrays', async () => {
    const tmp = makeTempDir('agentx-prompt-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'mcp.json');
      const tools = [{ type: 'function', name: 'lookup' }, { type: 'mcp', server_label: 'disabled', enabled: false }];
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      writeFileSync(mcpPath, JSON.stringify(tools));
      await expect(loadPromptTemplate(promptPath, mcpPath)).resolves.toEqual({ input: [], tools: [tools[0]] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('loadPromptTemplate skips MCP configuration when loading is disabled', async () => {
    const tmp = makeTempDir('agentx-prompt-no-mcp-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'mcp.json');
      writeFileSync(promptPath, JSON.stringify({ input: [], tools: [{ type: 'function', name: 'local' }] }));
      writeFileSync(mcpPath, '{not json');
      await expect(loadPromptTemplate(promptPath, mcpPath, process.env, { loadMcp: false })).resolves.toEqual({ input: [], tools: [{ type: 'function', name: 'local' }] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('disabled MCP loading omits MCP tools from the outgoing request', async () => {
    const tmp = makeTempDir('agentx-request-no-mcp-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'mcp.json');
      const mcpTool = { type: 'mcp', server_label: 'developer', server_url: 'https://developer.example.test/mcp' };
      writeFileSync(promptPath, JSON.stringify({ model: 'test-model', input: [], tools: [{ type: 'function', name: 'local' }] }));
      writeFileSync(mcpPath, JSON.stringify([mcpTool]));

      const enabledTemplate = await loadPromptTemplate(promptPath, mcpPath);
      const disabledTemplate = await loadPromptTemplate(promptPath, mcpPath, process.env, { loadMcp: false });
      const requests = [];
      const openai = { responses: { create: async (request) => { requests.push(request); return { id: `resp-${requests.length}`, output: [] }; } } };

      await sendMessage(openai, enabledTemplate, '', 'hello', '', '/tmp/work');
      await sendMessage(openai, disabledTemplate, '', 'hello', '', '/tmp/work');

      expect(requests[0].tools).toEqual([{ type: 'function', name: 'local' }, mcpTool]);
      expect(requests[1].tools).toEqual([{ type: 'function', name: 'local' }]);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('loadPromptTemplate defaults missing MCP tools to an empty array', async () => {
    const tmp = makeTempDir('agentx-prompt-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'mcp.json');
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      writeFileSync(mcpPath, JSON.stringify({}));
      await expect(loadPromptTemplate(promptPath, mcpPath)).resolves.toEqual({ input: [], tools: [] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('loadPromptTemplate removes worker orchestration tools for spawned agents', async () => {
    const tmp = makeTempDir('agentx-worker-prompt-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'missing-mcp.json');
      writeFileSync(promptPath, JSON.stringify({ input: [], tools: [{ type: 'function', name: 'spawn_agent' }, { type: 'function', name: 'agent_status' }, { type: 'function', name: 'cancel_agent' }, { type: 'function', name: 'view_image' }, { type: 'local' }] }));
      await expect(loadPromptTemplate(promptPath, mcpPath, { AGENTX_WORKER_ID: 'worker-1' })).resolves.toEqual({ input: [], tools: [{ type: 'function', name: 'view_image' }, { type: 'local' }] });
    } finally { cleanupTempDir(tmp); }
  });

  test('loadPromptTemplate gives workers an empty tool list when no tools are configured', async () => {
    const tmp = makeTempDir('agentx-worker-empty-tools-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'missing-mcp.json');
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      await expect(loadPromptTemplate(promptPath, mcpPath, { AGENTX_WORKER_ID: 'worker-1' })).resolves.toEqual({ input: [], tools: [] });
    } finally { cleanupTempDir(tmp); }
  });

  test('built-in image generation tool uses the Responses API schema', async () => {
    const promptPath = path.resolve('prompt.json');
    const template = await loadPromptTemplate(promptPath, path.resolve('missing-mcp.json'));
    expect(template.tools.find((tool) => tool.type === 'image_generation')).toEqual({ type: 'image_generation' });
  });

  test('loadPromptTemplate returns parsed JSON when the prompt file is valid', async () => {
    const tmp = makeTempDir('agentx-prompt-');
    try {
      const promptPath = path.join(tmp, 'prompt.json');
      const mcpPath = path.join(tmp, 'missing-mcp.json');
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      await expect(loadPromptTemplate(promptPath, mcpPath, {})).resolves.toEqual({ input: [] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('loadPromptTemplate falls back to stringified errors when no message is available', async () => {
    jest.resetModules();
    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      readJson: async () => { throw 'broken prompt'; },
    }));
    const { loadPromptTemplate: loadPromptTemplateWithMock } = await import('../src/agent-flow.mjs');

    await expect(loadPromptTemplateWithMock('/tmp/prompt.json')).rejects.toThrow('broken prompt');
  });

  test('appendCliTranscript and buildRequestMessage keep CLI context together', () => {
    const transcript = appendCliTranscript('', 'pwd', '/tmp/work\n');
    expect(transcript).toBe('! pwd\n/tmp/work');
    expect(buildRequestMessage({ pendingCliTranscript: transcript, cwdNote: 'cwd note', message: 'hello' })).toBe('Local shell commands and output since the last assistant message:\n\n! pwd\n/tmp/work\n\ncwd note\n\nhello');
  });

  test('appendCliTranscript and buildRequestMessage handle missing optional context', () => {
    expect(appendCliTranscript('', 'pwd')).toBe('! pwd');
    expect(buildRequestMessage({ message: 'hello' })).toBe('hello');
  });

  test('appendCliTranscript formats shell output objects and plain values', () => {
    expect(appendCliTranscript('', 'pwd', { stdout: 'out\n', stderr: 'err\n' })).toBe('! pwd\nout\n\nstderr:\nerr');
    expect(appendCliTranscript('', 'pwd', { stderr: 'err\n' })).toBe('! pwd\nerr');
    expect(appendCliTranscript('', 'pwd', { stdout: 'out\n' })).toBe('! pwd\nout');
    expect(appendCliTranscript('', 'pwd', ['a', 'b'])).toBe('! pwd\na,b');
    expect(appendCliTranscript('', 'pwd', 42)).toBe('! pwd\n42');
  });

  test('buildRequestOverride applies first-turn prompt updates and resume requests', () => {
    const template = {
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
    };

    expect(buildRequestOverride(template, 'hello', 'AGENTS body', '/tmp/work', '')).toMatchObject({
      store: true,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: expect.stringContaining('Identity guidance: You are AgentX') }] },
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      ],
    });

    expect(buildRequestOverride(template, 'next', 'AGENTS body', '/tmp/work', 'resp-1')).toMatchObject({
      store: true,
      previous_response_id: 'resp-1',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'next' }] }],
    });

    expect(buildRequestOverride(template, 'worker task', '', '/tmp/work', 'resp-1', WORKER_ROLE_MESSAGE)).toMatchObject({
      previous_response_id: 'resp-1',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: expect.stringContaining('delegated worker') }] },
        { role: 'user', content: [{ type: 'input_text', text: 'worker task' }] },
      ],
    });
  });

  test('buildRequestOverride leaves non-text prompt parts unchanged', () => {
    const template = {
      input: [
        { role: 'developer', content: [{ type: 'output_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'output_text', text: 'first user message' }] },
      ],
    };

    expect(buildRequestOverride(template, 'hello', '', '/tmp/work', '')).toMatchObject({
      store: true,
      input: [
        { role: 'developer', content: [{ type: 'output_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'output_text', text: 'first user message' }] },
      ],
    });
  });

  test('buildRequestOverride keeps user text when the placeholder is absent', () => {
    const template = {
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'existing user text' }] },
      ],
    };

    expect(buildRequestOverride(template, 'hello', '', '/tmp/work', '')).toMatchObject({
      store: true,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: expect.stringContaining('Identity guidance: You are AgentX') }] },
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      ],
    });
  });

  test('buildRequestOverride handles missing prompt text fields', () => {
    const template = {
      input: [
        { role: 'developer', content: [{ type: 'input_text' }] },
        { role: 'user', content: [{ type: 'input_text' }] },
      ],
    };

    expect(buildRequestOverride(template, 'hello', '', '/tmp/work', '')).toMatchObject({
      store: true,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: expect.any(String) }] },
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      ],
    });
  });
});
