// Compares bigint-decimal with decimal.js, bignumber.js and big.js (timed with tinybench). Run with `npm run bench`.
// Prints Markdown tables for the README.
import Big from "big.js";
import BigNumber from "bignumber.js";
import Decimal from "decimal.js";
import { cpus } from "node:os";
import { Bench } from "tinybench";
import { BigintDecimal } from "../index";

type Library = "bigint-decimal" | "decimal.js" | "bignumber.js" | "big.js";
const LIBRARIES: readonly Library[] = ["bigint-decimal", "decimal.js", "bignumber.js", "big.js"];

// Each case is called with a rotating index into 16 inputs. A single fixed input can be unusually easy
// for one library (e.g. an argument that needs no reduction), so varied inputs give a fair average.
interface Case {
  name: string;
  run: Partial<Record<Library, (i: number) => unknown>>;
}

const INPUT_COUNT = 16;

// Deterministic inputs with 12 significant digits, so every run measures the same numbers
const inputs = (min: number, max: number, seed: number): string[] => {
  let state = seed;
  return Array.from({ length: INPUT_COUNT }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return (min + (state / 2147483648) * (max - min)).toPrecision(12);
  });
};

const pick = (values: string[], i: number): string => values[i % INPUT_COUNT] ?? "1";

const arithmetic = inputs(1, 1000, 1), roots = inputs(1, 1000, 2), exps = inputs(0.1, 5, 3), logs = inputs(0.5, 1000, 4);
const angles = inputs(0.1, 6.2, 5), tangents = inputs(-3, 3, 6), bases = inputs(0.5, 3, 7), powers = inputs(1.1, 3.9, 8);

const cases: Case[] = [
  {
    name: "parse + plus + times + div",
    run: {
      "bigint-decimal": (i) => new BigintDecimal(pick(arithmetic, i)).plus("7.89").times("0.3").div("7"),
      "decimal.js": (i) => new Decimal(pick(arithmetic, i)).plus("7.89").times("0.3").div("7"),
      "bignumber.js": (i) => new BigNumber(pick(arithmetic, i)).plus("7.89").times("0.3").div("7"),
      "big.js": (i) => new Big(pick(arithmetic, i)).plus("7.89").times("0.3").div("7"),
    },
  },
  {
    name: "sqrt",
    run: {
      "bigint-decimal": (i) => BigintDecimal.sqrt(pick(roots, i)),
      "decimal.js": (i) => Decimal.sqrt(pick(roots, i)),
      "bignumber.js": (i) => new BigNumber(pick(roots, i)).sqrt(),
      "big.js": (i) => new Big(pick(roots, i)).sqrt(),
    },
  },
  { name: "exp", run: { "bigint-decimal": (i) => BigintDecimal.exp(pick(exps, i)), "decimal.js": (i) => Decimal.exp(pick(exps, i)) } },
  { name: "ln", run: { "bigint-decimal": (i) => BigintDecimal.log(pick(logs, i)), "decimal.js": (i) => Decimal.ln(pick(logs, i)) } },
  { name: "sin", run: { "bigint-decimal": (i) => BigintDecimal.sin(pick(angles, i)), "decimal.js": (i) => Decimal.sin(pick(angles, i)) } },
  { name: "atan", run: { "bigint-decimal": (i) => BigintDecimal.atan(pick(tangents, i)), "decimal.js": (i) => Decimal.atan(pick(tangents, i)) } },
  {
    name: "pow (non-integer exponent)",
    run: {
      "bigint-decimal": (i) => BigintDecimal.pow(pick(bases, i), pick(powers, i)),
      "decimal.js": (i) => Decimal.pow(pick(bases, i), pick(powers, i)),
    },
  },
];

// Results are kept here, so the engine cannot skip a call whose result looks unused
let sink: unknown;

