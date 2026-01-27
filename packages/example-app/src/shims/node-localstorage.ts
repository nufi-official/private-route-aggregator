// Browser shim for node-localstorage
// Redirects to browser's native localStorage

class LocalStorage {
  private prefix: string;

  constructor(location: string) {
    // Use the location as a prefix for keys to avoid collisions
    this.prefix = location.replace(/[^a-zA-Z0-9]/g, '_') + '_';
  }

  getItem(key: string): string | null {
    return window.localStorage.getItem(this.prefix + key);
  }

  setItem(key: string, value: string): void {
    window.localStorage.setItem(this.prefix + key, value);
  }

  removeItem(key: string): void {
    window.localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => window.localStorage.removeItem(key));
  }

  key(index: number): string | null {
    let count = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        if (count === index) {
          return key.slice(this.prefix.length);
        }
        count++;
      }
    }
    return null;
  }

  get length(): number {
    let count = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        count++;
      }
    }
    return count;
  }
}

export { LocalStorage };
export default { LocalStorage };
