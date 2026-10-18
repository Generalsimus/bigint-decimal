import { afterEach, describe, expect, it } from "@jest/globals";
import { BigintDecimal } from '../index';
import { BigintDecimalBase } from '../bigintDecimalBase';
import {
  CONSTANTS_50, HARD_CASES_20, HARD_CASES_40, LARGE_RESULTS_40, PI_1000, PI_300,
  REFERENCES_1000, REFERENCES_2000, REFERENCES_300, REFERENCES_50,
  type MathName, type ReferenceCase,
} from "./mathReferences";

// ---------------------------------------------------------------------------- helpers

type MathFn = (...args: string[]) => BigintDecimal;
type NumberFn = (x: number) => number;
type ConstantName = keyof typeof CONSTANTS_50;

const CONSTANT_NAMES: readonly ConstantName[] = ["E", "LN10", "LN2", "LOG10E", "LOG2E", "PI", "SQRT1_2", "SQRT2"];

const FUNCTIONS: Record<MathName, MathFn> = {
  acos: BigintDecimal.acos, acosh: BigintDecimal.acosh, asin: BigintDecimal.asin, asinh: BigintDecimal.asinh,
  atan: BigintDecimal.atan, atan2: BigintDecimal.atan2, atanh: BigintDecimal.atanh, cbrt: BigintDecimal.cbrt,
  cos: BigintDecimal.cos, cosh: BigintDecimal.cosh, exp: BigintDecimal.exp, expm1: BigintDecimal.expm1,
  hypot: BigintDecimal.hypot, log: BigintDecimal.log, log10: BigintDecimal.log10, log1p: BigintDecimal.log1p,
  log2: BigintDecimal.log2, pow: BigintDecimal.pow, sin: BigintDecimal.sin, sinh: BigintDecimal.sinh,
  sqrt: BigintDecimal.sqrt, tan: BigintDecimal.tan, tanh: BigintDecimal.tanh,
};

// Relative closeness to a JS number (for comparisons against the built-in Math)
const expectClose = (got: BigintDecimal, expected: number, tolerance = 1e-12) => {
  const diff = Math.abs(Number(got.toString()) - expected);
  expect(diff).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)));
};

// |a - b| <= tolerance, computed exactly
const expectNear = (a: BigintDecimal, b: string | BigintDecimal, tolerance: string) => {
  const diff = BigintDecimal.abs(a.minus(b));
  if (diff.gt(tolerance)) throw new Error(`|${a} - ${b}| = ${diff} > ${tolerance}`);
};

// Checks every reference case and reports the exact input on failure
const expectReferences = (cases: ReferenceCase[], precision: number) => {
  BigintDecimal.setPrecisionGlobal(precision);
  for (const [name, args, expected] of cases) {
    expect(`${name}(${args.join(", ")}) = ${FUNCTIONS[name](...args).toString()}`)
      .toBe(`${name}(${args.join(", ")}) = ${expected}`);
  }
};

// Seeded PRNG (mulberry32), so every run tests the same "random" values
const createRandom = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A decimal value with its exact oracle: `scaled / 10^scale`
interface Sample { text: string; scaled: bigint; scale: number }

const createSamples = (seed: number, count: number, maxIntDigits: number, maxDecimals: number, allowNegative = true): Sample[] => {
  const random = createRandom(seed);
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 10)).join("");
  const samples: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const intPart = digits(1 + Math.floor(random() * maxIntDigits)).replace(/^0+(?=\d)/, "");
    const scale = Math.floor(random() * (maxDecimals + 1));
    const fraction = digits(scale);
    const negative = allowNegative && random() < 0.5;
    const text = (negative ? "-" : "") + intPart + (scale > 0 ? "." + fraction : "");
    const magnitude = BigInt(intPart + fraction);
    samples.push({ text, scaled: negative ? -magnitude : magnitude, scale });
  }
  return samples;
};

// Exact oracle -> decimal string, trimmed like BigintDecimal.toString()
const formatScaled = (scaled: bigint, scale: number): string => {
  const negative = scaled < 0n;
  let digits = (negative ? -scaled : scaled).toString().padStart(scale + 1, "0");
  let s = scale > 0 ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits;
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  digits = s;
  return negative && digits !== "0" ? "-" + digits : digits;
};

const alignScaled = (a: Sample, b: Sample): [bigint, bigint, number] => {
  const scale = Math.max(a.scale, b.scale);
  return [a.scaled * 10n ** BigInt(scale - a.scale), b.scaled * 10n ** BigInt(scale - b.scale), scale];
};

// floor(a / b) for bigints
const floorDiv = (a: bigint, b: bigint) => {
  const q = a / b;
  return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q;
};

// Rounds `scaled / 10^scale` to `decimals` places, half away from zero
const roundScaled = (scaled: bigint, scale: number, decimals: number): string => {
  if (scale <= decimals) return formatScaled(scaled, scale);
  const unit = 10n ** BigInt(scale - decimals);
  const half = unit / 2n;
  return formatScaled(scaled >= 0n ? (scaled + half) / unit : (scaled - half) / unit, decimals);
};

// ---------------------------------------------------------------------------- tests

