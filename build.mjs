// Erzeugt den Ordner "dist" mit allen Dateien, die ausgeliefert werden sollen.
// Nötig, damit statische Hoster (z. B. Vercel) ein eindeutiges Ausgabeverzeichnis haben.
import { cp, rm, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const OUT = join(ROOT, "dist");
const ASSETS = ["index.html", "style.css", "src", "vendor"];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const asset of ASSETS) {
  await cp(join(ROOT, asset), join(OUT, asset), { recursive: true });
}
console.log(`dist/ erstellt: ${(await readdir(OUT)).join(", ")}`);
