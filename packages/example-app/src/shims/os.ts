// Browser shim for Node.js os module

export function homedir(): string {
  return '/home/user';
}

export function tmpdir(): string {
  return '/tmp';
}

export function hostname(): string {
  return 'browser';
}

export function platform(): string {
  return 'browser';
}

export function arch(): string {
  return 'wasm';
}

export function type(): string {
  return 'Browser';
}

export function release(): string {
  return '1.0.0';
}

export function cpus(): any[] {
  return [{ model: 'Browser', speed: 0 }];
}

export function totalmem(): number {
  return 8 * 1024 * 1024 * 1024; // 8GB
}

export function freemem(): number {
  return 4 * 1024 * 1024 * 1024; // 4GB
}

export function uptime(): number {
  return performance.now() / 1000;
}

export function loadavg(): number[] {
  return [0, 0, 0];
}

export function networkInterfaces(): Record<string, any[]> {
  return {};
}

export function userInfo(): { username: string; uid: number; gid: number; shell: string; homedir: string } {
  return {
    username: 'user',
    uid: 1000,
    gid: 1000,
    shell: '/bin/bash',
    homedir: '/home/user',
  };
}

export const EOL = '\n';

export default {
  homedir,
  tmpdir,
  hostname,
  platform,
  arch,
  type,
  release,
  cpus,
  totalmem,
  freemem,
  uptime,
  loadavg,
  networkInterfaces,
  userInfo,
  EOL,
};
