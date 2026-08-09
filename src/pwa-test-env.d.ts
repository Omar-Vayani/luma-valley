// Minimal ambient type declarations so src/pwa.test.ts can read the real PWA
// artifacts (manifest, service worker, icons, index.html) without pulling in
// the @types/node package this project deliberately does not install.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function readFileSync(path: string): Uint8Array
}
