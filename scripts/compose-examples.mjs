// Reads the Compose commands that the README, the operations guide, and compose.yaml print.
// The docs test and smoke-compose.mjs both use it, so the smoke test runs the printed environment as written.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const sources = ['README.md', 'docs/operations.md', 'compose.yaml'];

// Each match is a block of "NAME=value \\" lines. Only the variables named here are read.
function readBlocks(prefix) {
  const found = [];
  for (const source of sources) {
    const text = readFileSync(new URL(source, root), 'utf8');
    const pattern = new RegExp(`${prefix}_CONFIG=(\\S+)[ \\\\\\n#]+(?:[A-Z_]+=\\S+[ \\\\\\n#]+)*?${prefix}_SERVER_NAME=(\\S+)`, 'g');
    for (const match of text.matchAll(pattern)) {
      found.push({ source, config: match[1], serverName: match[2], block: match[0] });
    }
  }

  return found;
}

export const httpExamples = () => readBlocks('NGINX');
export const tlsExamples = () => readBlocks('NGINX_TLS');

export function environmentOf(block) {
  return Object.fromEntries([...block.matchAll(/([A-Z_]+)=(\S+)/g)].map((match) => [match[1], match[2]]));
}
