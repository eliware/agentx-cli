import path from 'node:path';

export function isWindowsPlatform(platform = process.platform) {
  return platform === 'win32';
}

export function getPathModule(platform = process.platform) {
  return isWindowsPlatform(platform) ? path.win32 : path.posix;
}

export function getHomeDirectory(env = process.env, platform = process.platform) {
  if (isWindowsPlatform(platform)) {
    if (env?.USERPROFILE) return String(env.USERPROFILE);
    const homeDrive = String(env?.HOMEDRIVE || '');
    const homePath = String(env?.HOMEPATH || '');
    if (homeDrive || homePath) {
      return `${homeDrive}${homePath}`;
    }
  }
  return String(env?.HOME || env?.USERPROFILE || '');
}

export function getPromptIdentity(env = process.env) {
  const user = String(env?.USER || env?.USERNAME || 'root');
  const host = String(env?.HOSTNAME || env?.COMPUTERNAME || 'dev');
  return { user, host };
}

export function getShellLaunchers(platform = process.platform) {
  if (!isWindowsPlatform(platform)) {
    return [
      { file: '/bin/sh', args: ['-lc'] },
    ];
  }

  return [
    { file: 'pwsh', args: ['-NoLogo', '-NoProfile', '-Command'] },
    { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command'] },
    { file: 'cmd.exe', args: ['/d', '/s', '/c'] },
  ];
}

export function isMissingLauncherError(error) {
  return error?.code === 'ENOENT';
}

export function resolveUserPath(input, cwd, { env = process.env, platform = process.platform } = {}) {
  const pathApi = getPathModule(platform);
  const home = getHomeDirectory(env, platform);
  const rawTarget = String(input || home || cwd || '');
  const expanded = rawTarget.startsWith('~')
    ? rawTarget.replace(/^~(?=$|[\\/])/, home || cwd || '')
    : rawTarget;
  return pathApi.isAbsolute(expanded) ? expanded : pathApi.resolve(cwd, expanded);
}

export function normalizeDisplayPath(value, platform = process.platform) {
  const pathApi = getPathModule(platform);
  return pathApi.normalize(String(value ?? ''));
}
