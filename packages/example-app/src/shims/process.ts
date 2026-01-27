// Custom process shim with stdout/stderr for browser
// Extends the basic process polyfill with terminal output support

const process: any = {
  env: {
    HOME: '/',
    NODE_ENV: 'development',
  },
  cwd: () => '/',
  chdir: () => {},
  platform: 'browser',
  version: 'v18.0.0',
  versions: {},
  nextTick: (fn: Function, ...args: any[]) => {
    queueMicrotask(() => fn(...args));
  },
  stdout: {
    write: (s: string) => {
      console.log(s);
      return true;
    },
    isTTY: false,
    columns: 80,
    rows: 24,
    on: () => process.stdout,
    once: () => process.stdout,
    emit: () => false,
    removeListener: () => process.stdout,
    pipe: () => process.stdout,
  },
  stderr: {
    write: (s: string) => {
      console.error(s);
      return true;
    },
    isTTY: false,
    columns: 80,
    rows: 24,
    on: () => process.stderr,
    once: () => process.stderr,
    emit: () => false,
    removeListener: () => process.stderr,
    pipe: () => process.stderr,
  },
  stdin: {
    isTTY: false,
    on: () => process.stdin,
    once: () => process.stdin,
    emit: () => false,
    removeListener: () => process.stdin,
    pipe: () => process.stdin,
  },
  argv: [],
  exit: () => {},
  kill: () => {},
  pid: 1,
  ppid: 0,
  umask: () => 0,
  hrtime: (prev?: [number, number]) => {
    const now = performance.now();
    const sec = Math.floor(now / 1000);
    const nsec = Math.floor((now % 1000) * 1e6);
    if (prev) {
      return [sec - prev[0], nsec - prev[1]];
    }
    return [sec, nsec];
  },
  on: () => process,
  once: () => process,
  off: () => process,
  emit: () => false,
  removeListener: () => process,
  listeners: () => [],
};

// Make hrtime.bigint available
process.hrtime.bigint = () => BigInt(Math.floor(performance.now() * 1e6));

export default process;
export { process };
