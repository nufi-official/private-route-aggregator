import * as BufferModule from 'buffer';
import * as ProcessModule from 'process';
import * as StreamModule from 'stream-browserify';

const Buffer =
  BufferModule.Buffer || (BufferModule as any).default?.Buffer || BufferModule;
const process = (ProcessModule as any).default || ProcessModule;

if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  (window as any).process = process;
  (window as any).global = window;

  if (!(window as any).stream) {
    (window as any).stream = StreamModule;
  }
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
  (globalThis as any).process = process;
  (globalThis as any).global = globalThis;

  if (!(globalThis as any).stream) {
    (globalThis as any).stream = StreamModule;
  }
}

export { Buffer, process };
