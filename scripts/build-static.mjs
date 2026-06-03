import { copyFile, mkdir, rm } from "node:fs/promises";

const outputDir = new URL("../dist/", import.meta.url);
const staticFiles = ["index.html", "styles.css", "app.js"];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await Promise.all(
  staticFiles.map((file) => copyFile(new URL(`../${file}`, import.meta.url), new URL(file, outputDir)))
);
