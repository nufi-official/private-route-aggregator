// Polyfill Node.js process for browser
// Must be imported before any other imports

if (typeof window !== 'undefined') {
  // Ensure process exists
  if (!window.process) {
    (window as any).process = {};
  }

  const proc = window.process as any;

  // Polyfill stdout/stderr for privacycash SDK
  if (!proc.stdout) {
    proc.stdout = {
      write: (s: string) => {
        console.log(s);
        return true;
      },
      isTTY: false,
      columns: 80,
      rows: 24,
    };
  }

  if (!proc.stderr) {
    proc.stderr = {
      write: (s: string) => {
        console.error(s);
        return true;
      },
      isTTY: false,
      columns: 80,
      rows: 24,
    };
  }

  // Polyfill cwd
  if (!proc.cwd) {
    proc.cwd = () => '/';
  }

  // Ensure env exists
  if (!proc.env) {
    proc.env = {};
  }
  proc.env.HOME = '/';
}

export {};