describe('BigintDecimal Math functions', () => {
  afterEach(() => {
    BigintDecimal.setPrecisionGlobal(20);
  });

  describe('Matches JS Math on ordinary values', () => {
    const values = ["-7.5", "-2", "-1", "-0.75", "-0.3", "0", "0.001", "0.3", "0.5", "0.75", "1", "1.5", "2", "3", "10", "123.456"];

    const everywhere: [string, MathFn, NumberFn][] = [
      ["abs", BigintDecimal.abs, Math.abs], ["sign", BigintDecimal.sign, Math.sign],
      ["floor", BigintDecimal.floor, Math.floor], ["ceil", BigintDecimal.ceil, Math.ceil],
      ["round", BigintDecimal.round, Math.round], ["trunc", BigintDecimal.trunc, Math.trunc],
      ["cbrt", BigintDecimal.cbrt, Math.cbrt], ["exp", BigintDecimal.exp, Math.exp], ["expm1", BigintDecimal.expm1, Math.expm1],
      ["sin", BigintDecimal.sin, Math.sin], ["cos", BigintDecimal.cos, Math.cos], ["tan", BigintDecimal.tan, Math.tan],
      ["atan", BigintDecimal.atan, Math.atan], ["sinh", BigintDecimal.sinh, Math.sinh], ["cosh", BigintDecimal.cosh, Math.cosh],
      ["tanh", BigintDecimal.tanh, Math.tanh], ["asinh", BigintDecimal.asinh, Math.asinh],
    ];
    it.each(everywhere)('%s', (_name, fn, jsFn) => {
      for (const x of values) expectClose(fn(x), jsFn(Number(x)));
    });

    const restricted: [string, MathFn, NumberFn, (x: number) => boolean][] = [
      ["sqrt", BigintDecimal.sqrt, Math.sqrt, (x) => x >= 0],
      ["log", BigintDecimal.log, Math.log, (x) => x > 0],
      ["log10", BigintDecimal.log10, Math.log10, (x) => x > 0],
      ["log2", BigintDecimal.log2, Math.log2, (x) => x > 0],
      ["log1p", BigintDecimal.log1p, Math.log1p, (x) => x > -1],
      ["asin", BigintDecimal.asin, Math.asin, (x) => Math.abs(x) <= 1],
      ["acos", BigintDecimal.acos, Math.acos, (x) => Math.abs(x) <= 1],
      ["atanh", BigintDecimal.atanh, Math.atanh, (x) => Math.abs(x) < 1],
      ["acosh", BigintDecimal.acosh, Math.acosh, (x) => x >= 1],
    ];
    it.each(restricted)('%s inside its domain', (_name, fn, jsFn, inDomain) => {
      for (const x of values) if (inDomain(Number(x))) expectClose(fn(x), jsFn(Number(x)));
    });

    it('atan2 and pow over every pair of values', () => {
      for (const y of values) {
        for (const x of values) {
          expectClose(BigintDecimal.atan2(y, x), Math.atan2(Number(y), Number(x)));
          const base = Number(y), exponent = Number(x);
          const isDefined = !(base === 0 && exponent < 0) && !(base < 0 && !Number.isInteger(exponent));
          if (isDefined) expectClose(BigintDecimal.pow(y, x), Math.pow(base, exponent));
        }
      }
    });

    it('constants at the default precision', () => {
      for (const name of CONSTANT_NAMES) expectClose(BigintDecimal[name], Math[name], 1e-15);
      expect(BigintDecimal.PI.toString()).toBe("3.14159265358979323846");
    });
  });

  describe('Exact digits against independent references', () => {
    it('50 decimal places, big and tiny inputs', () => expectReferences(REFERENCES_50, 50));

    it('constants at 50 decimal places', () => {
      BigintDecimal.setPrecisionGlobal(50);
      for (const name of CONSTANT_NAMES) expect(BigintDecimal[name].toString()).toBe(CONSTANTS_50[name]);
    });

    it('300 decimal places', () => {
      expectReferences(REFERENCES_300, 300);
      expect(BigintDecimal.PI.toString()).toBe(PI_300);
    });

    it('1000 decimal places', () => {
      expectReferences(REFERENCES_1000, 1000);
      expect(BigintDecimal.PI.toString()).toBe(PI_1000);
    });

    // Above ~1500 digits atan switches to Newton's method, and the constants to binary splitting
    it('2000 decimal places', () => expectReferences(REFERENCES_2000, 2000));

    // next to singularities (asin/acos/atanh near ±1, tan near its poles), near multiples of pi,
    // tiny and huge arguments, pow with a base next to 1 and a huge exponent
    it('hard inputs at 20 decimal places', () => expectReferences(HARD_CASES_20, 20));
    it('hard inputs at 40 decimal places', () => expectReferences(HARD_CASES_40, 40));

    // Results with hundreds of integer digits need extra working bits for every one of them
    it('large results at 40 decimal places', () => expectReferences(LARGE_RESULTS_40, 40));

    it('huge arguments', () => {
      BigintDecimal.setPrecisionGlobal(50);
      expect(BigintDecimal.sin("1e300").toString()).toBe("-0.98575042516037699660904753142989546907771531256103");
      expect(BigintDecimal.cos("1e300").toString()).toBe("-0.16821444437424507285187566443555584453305088766805");
    });
  });

  describe('Identities hold on random big and fractional values', () => {
    it('log(exp(x)) = x', () => {
      for (const s of createSamples(1, 40, 2, 25)) {
        const x = s.text.startsWith("-") ? s.text.slice(1) : s.text; // x in [0, 100)
        expectNear(BigintDecimal.log(BigintDecimal.exp(x)), x, "1e-18");
      }
    });

    it('log(a * b) = log(a) + log(b), for numbers from 1e-30 to 1e40', () => {
      const random = createRandom(2);
      for (let i = 0; i < 40; i++) {
        const a = `${(random() * 9 + 1).toFixed(15)}e${Math.floor(random() * 70) - 30}`;
        const b = `${(random() * 9 + 1).toFixed(15)}e${Math.floor(random() * 70) - 30}`;
        const product = new BigintDecimal(a).times(b);
        expectNear(BigintDecimal.log(product), BigintDecimal.log(a).plus(BigintDecimal.log(b)).toString(), "1e-18");
      }
    });

    it('sin^2 + cos^2 = 1, up to 1e30', () => {
      for (const s of createSamples(3, 40, 30, 20)) {
        const sin = BigintDecimal.sin(s.text), cos = BigintDecimal.cos(s.text);
        expectNear(new BigintDecimal(sin.times(sin).plus(cos.times(cos))), "1", "1e-18");
      }
    });

    it('inverse functions', () => {
      for (const s of createSamples(4, 40, 1, 20)) {
        const unit = new BigintDecimal(s.text).div(10).toString(); // (-1, 1)
        expectNear(BigintDecimal.atan(BigintDecimal.tan(unit)), unit, "1e-18");
        expectNear(BigintDecimal.sin(BigintDecimal.asin(unit)), unit, "1e-18");
        expectNear(BigintDecimal.cos(BigintDecimal.acos(unit)), unit, "1e-18");
        expectNear(BigintDecimal.tanh(BigintDecimal.atanh(unit)), unit, "1e-18");
        expectNear(BigintDecimal.asinh(BigintDecimal.sinh(s.text)), s.text, "1e-18");
        expectNear(BigintDecimal.cbrt(BigintDecimal.pow(s.text, 3)), s.text, "1e-18");
      }
    });

    it('cosh^2 - sinh^2 = 1 and acosh(cosh(x)) = |x|', () => {
      for (const s of createSamples(5, 40, 1, 20)) {
        const ch = BigintDecimal.cosh(s.text), sh = BigintDecimal.sinh(s.text);
        expectNear(new BigintDecimal(ch.times(ch).minus(sh.times(sh))), "1", "1e-15");
        if (BigintDecimal.abs(s.text).gt("0.001")) expectNear(BigintDecimal.acosh(ch), BigintDecimal.abs(s.text), "1e-15");
      }
    });

    it('atan2 agrees with atan(y / x) in every quadrant', () => {
      const samples = createSamples(6, 40, 6, 10).filter((s) => s.scaled !== 0n);
      for (let i = 0; i + 1 < samples.length; i += 2) {
        const y = samples[i]?.text ?? "1", x = samples[i + 1]?.text ?? "1";
        const atan = BigintDecimal.atan(new BigintDecimal(y).div(x).toString());
        const pi = BigintDecimal.PI;
        const expected = new BigintDecimal(x).gt(0) ? atan : new BigintDecimal(y).gte(0) ? atan.plus(pi) : atan.minus(pi);
        expectNear(BigintDecimal.atan2(y, x), new BigintDecimal(expected), "1e-17");
      }
    });

    it('pow(x, 0.5) = sqrt(x) and pow(x, a + b) = pow(x, a) * pow(x, b)', () => {
      for (const s of createSamples(7, 30, 3, 10, false)) {
        if (s.scaled === 0n) continue;
        expectNear(BigintDecimal.pow(s.text, "0.5"), BigintDecimal.sqrt(s.text), "1e-19");
        const product = BigintDecimal.pow(s.text, "1.25").times(BigintDecimal.pow(s.text, "0.5"));
        const expected = BigintDecimal.pow(s.text, "1.75");
        expectNear(new BigintDecimal(product), expected, expected.times("1e-17").plus("1e-17").toString());
      }
    });

    it('identities at 50 digits', () => {
      BigintDecimal.setPrecisionGlobal(50);
      for (const x of ["123.456", "0.000000000001", "1000.5"]) {
        expectNear(BigintDecimal.log(BigintDecimal.exp(x)), x, "1e-45");
      }
      for (const x of ["1", "123456789.987654321", "1e25", "-0.000001"]) {
        const s = BigintDecimal.sin(x), c = BigintDecimal.cos(x);
        expectNear(new BigintDecimal(s.times(s).plus(c.times(c))), "1", "1e-45");
      }
      expectNear(new BigintDecimal(BigintDecimal.atan(1).times(4)), BigintDecimal.PI, "1e-45");
    });
  });

  describe('Results are correctly rounded (checked exactly)', () => {
    it('sqrt is within half a unit in the last place', () => {
      const ulp = new BigintDecimal("1e-20");
      for (const s of createSamples(8, 60, 40, 30, false)) {
        const r = BigintDecimal.sqrt(s.text);
        const low = r.minus(ulp.times("0.5")), high = r.plus(ulp.times("0.5"));
        expect(low.lt(0) || low.times(low).lte(s.text)).toBe(true);
        expect(high.times(high).gte(s.text)).toBe(true);
      }
    });

    it('cbrt is within half a unit in the last place', () => {
      const half = new BigintDecimal("0.5e-20");
      for (const s of createSamples(9, 60, 40, 30)) {
        const r = BigintDecimal.cbrt(s.text);
        const low = r.minus(half), high = r.plus(half);
        expect(low.times(low).times(low).lte(s.text)).toBe(true);
        expect(high.times(high).times(high).gte(s.text)).toBe(true);
      }
    });

    it('hypot is the square root of the exact sum of squares', () => {
      const samples = createSamples(10, 30, 30, 15);
      for (let i = 0; i + 2 < samples.length; i += 3) {
        const [a, b, c] = [samples[i]?.text ?? "0", samples[i + 1]?.text ?? "0", samples[i + 2]?.text ?? "0"];
        const sum = new BigintDecimal(a).times(a).plus(new BigintDecimal(b).times(b)).plus(new BigintDecimal(c).times(c));
        expect(BigintDecimal.hypot(a, b, c).toString()).toBe(BigintDecimal.sqrt(sum).toString());
      }
    });
  });

  describe('Exact values at special points and domain edges', () => {
    const PI = "3.14159265358979323846", HALF_PI = "1.57079632679489661923";
    const cases: [label: string, fn: () => BigintDecimal, expected: string][] = [
      ["sqrt(0)", () => BigintDecimal.sqrt(0), "0"], ["sqrt(1)", () => BigintDecimal.sqrt(1), "1"],
      ["cbrt(0)", () => BigintDecimal.cbrt(0), "0"], ["cbrt(-8)", () => BigintDecimal.cbrt(-8), "-2"],
      ["exp(0)", () => BigintDecimal.exp(0), "1"], ["expm1(0)", () => BigintDecimal.expm1(0), "0"],
      ["log(1)", () => BigintDecimal.log(1), "0"], ["log10(1)", () => BigintDecimal.log10(1), "0"],
      ["log2(1)", () => BigintDecimal.log2(1), "0"], ["log1p(0)", () => BigintDecimal.log1p(0), "0"],
      ["log10(10)", () => BigintDecimal.log10(10), "1"], ["log2(0.5)", () => BigintDecimal.log2("0.5"), "-1"],
      ["log(e)", () => BigintDecimal.log(BigintDecimal.E), "1"],
      ["sin(0)", () => BigintDecimal.sin(0), "0"], ["cos(0)", () => BigintDecimal.cos(0), "1"], ["tan(0)", () => BigintDecimal.tan(0), "0"],
      ["asin(0)", () => BigintDecimal.asin(0), "0"], ["asin(1)", () => BigintDecimal.asin(1), HALF_PI],
      ["asin(-1)", () => BigintDecimal.asin(-1), "-" + HALF_PI], ["acos(1)", () => BigintDecimal.acos(1), "0"],
      ["acos(0)", () => BigintDecimal.acos(0), HALF_PI], ["acos(-1)", () => BigintDecimal.acos(-1), PI],
      ["atan(0)", () => BigintDecimal.atan(0), "0"], ["atan(1)", () => BigintDecimal.atan(1), "0.78539816339744830962"],
      ["atan(-1)", () => BigintDecimal.atan(-1), "-0.78539816339744830962"],
      ["atan2(0, 0)", () => BigintDecimal.atan2(0, 0), "0"], ["atan2(0, 5)", () => BigintDecimal.atan2(0, 5), "0"],
      ["atan2(0, -5)", () => BigintDecimal.atan2(0, -5), PI], ["atan2(5, 0)", () => BigintDecimal.atan2(5, 0), HALF_PI],
      ["atan2(-5, 0)", () => BigintDecimal.atan2(-5, 0), "-" + HALF_PI], ["atan2(1, 1)", () => BigintDecimal.atan2(1, 1), "0.78539816339744830962"],
      ["atan2(-1, -1)", () => BigintDecimal.atan2(-1, -1), "-2.35619449019234492885"],
      ["sinh(0)", () => BigintDecimal.sinh(0), "0"], ["cosh(0)", () => BigintDecimal.cosh(0), "1"], ["tanh(0)", () => BigintDecimal.tanh(0), "0"],
      ["asinh(0)", () => BigintDecimal.asinh(0), "0"], ["acosh(1)", () => BigintDecimal.acosh(1), "0"], ["atanh(0)", () => BigintDecimal.atanh(0), "0"],
      ["pow(7.5, 1)", () => BigintDecimal.pow("7.5", 1), "7.5"], ["pow(4, -1)", () => BigintDecimal.pow(4, -1), "0.25"],
      ["pow(4, 0.5)", () => BigintDecimal.pow(4, "0.5"), "2"], ["pow(-8, 2)", () => BigintDecimal.pow(-8, 2), "64"],
      ["pow(1e-10, -1)", () => BigintDecimal.pow("1e-10", -1), "10000000000"],
      ["hypot(0)", () => BigintDecimal.hypot(0), "0"], ["hypot(-3, -4)", () => BigintDecimal.hypot(-3, -4), "5"],
    ];
    it.each(cases)('%s = %s', (_label, fn, expected) => {
      expect(fn().toString()).toBe(expected);
    });
  });

  describe('Exact halfway results round away from zero', () => {
    it('sqrt and cbrt at exact ties', () => {
      // sqrt(2.5e-41) is exactly 5e-21: halfway between 0 and 1e-20
      expect(BigintDecimal.sqrt("2.5e-41").toString()).toBe("0.00000000000000000001");
      expect(BigintDecimal.cbrt("1.25e-61").toString()).toBe("0.00000000000000000001");
      expect(BigintDecimal.cbrt("-1.25e-61").toString()).toBe("-0.00000000000000000001");
      BigintDecimal.setPrecisionGlobal(0);
      expect(BigintDecimal.sqrt("2.25").toString()).toBe("2");   // 1.5
      expect(BigintDecimal.sqrt("6.25").toString()).toBe("3");   // 2.5
      expect(BigintDecimal.sqrt("0.25").toString()).toBe("1");   // 0.5
      expect(BigintDecimal.cbrt("3.375").toString()).toBe("2");  // 1.5
      expect(BigintDecimal.cbrt("-3.375").toString()).toBe("-2"); // -1.5
      expect(BigintDecimal.hypot("0.9", "1.2").toString()).toBe("2"); // 1.5
      BigintDecimal.setPrecisionGlobal(1);
      expect(BigintDecimal.sqrt("0.0225").toString()).toBe("0.2"); // 0.15
    });

    it('just below a tie rounds down, just above rounds up', () => {
      BigintDecimal.setPrecisionGlobal(0);
      expect(BigintDecimal.sqrt("2.2499999999999999999999999999").toString()).toBe("1");
      expect(BigintDecimal.sqrt("2.2500000000000000000000000001").toString()).toBe("2");
      expect(BigintDecimal.cbrt("3.3749999999999999999999999999").toString()).toBe("1");
      expect(BigintDecimal.cbrt("3.3750000000000000000000000001").toString()).toBe("2");
    });

    it('exact ties for perfect squares and cubes at random precisions', () => {
      const random = createRandom(17);
      for (let i = 0; i < 200; i++) {
        const precision = Math.floor(random() * 30);
        const digits = 1n + BigInt(Math.floor(random() * 1e9));
        // r = (digits + 0.5) * 10^-precision is exactly halfway; r^2 and r^3 are exact decimals
        const twice = 2n * digits + 1n; // 2r * 10^precision
        BigintDecimal.setPrecisionGlobal(precision);
        const square = formatScaled(twice * twice * 25n, 2 * precision + 2);   // r^2 = (twice / 2)^2 * 10^-2p
        const cube = formatScaled(twice * twice * twice * 125n, 3 * precision + 3);
        expect(BigintDecimal.sqrt(square).toString()).toBe(formatScaled(digits + 1n, precision));
        expect(BigintDecimal.cbrt(cube).toString()).toBe(formatScaled(digits + 1n, precision));
        expect(BigintDecimal.cbrt("-" + cube).toString()).toBe(formatScaled(-(digits + 1n), precision));
      }
    });
  });

  describe('Exact integer powers', () => {
    it('huge integer powers are exact', () => {
      expect(BigintDecimal.pow(2, 1000).toString()).toBe((2n ** 1000n).toString());
      expect(BigintDecimal.pow(2, 100000).toString()).toBe((2n ** 100000n).toString());
      expect(BigintDecimal.pow("-3", 333).toString()).toBe(((-3n) ** 333n).toString());
      expect(BigintDecimal.pow("123456789123456789", 7).toString()).toBe((123456789123456789n ** 7n).toString());
    });

    it('random decimal bases with integer exponents match exact multiplication', () => {
      const random = createRandom(11);
      for (const s of createSamples(12, 50, 4, 4)) {
        const n = 1 + Math.floor(random() * 30);
        const exact = s.scaled ** BigInt(n);
        expect(BigintDecimal.pow(s.text, n).toString()).toBe(roundScaled(exact, s.scale * n, 20));
      }
    });

    it('decimal bases with integer exponents', () => {
      BigintDecimal.setPrecisionGlobal(50);
      expect(BigintDecimal.pow("1.5", 40).toString()).toBe(formatScaled(15n ** 40n, 40));
      expect(BigintDecimal.pow(10, -25).toString()).toBe("0.0000000000000000000000001");
      expect(BigintDecimal.pow("0.1", 3).toString()).toBe("0.001");
    });

    it('special exponents and bases', () => {
      expect(BigintDecimal.pow(0, 0).toString()).toBe("1");
      expect(BigintDecimal.pow("123456789.123456789", 0).toString()).toBe("1");
      expect(BigintDecimal.pow(0, "2.5").toString()).toBe("0");
      expect(BigintDecimal.pow(1, "1e30").toString()).toBe("1");
      expect(BigintDecimal.pow(-2, 3).toString()).toBe("-8");
      expect(BigintDecimal.pow(-2, -2).toString()).toBe("0.25");
      expect(BigintDecimal.pow("-1.0001", 100001).lt(0)).toBe(true);
    });
  });

  describe('Rounding and sign on huge decimals', () => {
    const big = "123456789012345678901234567890";

    it('floor / ceil / trunc / round / abs / sign on random values match an exact oracle', () => {
      for (const s of createSamples(13, 200, 60, 40)) {
        const unit = 10n ** BigInt(s.scale);
        expect(BigintDecimal.floor(s.text).toString()).toBe(floorDiv(s.scaled, unit).toString());
        expect(BigintDecimal.ceil(s.text).toString()).toBe((-floorDiv(-s.scaled, unit)).toString());
        expect(BigintDecimal.trunc(s.text).toString()).toBe((s.scaled / unit).toString());
        expect(BigintDecimal.round(s.text).toString()).toBe(floorDiv(2n * s.scaled + unit, 2n * unit).toString());
        expect(BigintDecimal.abs(s.text).toString()).toBe(formatScaled(s.scaled < 0n ? -s.scaled : s.scaled, s.scale));
        expect(BigintDecimal.sign(s.text).toString()).toBe(s.scaled > 0n ? "1" : s.scaled < 0n ? "-1" : "0");
      }
    });

    it('floor / ceil / trunc edge cases', () => {
      expect(BigintDecimal.floor(`${big}.999999999999999999999`).toString()).toBe(big);
      expect(BigintDecimal.floor(`-${big}.000000000000000000001`).toString()).toBe("-123456789012345678901234567891");
      expect(BigintDecimal.ceil(`${big}.000000000000000000001`).toString()).toBe("123456789012345678901234567891");
      expect(BigintDecimal.ceil(`-${big}.999999999999999999999`).toString()).toBe(`-${big}`);
      expect(BigintDecimal.trunc(`-${big}.999999999999999999999`).toString()).toBe(`-${big}`);
      expect(BigintDecimal.floor("-0.5").toString()).toBe("-1");
      expect(BigintDecimal.ceil("-0.5").toString()).toBe("0");
      expect(BigintDecimal.floor(big).toString()).toBe(big);
    });

    it('round sends halves toward +Infinity, like Math.round', () => {
      expect(BigintDecimal.round("2.5").toString()).toBe("3");
      expect(BigintDecimal.round("-2.5").toString()).toBe("-2");
      expect(BigintDecimal.round("-2.500000000000000000000000001").toString()).toBe("-3");
      expect(BigintDecimal.round("2.499999999999999999999999999").toString()).toBe("2");
      expect(BigintDecimal.round(`${big}.5`).toString()).toBe("123456789012345678901234567891");
      expect(BigintDecimal.round(`-${big}.5`).toString()).toBe(`-${big}`);
    });

    it('abs and sign edge cases', () => {
      expect(BigintDecimal.abs(`-${big}.000000000000000000001`).toString()).toBe(`${big}.000000000000000000001`);
      expect(BigintDecimal.abs("0").toString()).toBe("0");
      expect(BigintDecimal.sign(`-${big}`).toString()).toBe("-1");
      expect(BigintDecimal.sign("0.000000000000000000000000001").toString()).toBe("1");
      expect(BigintDecimal.sign("0").toString()).toBe("0");
    });
  });

  describe('Aggregates', () => {
    it('max, min and sumPrecise on random values match an exact oracle', () => {
      const samples = createSamples(14, 300, 50, 40);
      const scale = Math.max(...samples.map((s) => s.scale));
      const aligned = samples.map((s) => s.scaled * 10n ** BigInt(scale - s.scale));
      const sorted = [...aligned].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const texts = samples.map((s) => s.text);
      expect(BigintDecimal.max(...texts).toString()).toBe(formatScaled(sorted[sorted.length - 1] ?? 0n, scale));
      expect(BigintDecimal.min(...texts).toString()).toBe(formatScaled(sorted[0] ?? 0n, scale));
      expect(BigintDecimal.sumPrecise(texts).toString()).toBe(formatScaled(aligned.reduce((a, b) => a + b, 0n), scale));
    });

    it('max and min accept every input type', () => {
      const values = ["1e30", 5, -3n, new BigintDecimal("1000000000000000000000000000000.000000000000000000001"), "-1e30"];
      expect(BigintDecimal.max(...values).toString()).toBe("1000000000000000000000000000000.000000000000000000001");
      expect(BigintDecimal.min(...values).toString()).toBe("-1000000000000000000000000000000");
      expect(BigintDecimal.max("0.1").toString()).toBe("0.1");
    });

    it('sumPrecise does not lose tiny values next to huge ones', () => {
      expect(BigintDecimal.sumPrecise(["1e30", "0.000000000000000000000000000001", "-1e30"]).toString())
        .toBe("0.000000000000000000000000000001");
      expect(BigintDecimal.sumPrecise(["0.1", "0.2", 1n, 2]).toString()).toBe("3.3");
      expect(BigintDecimal.sumPrecise(new Set(["5", "-5.5"])).toString()).toBe("-0.5");
      expect(BigintDecimal.sumPrecise([]).toString()).toBe("0");
      expect(BigintDecimal.sumPrecise(Array.from({ length: 10000 }, () => "0.1")).toString()).toBe("1000");
    });

    it('hypot', () => {
      expect(BigintDecimal.hypot(3, 4, "12").toString()).toBe("13");
      expect(BigintDecimal.hypot("3e100", "4e100").toString()).toBe("5" + "0".repeat(100));
      expect(BigintDecimal.hypot().toString()).toBe("0");
      expect(BigintDecimal.hypot("-5").toString()).toBe("5");
    });
  });

  describe('Arithmetic on big numbers and long decimals (exact oracle)', () => {
    const samples = createSamples(15, 300, 80, 50);
    const pairs: [Sample, Sample][] = [];
    for (let i = 0; i + 1 < samples.length; i += 2) {
      const a = samples[i], b = samples[i + 1];
      if (a && b) pairs.push([a, b]);
    }

    it('plus, minus and times are exact', () => {
      for (const [a, b] of pairs) {
        const [va, vb, scale] = alignScaled(a, b);
        const x = new BigintDecimal(a.text);
        expect(x.plus(b.text).toString()).toBe(formatScaled(va + vb, scale));
        expect(x.minus(b.text).toString()).toBe(formatScaled(va - vb, scale));
        expect(x.times(b.text).toString()).toBe(formatScaled(a.scaled * b.scaled, a.scale + b.scale));
      }
    });

    it('div truncates to the precision', () => {
      for (const [a, b] of pairs) {
        if (b.scaled === 0n) continue;
        // a / b = (a.scaled * 10^(20 + b.scale)) / (b.scaled * 10^a.scale), at 20 decimals
        const q = (a.scaled * 10n ** BigInt(20 + b.scale)) / (b.scaled * 10n ** BigInt(a.scale));
        expect(new BigintDecimal(a.text).div(b.text).toString()).toBe(formatScaled(q, 20));
      }
    });

    it('comparisons', () => {
      for (const [a, b] of pairs) {
        const [va, vb] = alignScaled(a, b);
        const x = new BigintDecimal(a.text);
        expect(x.gt(b.text)).toBe(va > vb);
        expect(x.gte(b.text)).toBe(va >= vb);
        expect(x.lt(b.text)).toBe(va < vb);
        expect(x.lte(b.text)).toBe(va <= vb);
        expect(x.eq(b.text)).toBe(va === vb);
        expect(x.eq(a.text)).toBe(true);
      }
    });

    it('round(n) rounds half away from zero', () => {
      for (const s of samples) {
        for (const decimals of [0, 1, 5, 20]) {
          expect(new BigintDecimal(s.text).round(decimals).toString()).toBe(roundScaled(s.scaled, s.scale, decimals));
        }
      }
    });

    it('results feed back into the Math functions', () => {
      const x = new BigintDecimal("123456789012345678901234567890.123456789").times("1e-10").plus("0.5");
      expect(BigintDecimal.floor(x).toString()).toBe("12345678901234567890");
      expect(BigintDecimal.sqrt(x.times(x)).toString()).toBe(x.round(20).toString());
    });
  });

  describe('No size limits: big results are computed in full', () => {
    it('10^1000000 has a million zeros', () => {
      const s = BigintDecimal.pow(10, 1000000).toString();
      expect(s.length).toBe(1000001);
      expect(s.startsWith("10000")).toBe(true);
    });

    it('e^10000 has all 4343 integer digits', () => {
      const s = BigintDecimal.exp(10000).toString();
      expect(s.split(".")[0]?.length).toBe(4343);
      expect(s.startsWith("8806818225662921587261496007644561003520")).toBe(true);
      expectNear(BigintDecimal.log(s), "10000", "1e-18");
    });

    it('square root of a 10000-digit number', () => {
      const n = new BigintDecimal("2" + "0".repeat(10000));
      const r = BigintDecimal.sqrt(n);
      expect(r.toString().split(".")[0]?.length).toBe(5001);
      expect(r.toString().startsWith("14142135623730950488")).toBe(true);
    });

    it('inputs with thousands of decimals', () => {
      const random = createRandom(16);
      const fraction = Array.from({ length: 5000 }, () => Math.floor(random() * 10)).join("");
      const x = "1." + fraction;
      const short = "1." + fraction.slice(0, 40);
      for (const fn of [BigintDecimal.sqrt, BigintDecimal.log, BigintDecimal.sin, BigintDecimal.exp, BigintDecimal.atan]) {
        expectNear(fn(x), fn(short), "1e-20");
      }
      expect(BigintDecimal.floor(x).toString()).toBe("1");
      expect(BigintDecimal.round(x).toString()).toBe(Number(fraction.charAt(0)) >= 5 ? "2" : "1");
    });

    it('tiny values with thousands of leading zeros', () => {
      // ln(1e-3000) = -3000 * ln(10); ln(10) gets 10 extra digits so the multiplication keeps 1600 correct ones
      BigintDecimal.setPrecisionGlobal(1610);
      const expectedLog = BigintDecimal.LN10.times(-3000).round(1600).toString();
      BigintDecimal.setPrecisionGlobal(1600);
      expect(BigintDecimal.sqrt("4e-3000").toString()).toBe("0." + "0".repeat(1499) + "2");
      expect(BigintDecimal.log("1e-3000").toString()).toBe(expectedLog);
    });

    it('high precision: 5000 digits of pi and sqrt(2)', () => {
      BigintDecimal.setPrecisionGlobal(5000);
      const pi = BigintDecimal.PI.toString();
      expect(pi.length).toBe(5002);
      expect(pi.startsWith(PI_1000.slice(0, 1000))).toBe(true);
      const root = BigintDecimal.sqrt(2);
      expectNear(new BigintDecimal(root.times(root)), "2", "1e-4999");
    });

    it('tiny results round to zero instead of failing', () => {
      expect(BigintDecimal.exp("-1e7").toString()).toBe("0");
      expect(BigintDecimal.exp("-1e300").toString()).toBe("0");
      expect(BigintDecimal.tanh("1e7").toString()).toBe("1");
      expect(BigintDecimal.tanh("-1e300").toString()).toBe("-1");
      expect(BigintDecimal.pow("0.5", "1e6").toString()).toBe("0");
    });
  });

  describe('random', () => {
    it('returns values in [0, 1) with at most `precision` decimals', () => {
      BigintDecimal.setPrecisionGlobal(40);
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const r = BigintDecimal.random();
        expect(r).toBeInstanceOf(BigintDecimal);
        expect(r.gte(0) && r.lt(1)).toBe(true);
        expect((r.toString().split(".")[1] ?? "").length).toBeLessThanOrEqual(40);
        seen.add(r.toString());
      }
      expect(seen.size).toBe(200);
    });

    it('falls back to Math.random when crypto is unavailable', () => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      try {
        const r = BigintDecimal.random();
        expect(r.gte(0) && r.lt(1)).toBe(true);
      } finally {
        if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
      }
      expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    });

    it('precision 0 always gives 0', () => {
      BigintDecimal.setPrecisionGlobal(0);
      for (let i = 0; i < 20; i++) expect(BigintDecimal.random().toString()).toBe("0");
    });

    it('is roughly uniform', () => {
      const buckets = new Array<number>(10).fill(0);
      for (let i = 0; i < 5000; i++) {
        const digit = Number(BigintDecimal.random().times(10).toString().split(".")[0]);
        buckets[digit] = (buckets[digit] ?? 0) + 1;
      }
      for (const count of buckets) expect(count).toBeGreaterThan(380);
    });
  });

  describe('Precision', () => {
    it('follows BigintDecimal.setPrecisionGlobal', () => {
      BigintDecimal.setPrecisionGlobal(5);
      expect(BigintDecimal.PI.toString()).toBe("3.14159");
      expect(BigintDecimal.sqrt(2).toString()).toBe("1.41421");
      expect(BigintDecimal.exp(1).toString()).toBe("2.71828");
      BigintDecimal.setPrecisionGlobal(0);
      expect(BigintDecimal.sqrt(2).toString()).toBe("1");
      expect(BigintDecimal.PI.toString()).toBe("3");
      BigintDecimal.setPrecisionGlobal(200);
      expect(BigintDecimal.PI.toString()).toBe(new BigintDecimal(PI_300).round(200).toString());
    });

    it('results are rounded half away from zero, not truncated', () => {
      BigintDecimal.setPrecisionGlobal(3);
      expect(BigintDecimal.sqrt(2).toString()).toBe("1.414");   // 1.41421...
      expect(BigintDecimal.sqrt(3).toString()).toBe("1.732");   // 1.73205...
      expect(BigintDecimal.exp(1).toString()).toBe("2.718");    // 2.71828...
      expect(BigintDecimal.PI.toString()).toBe("3.142");        // 3.14159...
      expect(BigintDecimal.sqrt("0.0000049").toString()).toBe("0.002"); // 0.0022135...
      expect(BigintDecimal.log("0.5").toString()).toBe("-0.693");      // -0.693147...
      expect(BigintDecimal.sin("-1").toString()).toBe("-0.841");       // -0.841470...
    });

    it('every precision from 0 to 60 agrees with the 60-digit result', () => {
      BigintDecimal.setPrecisionGlobal(60);
      const full = { exp: BigintDecimal.exp("1.7"), log: BigintDecimal.log("3.3"), atan: BigintDecimal.atan("0.4") };
      for (let p = 0; p <= 60; p++) {
        BigintDecimal.setPrecisionGlobal(p);
        expect(BigintDecimal.exp("1.7").toString()).toBe(full.exp.round(p).toString());
        expect(BigintDecimal.log("3.3").toString()).toBe(full.log.round(p).toString());
        expect(BigintDecimal.atan("0.4").toString()).toBe(full.atan.round(p).toString());
      }
    });
  });

  describe('Every precision gives the correctly rounded value', () => {
    const fns: [string, MathFn, string][] = [
      ["sqrt", BigintDecimal.sqrt, "1.7"], ["cbrt", BigintDecimal.cbrt, "-1.7"], ["exp", BigintDecimal.exp, "1.7"],
      ["expm1", BigintDecimal.expm1, "-0.3"], ["log", BigintDecimal.log, "3.3"], ["log10", BigintDecimal.log10, "0.07"],
      ["log2", BigintDecimal.log2, "3.3"], ["log1p", BigintDecimal.log1p, "0.7"], ["sin", BigintDecimal.sin, "1.7"],
      ["cos", BigintDecimal.cos, "1.7"], ["tan", BigintDecimal.tan, "1.2"], ["asin", BigintDecimal.asin, "0.7"],
      ["acos", BigintDecimal.acos, "-0.7"], ["atan", BigintDecimal.atan, "0.4"], ["sinh", BigintDecimal.sinh, "-1.7"],
      ["cosh", BigintDecimal.cosh, "1.7"], ["tanh", BigintDecimal.tanh, "0.7"], ["asinh", BigintDecimal.asinh, "1.7"],
      ["acosh", BigintDecimal.acosh, "1.7"], ["atanh", BigintDecimal.atanh, "0.7"],
    ];
    it.each(fns)('%s at precision 0..60 matches the 80-digit result rounded', (_name, fn, x) => {
      BigintDecimal.setPrecisionGlobal(80);
      const full = fn(x);
      for (let p = 0; p <= 60; p++) {
        BigintDecimal.setPrecisionGlobal(p);
        expect(fn(x).toString()).toBe(full.round(p).toString());
      }
    });
  });

  describe('clearCache', () => {
    it('results are the same before and after clearing the cache', () => {
      for (const precision of [20, 1500]) {
        BigintDecimal.setPrecisionGlobal(precision);
        const before = [BigintDecimal.PI, BigintDecimal.LN10, BigintDecimal.log("7.25"), BigintDecimal.sin("2"), BigintDecimal.pow("1.5", "2.5")];
        BigintDecimal.clearCache();
        const after = [BigintDecimal.PI, BigintDecimal.LN10, BigintDecimal.log("7.25"), BigintDecimal.sin("2"), BigintDecimal.pow("1.5", "2.5")];
        expect(after.map(String)).toEqual(before.map(String));
      }
    });

    it('lower precisions keep working after clearing a high-precision cache', () => {
      BigintDecimal.setPrecisionGlobal(1000);
      BigintDecimal.PI;
      BigintDecimal.clearCache();
      BigintDecimal.setPrecisionGlobal(20);
      expect(BigintDecimal.PI.toString()).toBe("3.14159265358979323846");
      expect(BigintDecimal.log(10).toString()).toBe("2.30258509299404568402");
    });
  });

  describe('Inputs and outputs', () => {
    it('accepts BigintDecimalBase instances', () => {
      expect(BigintDecimal.sqrt(new BigintDecimalBase("2.25")).toString()).toBe("1.5");
      expect(BigintDecimal.max(new BigintDecimalBase("2"), 1).toString()).toBe("2");
    });

    it('accepts strings, numbers, bigints and BigintDecimal', () => {
      expect(BigintDecimal.sqrt("16").toString()).toBe("4");
      expect(BigintDecimal.sqrt(16).toString()).toBe("4");
      expect(BigintDecimal.sqrt(16n).toString()).toBe("4");
      expect(BigintDecimal.sqrt(new BigintDecimal("16")).toString()).toBe("4");
      expect(BigintDecimal.sqrt("1.6e1").toString()).toBe("4");
      expect(BigintDecimal.sqrt(" 16 ").toString()).toBe("4");
      expect(BigintDecimal.sqrt("+16").toString()).toBe("4");
    });

    it('every function returns a BigintDecimal', () => {
      const unary: MathFn[] = [
        BigintDecimal.abs, BigintDecimal.acos, BigintDecimal.asin, BigintDecimal.asinh, BigintDecimal.atan, BigintDecimal.atanh,
        BigintDecimal.cbrt, BigintDecimal.ceil, BigintDecimal.cos, BigintDecimal.cosh, BigintDecimal.exp, BigintDecimal.expm1,
        BigintDecimal.floor, BigintDecimal.log, BigintDecimal.log10, BigintDecimal.log1p, BigintDecimal.log2, BigintDecimal.round,
        BigintDecimal.sign, BigintDecimal.sin, BigintDecimal.sinh, BigintDecimal.sqrt, BigintDecimal.tan, BigintDecimal.tanh,
        BigintDecimal.trunc,
      ];
      for (const fn of unary) expect(fn("0.5")).toBeInstanceOf(BigintDecimal);
      const binary: MathFn[] = [BigintDecimal.atan2, BigintDecimal.pow, BigintDecimal.max, BigintDecimal.min, BigintDecimal.hypot];
      for (const fn of binary) expect(fn("2", "3")).toBeInstanceOf(BigintDecimal);
      expect(BigintDecimal.acosh("1.5")).toBeInstanceOf(BigintDecimal);
      expect(BigintDecimal.asinh("-2")).toBeInstanceOf(BigintDecimal);
      expect(BigintDecimal.sumPrecise(["1"])).toBeInstanceOf(BigintDecimal);
      expect(BigintDecimal.random()).toBeInstanceOf(BigintDecimal);
      for (const name of CONSTANT_NAMES) expect(BigintDecimal[name]).toBeInstanceOf(BigintDecimal);
    });

    it('works when detached from the class, like Math.sqrt', () => {
      expect(["4", "2.25", 0].map(BigintDecimal.sqrt).map(String)).toEqual(["2", "1.5", "0"]);
      const { floor, max } = BigintDecimal;
      expect(floor("-1.5").toString()).toBe("-2");
      expect(max(1, 2).toString()).toBe("2");
    });

    it('does not change its arguments', () => {
      const x = new BigintDecimal("-2.5");
      BigintDecimal.abs(x);
      BigintDecimal.sqrt(BigintDecimal.abs(x));
      BigintDecimal.floor(x);
      BigintDecimal.pow(x, 3);
      expect(x.toString()).toBe("-2.5");
    });

    it('gives the same result on repeated calls (constant caches)', () => {
      BigintDecimal.setPrecisionGlobal(100);
      const first = BigintDecimal.sin("2.5").toString();
      BigintDecimal.setPrecisionGlobal(10);
      BigintDecimal.sin("2.5");
      BigintDecimal.setPrecisionGlobal(100);
      expect(BigintDecimal.sin("2.5").toString()).toBe(first);
    });
  });

  describe('Throws RangeError where JS Math returns NaN or Infinity', () => {
    // each case also checks the message, so an error thrown by accident deeper in the code does not count
    const cases: [string, () => BigintDecimal, string][] = [
      ["sqrt(-1)", () => BigintDecimal.sqrt("-1"), "sqrt: argument must be >= 0"],
      ["sqrt(-1e-21)", () => BigintDecimal.sqrt("-0.000000000000000000001"), "sqrt: argument must be >= 0"],
      ["log(0)", () => BigintDecimal.log("0"), "log: argument is out of range"],
      ["log(-5)", () => BigintDecimal.log("-5"), "log: argument is out of range"],
      ["log10(0)", () => BigintDecimal.log10("0"), "log10: argument is out of range"],
      ["log2(-1)", () => BigintDecimal.log2("-1"), "log2: argument is out of range"],
      ["log1p(-1)", () => BigintDecimal.log1p("-1"), "log1p: argument is out of range"],
      ["log1p(-2)", () => BigintDecimal.log1p("-2"), "log1p: argument is out of range"],
      ["asin(1 + 1e-21)", () => BigintDecimal.asin("1.000000000000000000001"), "asin/acos: argument must be between -1 and 1"],
      ["acos(-2)", () => BigintDecimal.acos("-2"), "asin/acos: argument must be between -1 and 1"],
      ["acosh(1 - 1e-21)", () => BigintDecimal.acosh("0.999999999999999999999"), "acosh: argument must be >= 1"],
      ["atanh(1)", () => BigintDecimal.atanh("1"), "atanh: argument must be between -1 and 1"],
      ["atanh(-1)", () => BigintDecimal.atanh("-1"), "atanh: argument must be between -1 and 1"],
      ["pow(-2, 0.5)", () => BigintDecimal.pow("-2", "0.5"), "pow: negative base with a non-integer exponent"],
      ["pow(0, -1)", () => BigintDecimal.pow("0", "-1"), "pow: 0 to a negative power"],
      ["max()", () => BigintDecimal.max(), "max: needs at least one argument"],
      ["min()", () => BigintDecimal.min(), "min: needs at least one argument"],
      // results with more digits than any computer can hold
      ["exp(1e400)", () => BigintDecimal.exp("1e400"), "exp: result is too large"],
      ["sinh(1e400)", () => BigintDecimal.sinh("1e400"), "exp: result is too large"],
      ["pow(10.5, 1e400)", () => BigintDecimal.pow("10.5", "1e400"), "pow: result is too large"],
    ];
    it.each(cases)('%s', (_name, fn, message) => {
      expect(fn).toThrow(RangeError);
      expect(fn).toThrow(message);
    });

    it('still throws a normal Error for invalid input', () => {
      expect(() => BigintDecimal.sqrt("abc")).toThrow('is not safe parameter');
      expect(() => BigintDecimal.pow("1", "1.2.3")).toThrow('is not safe parameter');
    });
  });
});
