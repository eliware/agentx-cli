import { describe, expect, test } from '@jest/globals';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatMcpConfigValidation, validateMcpConfig, validateMcpConfigFile } from '../src/mcp-config.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

const validTool = (label = 'developer') => ({ type: 'mcp', server_label: label, server_url: `https://${label}.example/mcp`, headers: { Authorization: 'Bearer hidden' } });

describe('MCP config validation', () => {
  test('accepts array and object tool shapes without exposing authorization', () => {
    expect(validateMcpConfig([validTool()])).toMatchObject({ valid: true, tools: [validTool()] });
    expect(validateMcpConfig({ tools: [validTool('puppeteer')] }).valid).toBe(true);
    const validation = { ...validateMcpConfig([validTool()]), exists: true, filePath: '/tmp/mcp.json' };
    expect(formatMcpConfigValidation(validation)).toContain('authorization present');
    expect(formatMcpConfigValidation(validation)).not.toContain('hidden');
  });

  test('reports malformed entries and duplicate labels', () => {
    const result = validateMcpConfig([
      validTool(),
      { type: 'mcp', server_label: 'developer', server_url: 'http://bad/mcp' },
      { type: 'mcp', server_url: 'not-a-url' },
      { type: 'mcp', server_label: 'empty', server_url: '' },
      { type: 'function', name: 'local' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'MCP tool 2 (developer): server_url must be a valid HTTPS URL',
      'MCP tool 2: duplicate server_label "developer"',
      'MCP tool 2 (developer): authorization is required',
      'MCP tool 3: server_label is required',
      'MCP tool 3 (unnamed): server_url must be a valid HTTPS URL',
      'MCP tool 3 (unnamed): authorization is required',
    ]));
  });

  test('accepts alternate authorization field shapes and formats plural output', () => {
    const result = { ...validateMcpConfig([
      { ...validTool('lower'), headers: { authorization: 'Bearer hidden' } },
      { ...validTool('oauth'), headers: {}, authorization: 'token hidden' },
    ]), exists: true, filePath: '/tmp/mcp.json' };
    expect(result.valid).toBe(true);
    expect(formatMcpConfigValidation(result)).toContain('2 MCP tools configured');
  });

  test('handles invalid root shapes and missing config files', () => {
    expect(validateMcpConfig({})).toMatchObject({ valid: false, errors: ['config must be an array or an object with a tools array'] });
    const tmp = makeTempDir('agentx-mcp-check-');
    try {
      const missing = validateMcpConfigFile(path.join(tmp, 'missing.json'));
      expect(missing).toMatchObject({ valid: true, exists: false });
      expect(formatMcpConfigValidation(missing)).toContain('MCP config not found');
      const invalidPath = path.join(tmp, 'invalid.json');
      writeFileSync(invalidPath, '{bad');
      expect(validateMcpConfigFile(invalidPath).valid).toBe(false);
      expect(validateMcpConfigFile(invalidPath, () => { throw { code: 'EIO' }; }).errors[0]).toContain('unable to read config: [object Object]');
    } finally { cleanupTempDir(tmp); }
  });

  test('formats empty valid configuration', () => {
    expect(formatMcpConfigValidation({ valid: true, exists: true, tools: [], filePath: '/tmp/mcp.json' })).toContain('no MCP tools configured');
  });
});