// Mean microseconds per call, measured by tinybench: a warm-up round over every input, then
// samples for at least 300 ms and at least one full round of inputs
const measure = (fn: (i: number) => unknown): number => {
  let call = 0;
  const bench = new Bench({ time: 300, iterations: INPUT_COUNT, warmupTime: 0, warmupIterations: INPUT_COUNT, throws: true });
  bench.add("case", () => {
    sink = fn(call++);
  });
  const [task] = bench.runSync();
  if (task?.result.state !== "completed") throw new Error("benchmark task did not complete");
  return task.result.latency.mean * 1000;
};

const formatTime = (microseconds: number): string =>
  microseconds >= 1000 ? `${(microseconds / 1000).toFixed(1)} ms`
    : microseconds >= 10 ? `${microseconds.toFixed(0)} µs`
      : `${microseconds.toFixed(2)} µs`;

// Every library computes to the same number of digits (for the values used here, all below 1000)
const setPrecision = (digits: number): void => {
  BigintDecimal.setPrecisionGlobal(digits);
  Decimal.set({ precision: digits + 3, rounding: Decimal.ROUND_HALF_UP }); // significant digits
  BigNumber.config({ DECIMAL_PLACES: digits });
  Big.DP = digits;
};

const table = (digits: number): string => {
  setPrecision(digits);
  const lines = [
    `| ${digits} digits | ${LIBRARIES.join(" | ")} |`,
    `| --- | ${LIBRARIES.map(() => "---:").join(" | ")} |`,
  ];
  for (const { name, run } of cases) {
    const times = LIBRARIES.map((library) => {
      const fn = run[library];
      return fn ? measure(fn) : undefined;
    });
    const fastest = Math.min(...times.filter((time): time is number => time !== undefined));
    const cells = times.map((time) =>
      time === undefined ? "—" : time === fastest ? `**${formatTime(time)}**` : formatTime(time));
    lines.push(`| ${name} | ${cells.join(" | ")} |`);
    process.stderr.write(`  ${digits} digits: ${name} done\n`);
  }
  return lines.join("\n");
};

// Results agree with decimal.js to within half a unit in the last place (both correctly rounded)
const accuracy = (digits: number): string => {
  BigintDecimal.setPrecisionGlobal(digits);
  Decimal.set({ precision: digits + 4 });
  const pairs: [BigintDecimal, Decimal][] = [
    [BigintDecimal.exp("1.2345"), Decimal.exp("1.2345")],
    [BigintDecimal.log("123.456"), Decimal.ln("123.456")],
    [BigintDecimal.sin("1.2345"), Decimal.sin("1.2345")],
    [BigintDecimal.atan("0.7"), Decimal.atan("0.7")],
    [BigintDecimal.sqrt("2"), Decimal.sqrt("2")],
    [BigintDecimal.pow("1.2345", "2.5"), Decimal.pow("1.2345", "2.5")],
  ];
  const halfUnit = new Decimal(`5e-${digits + 1}`);
  const largest = pairs.reduce((max, [ours, theirs]) => Decimal.max(max, new Decimal(ours.toString()).minus(theirs).abs()), new Decimal(0));
  return `Accuracy at ${digits} digits: largest difference from decimal.js is ${largest.toExponential(2)} `
    + `(${largest.lte(halfUnit) ? "within" : "NOT within"} half a unit in the last place).`;
};

// decimal.js stores ln(10) with 1025 digits, so its ln and pow stop working above that
const precisionLimit = (digits: number): string => {
  Decimal.set({ precision: digits });
  BigintDecimal.setPrecisionGlobal(digits);
  let theirs: string;
  try {
    Decimal.ln(2);
    theirs = "works";
  } catch (error) {
    theirs = error instanceof Error ? error.message : String(error);
  }
  const ours = BigintDecimal.log(2).toString().length > digits ? "works" : "fails";
  return `ln(2) at ${digits} digits: bigint-decimal ${ours}, decimal.js: ${theirs}.`;
};

const cpu = cpus()[0]?.model.trim() ?? "unknown CPU";
console.log(`Node ${process.version}, ${cpu}\n`);
console.log(table(20));
console.log();
console.log(table(1000));
console.log();
console.log(accuracy(1000));
console.log(precisionLimit(2000));
// Reading the sink keeps every measured result alive
if (sink === undefined) throw new Error("benchmark produced no results");
