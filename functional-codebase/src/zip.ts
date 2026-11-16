// Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
// Prompt Summary: "Implement manuscript file upload, download, delete and zip download"
// AI Contribution: 100% AI generated / 0% human refactored
// Human Modifications: Reviewed line by line, no code changes (kept naive on purpose); notes in .ai_logs/conceptual_journal.md
// Verification: tests/manuscript-files.test.ts; human: reviewed line by line, ran npm run typecheck + npm test (7 files / 75 tests pass, real Postgres 16)
// Confidence: Medium

import { createReadStream } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import type { Writable } from "node:stream";
import { Zip, ZipPassThrough } from "fflate";

// Step 1: makes a file name safe to show to users and to use inside a zip:
// we keep only the last path part (so "../../x.pdf" becomes "x.pdf") and drop control characters and quotes.
export function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(-255);
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "manuscript" : cleaned;
}

// Step 2: two manuscripts can have the same original name, so we turn the second one into "name (2).ext".
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// Step 3: streams a zip to the response one file at a time, so memory use stays small.
// Files are stored without compression (manuscripts such as PDFs are already compressed).
export async function streamZip(out: Writable, entries: { name: string; file: string }[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      out.write(chunk);
      if (final) {
        out.end();
        resolve();
      }
    });

    (async () => {
      for (const entry of entries) {
        const item = new ZipPassThrough(entry.name);
        zip.add(item);
        for await (const chunk of createReadStream(entry.file)) {
          item.push(chunk as Buffer, false);
          // Step 3a: if the client reads slowly, wait for the socket to drain before reading more.
          if (out.writableNeedDrain) await once(out, "drain");
        }
        item.push(new Uint8Array(0), true);
      }
      zip.end();
    })().catch(reject);
  });
}
