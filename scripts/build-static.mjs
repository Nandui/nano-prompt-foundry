import { copyFile, mkdir, rm } from "node:fs/promises";

const outputDir = new URL("../public/", import.meta.url);
const staticFiles = ["index.html", "styles.css", "client-guard.js", "app.js", "schema-override.js", "library.js"];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await Promise.all(
  staticFiles.map((file) => copyFile(new URL(`../${file}`, import.meta.url), new URL(file, outputDir)))
);
