import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

interface MemoryReport {
  repeatGrowth: number;
  heldBytes: number;
  releasedTo: number;
  switchingGrowth: number;
  heldCount: number;
  clearedBytes: number;
}

// The measurement runs in its own process with --expose-gc, so jest's own memory use is not counted
// and garbage collection can be forced before every reading.
const runMemoryCheck = (): MemoryReport => {
  const output = execFileSync(process.execPath, ["--expose-gc", join(__dirname, "memoryCheck.js")], {
    encoding: "utf8",
    timeout: 120000,
  });
  const [repeatGrowth, heldBytes, releasedTo, switchingGrowth, heldCount, clearedBytes] = output.trim().split(" ").map(Number);
  if (repeatGrowth === undefined || heldBytes === undefined || releasedTo === undefined ||
    switchingGrowth === undefined || heldCount === undefined || clearedBytes === undefined) {
    throw new Error(`unexpected memory report: ${output}`);
  }
  return { repeatGrowth, heldBytes, releasedTo, switchingGrowth, heldCount, clearedBytes };
};

const MB = 1024 * 1024;

describe('Memory', () => {
  const report = runMemoryCheck();

  it('repeating a heavy workload does not grow the heap (no leak)', () => {
    // 25 rounds x ~7000 calls of everything; caches were filled beforehand
    expect(report.repeatGrowth).toBeLessThan(1 * MB);
  });

  it('results that are no longer referenced are freed', () => {
    // 200,000 results were held, then released
    expect(report.heldCount).toBe(200000);
    expect(report.heldBytes).toBeGreaterThan(5 * MB);
    expect(report.releasedTo).toBeLessThan(1 * MB);
  });

  it('switching precision back and forth does not keep adding cached values', () => {
    expect(report.switchingGrowth).toBeLessThan(1 * MB);
  });

  it('clearCache() gives back the memory of constants cached at high precision', () => {
    // 3000-digit pi, ln2, ln10 and all 255 log table entries (~0.3 MB)
    expect(report.clearedBytes).toBeGreaterThan(200 * 1024);
  });
});
