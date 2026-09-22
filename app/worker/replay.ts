import { readFile } from "node:fs/promises";
import { replayArtifact } from "../src/trustnode/runs/artifact";
async function main() {
  if (process.version !== "v22.23.2") throw new Error("Use the recorded Node runtime.");
  const [inputFile, outputFile, manifestFile] = process.argv.slice(2);
  if (!inputFile || !outputFile || !manifestFile) throw new Error("Usage: npm run graph:replay -- input.json canonical.json manifest.json");
  const [input, canonical, manifest] = await Promise.all([inputFile, outputFile, manifestFile].map(path => readFile(path, "utf8")));
  const result = replayArtifact(input, canonical, JSON.parse(manifest).output_hash);
  console.log(JSON.stringify(result));
  if (!result.matches) process.exitCode = 1;
}
main().catch(() => { console.error("Replay failed: check the three exported artifacts and pinned runtime."); process.exitCode = 1; });
