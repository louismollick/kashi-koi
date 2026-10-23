// Copies the kuromoji IPADIC dictionary (gzipped .dat files) from node_modules into public/dict, where the tokenizer
// worker fetches it. Runs before `dev` and `build`; public/dict is gitignored. Files already copied are left alone.
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../dict/', import.meta.resolve('@patdx/kuromoji'));
const target = new URL('../public/dict/', import.meta.url);

await mkdir(target, { recursive: true });
let copied = 0;
for (const file of (await readdir(source)).filter((name) => name.endsWith('.dat.gz'))) {
  const from = fileURLToPath(new URL(file, source));
  const to = fileURLToPath(new URL(file, target));
  const same = await stat(to).then(
    async (existing) => existing.size === (await stat(from)).size,
    () => false,
  );
  if (same) continue;
  await copyFile(from, to);
  copied++;
}
console.log(`dict: ${copied} file(s) copied to public/dict`);
