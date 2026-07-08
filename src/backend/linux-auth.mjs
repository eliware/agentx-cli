import { spawn } from 'node:child_process';

const AUTH_SCRIPT = `
import json
import pam
import sys

username = sys.argv[1]
service = sys.argv[2]
password = sys.stdin.read()
auth = pam.pam()
ok = auth.authenticate(username, password, service=service)
json.dump({
  'ok': bool(ok),
  'code': getattr(auth, 'code', None),
  'reason': getattr(auth, 'reason', None),
}, sys.stdout)
`;

export function authenticateLinuxCredentials({
  username,
  password,
  service = 'login',
  python = 'python3',
} = {}) {
  if (!username || !password) {
    return Promise.resolve({ ok: false, code: 'missing_credentials', reason: 'Username and password are required' });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-c', AUTH_SCRIPT, username, service], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (!stdout.trim()) {
        resolve({ ok: false, code: 'authentication_error', reason: stderr.trim() || `python auth exited with code ${code ?? 'unknown'}` });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve({
          ok: Boolean(result.ok),
          code: result.code,
          reason: result.reason || stderr.trim() || null,
        });
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(password, 'utf8');
  });
}
