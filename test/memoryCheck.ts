// Measures heap growth under a heavy workload. Run with `node --expose-gc` (see memory.test.ts);
// it prints one line with the measurements.
import { BigintDecimal } from '../index';

if (typeof gc !== "function") throw new Error("run with node --expose-gc");
const collect = gc;

const heapAfterGc = (): number => {
  for (let i = 0; i < 5; i++) collect();
  return process.memoryUsage().heapUsed;
};

// Everything the library does: parsing, arithmetic, every Math function, errors, precision changes
const workload = (round: number): void => {
  for (const precision of [20, 50, 20]) {
    BigintDecimal.setPrecisionGlobal(precision);
    for (let i = 1; i <= 60; i++) {
      const x = new BigintDecimal(`${i}.${round}${i}7`);
      const y = x.times("-0.37").plus(i).minus("1e-30").div(7).round(12);
      y.gt(x); y.eq("1.5"); y.toString(); JSON.stringify(y);
      BigintDecimal.sqrt(x); BigintDecimal.cbrt(y); BigintDecimal.exp(y.div(10)); BigintDecimal.expm1("0.001");
      BigintDecimal.log(x); BigintDecimal.log10(x); BigintDecimal.log2(x); BigintDecimal.log1p(x);
      BigintDecimal.sin(x); BigintDecimal.cos(y); BigintDecimal.tan(x); BigintDecimal.atan(y); BigintDecimal.atan2(y, x);
      BigintDecimal.asin("0.5"); BigintDecimal.acos("-0.25"); BigintDecimal.sinh(y.div(10)); BigintDecimal.cosh("1.5");
      BigintDecimal.tanh(y); BigintDecimal.asinh(y); BigintDecimal.acosh(x.plus(1)); BigintDecimal.atanh("0.5");
      BigintDecimal.pow(x, "1.5"); BigintDecimal.pow(y, 7); BigintDecimal.hypot(x, y, 3);
      BigintDecimal.max(x, y, 0); BigintDecimal.min(x, y); BigintDecimal.sumPrecise([x, y, "0.1"]);
      BigintDecimal.floor(y); BigintDecimal.ceil(y); BigintDecimal.round(y); BigintDecimal.trunc(y);
      BigintDecimal.abs(y); BigintDecimal.sign(y); BigintDecimal.random();
      try { BigintDecimal.sqrt(-i); } catch { /* expected */ }
      try { new BigintDecimal("not a number"); } catch { /* expected */ }
    }
  }
  BigintDecimal.setPrecisionGlobal(20);
};

// 1. Fill the caches once (constants, the log table for every possible j, powers of ten)
workload(0);
BigintDecimal.setPrecisionGlobal(50);
for (let j = 0; j < 256; j++) BigintDecimal.log(1 + j / 256);
BigintDecimal.setPrecisionGlobal(20);
for (let j = 0; j < 256; j++) BigintDecimal.log(1 + j / 256);

// 2. Repeating the workload must not grow the heap
const beforeRepeat = heapAfterGc();
for (let round = 1; round <= 25; round++) workload(round);
const afterRepeat = heapAfterGc();

// 3. Results that are no longer referenced are freed
let kept: BigintDecimal[] = [];
for (let i = 0; i < 200000; i++) kept.push(BigintDecimal.sqrt(i));
const whileHeld = heapAfterGc();
// Read `kept` after measuring: V8 frees variables it can see are never read again
const heldCount = kept.length;
kept = [];
const afterRelease = heapAfterGc();

// 4. Switching precision back and forth does not keep adding cached values
const beforeSwitching = heapAfterGc();
for (let round = 0; round < 50; round++) {
  for (const precision of [10, 80, 30, 80, 10]) {
    BigintDecimal.setPrecisionGlobal(precision);
    BigintDecimal.PI; BigintDecimal.LN10; BigintDecimal.log("7.5"); BigintDecimal.sin("2");
  }
}
BigintDecimal.setPrecisionGlobal(20);
const afterSwitching = heapAfterGc();

// 5. clearCache() gives back the memory of constants cached at high precision
BigintDecimal.setPrecisionGlobal(3000);
for (let j = 0; j < 256; j++) BigintDecimal.log(1 + j / 256);
BigintDecimal.PI; BigintDecimal.sin("2");
BigintDecimal.setPrecisionGlobal(20);
const withLargeCache = heapAfterGc();
BigintDecimal.clearCache();
const afterClear = heapAfterGc();

// One line of numbers, in the order memory.test.ts reads them
process.stdout.write([
  afterRepeat - beforeRepeat,   // repeatGrowth
  whileHeld - afterRelease,     // heldBytes
  afterRelease - beforeRepeat,  // releasedTo
  afterSwitching - beforeSwitching, // switchingGrowth
  heldCount,                    // heldCount
  withLargeCache - afterClear,  // clearedBytes
].join(" ") + "\n");
