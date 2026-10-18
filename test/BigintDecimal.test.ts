import { describe, expect, it } from "@jest/globals";
import { inspect } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BigintDecimal } from '../index';
import { BigintDecimalBase } from '../bigintDecimalBase';

describe('BigintDecimal', () => {
  describe('Initialization & Parsing', () => {
    it('should initialize with strings correctly', () => {
      expect(new BigintDecimal("123").toString()).toBe("123");
      expect(new BigintDecimal("-123.45").toString()).toBe("-123.45");
      expect(new BigintDecimal("0.0005").toString()).toBe("0.0005");
      expect(new BigintDecimal("-0.0005").toString()).toBe("-0.0005");
    });

    it('should initialize with numbers and bigints correctly', () => {
      expect(new BigintDecimal(100).toString()).toBe("100");
      expect(new BigintDecimal(-50.5).toString()).toBe("-50.5");
      expect(new BigintDecimal(9007199254740991n).toString()).toBe("9007199254740991");
    });

    it('should initialize from another BigintDecimal', () => {
      const original = new BigintDecimal("42.42");
      const copy = new BigintDecimal(original);
      expect(copy.toString()).toBe("42.42");
    });

    it('should handle scientific notation', () => {
      expect(new BigintDecimal("1e3").toString()).toBe("1000");
      expect(new BigintDecimal("1.5e2").toString()).toBe("150");
      expect(new BigintDecimal("-2.5e-3").toString()).toBe("-0.0025");
    });

    it('should trim unnecessary zeros automatically', () => {
      expect(new BigintDecimal("1.5000").toString()).toBe("1.5");
      expect(new BigintDecimal("10.0").toString()).toBe("10");
      expect(new BigintDecimal("0.00").toString()).toBe("0");
    });

    it('should throw errors on invalid input', () => {
      expect(() => new BigintDecimal("abc")).toThrow('is not safe parameter');
      expect(() => new BigintDecimal("1.2.3")).toThrow('is not safe parameter');
      expect(() => new BigintDecimal("")).toThrow('is not safe parameter');
    });
  });

  describe('Addition (.plus)', () => {
    it('should add numbers correctly solving floating point errors', () => {
      const a = new BigintDecimal("0.1");
      const b = new BigintDecimal("0.2");
      expect(a.plus(b).toString()).toBe("0.3"); // The classic JS problem!
    });

    it('should handle different decimal lengths', () => {
      expect(new BigintDecimal("1.5").plus("2.05").toString()).toBe("3.55");
      expect(new BigintDecimal("100").plus("0.001").toString()).toBe("100.001");
    });

    it('should handle negative addition', () => {
      expect(new BigintDecimal("-5").plus("3").toString()).toBe("-2");
      expect(new BigintDecimal("-1.5").plus("-1.5").toString()).toBe("-3");
    });
  });

  describe('Subtraction (.minus)', () => {
    it('should subtract numbers accurately', () => {
      expect(new BigintDecimal("0.3").minus("0.1").toString()).toBe("0.2");
      expect(new BigintDecimal("5.5").minus("2.25").toString()).toBe("3.25");
    });

    it('should handle crossing zero to negatives', () => {
      expect(new BigintDecimal("10").minus("15").toString()).toBe("-5");
      expect(new BigintDecimal("0").minus("0.5").toString()).toBe("-0.5");
    });
  });

  describe('Multiplication (.times)', () => {
    it('should multiply decimals correctly', () => {
      expect(new BigintDecimal("2.5").times("2").toString()).toBe("5");
      expect(new BigintDecimal("0.1").times("0.1").toString()).toBe("0.01");
      expect(new BigintDecimal("-3").times("4").toString()).toBe("-12");
      expect(new BigintDecimal("-2").times("-2").toString()).toBe("4");
    });
  });

  describe('Division (.div)', () => {
    it('should divide numbers correctly', () => {
      expect(new BigintDecimal("10").div("2").toString()).toBe("5");
      expect(new BigintDecimal("5.5").div("2").toString()).toBe("2.75");
    });

    it('should throw an error on division by zero', () => {
      expect(() => new BigintDecimal("10").div("0")).toThrow("Division by zero");
    });

    it('should respect the precision limit on repeating decimals', () => {
      const result = new BigintDecimal("1").div("3");
      // Default precision is 20, so we expect 20 threes
      expect(result.toString()).toBe("0.33333333333333333333");
    });
  });

  describe('Rounding (.round)', () => {
    it('should round correctly based on decimals', () => {
      expect(new BigintDecimal("1.55").round(1).toString()).toBe("1.6");
      expect(new BigintDecimal("1.54").round(1).toString()).toBe("1.5");
      expect(new BigintDecimal("2.999").round(2).toString()).toBe("3");
    });

    it('should handle rounding to 0 decimals (integers)', () => {
      expect(new BigintDecimal("10.5").round(0).toString()).toBe("11");
      expect(new BigintDecimal("10.4").round(0).toString()).toBe("10");
    });
  });

  describe('Comparisons', () => {
    const a = new BigintDecimal("5.5");
    const b = new BigintDecimal("5.50");
    const c = new BigintDecimal("10");
    const d = new BigintDecimal("-2");

    it('should check equality (.eq)', () => {
      expect(a.eq(b)).toBe(true);
      expect(a.eq(c)).toBe(false);
    });

    it('should check greater than (.gt) and greater than or equal (.gte)', () => {
      expect(c.gt(a)).toBe(true);
      expect(a.gt(c)).toBe(false);
      expect(a.gte(b)).toBe(true); // 5.5 >= 5.5
    });

    it('should check less than (.lt) and less than or equal (.lte)', () => {
      expect(d.lt(a)).toBe(true);
      expect(a.lt(d)).toBe(false);
      expect(a.lte(b)).toBe(true); // 5.5 <= 5.5
    });
  });

  describe('Hard Scenarios: Massive Numbers & Tiny Fractions', () => {
    it('should handle numbers far beyond Number.MAX_SAFE_INTEGER', () => {
      const huge1 = "99999999999999999999999999999999999999999999999999";
      const huge2 = "1";
      expect(new BigintDecimal(huge1).plus(huge2).toString())
        .toBe("100000000000000000000000000000000000000000000000000");
    });

    it('should handle exactly 18 decimal places (Standard Crypto Token)', () => {
      const wei = "0.000000000000000001";
      const multiplier = "1000000000000000000"; // 10^18
      expect(new BigintDecimal(wei).times(multiplier).toString()).toBe("1");
    });

    it('should accurately subtract tiny fractions from large numbers', () => {
      const bigAmount = "1000000";
      const tinyFee = "0.000000000000000001";
      expect(new BigintDecimal(bigAmount).minus(tinyFee).toString())
        .toBe("999999.999999999999999999");
    });
  });
  describe('Hard Scenarios: Precision Limits & Chaining', () => {
    it('should respect custom division precision', () => {
      const a = new BigintDecimal("1");
      const b = new BigintDecimal("3");

      // Default is 20
      expect(a.div(b).toString().length).toBe(22); // "0." + 20 threes

      // Change instance precision
      a.setPrecision(5);
      expect(a.div(b).toString()).toBe("0.33333");

      // Change global precision
      BigintDecimal.setPrecisionGlobal(2);
      const c = new BigintDecimal("1");
      expect(c.div(b).toString()).toBe("0.33");

      // Reset global for other tests
      BigintDecimal.setPrecisionGlobal(20);
    });

    it('should safely chain multiple operations in a row', () => {
      // Formula: ((100 + 50.5) * 2) - 1.1 / 2 = 149.45
      const result = new BigintDecimal("100")
        .plus("50.5")
        .times("2")
        .minus("1.1")
        .div("2");

      expect(result.toString()).toBe("149.95"); // (150.5 * 2 = 301) - 1.1 = 299.9 / 2 = 149.95
    });
  });

  describe('Hard Scenarios: Negatives & Zero Math', () => {
    it('should correctly round exact negative halves away from zero', () => {
      expect(new BigintDecimal("-1.5").round(0).toString()).toBe("-2");
      expect(new BigintDecimal("-2.55").round(1).toString()).toBe("-2.6");
      expect(new BigintDecimal("-0.5").round(0).toString()).toBe("-1");
    });

    it('should handle zero multiplication and division edge cases properly', () => {
      expect(new BigintDecimal("0").times("-100").toString()).toBe("0"); // No "-0" allowed
      expect(new BigintDecimal("-0").plus("0").toString()).toBe("0");
      expect(new BigintDecimal("0").div("5000").toString()).toBe("0");
    });
  });

  describe('Hard Scenarios: Malformed & Ugly Strings', () => {
    it('should handle massive amounts of leading and trailing zeros', () => {
      expect(new BigintDecimal("00000000123.4500000000").toString()).toBe("123.45");
      expect(new BigintDecimal("-000000.000500").toString()).toBe("-0.0005");
    });

    it('should handle numbers starting with just a dot', () => {
      expect(new BigintDecimal(".5").toString()).toBe("0.5");
      expect(new BigintDecimal("-.75").toString()).toBe("-0.75");
    });

    it('should ignore messy whitespace around the number', () => {
      expect(new BigintDecimal("   \n  -42.5 \t  ").toString()).toBe("-42.5");
    });

    it('should correctly process complex scientific notation', () => {
      expect(new BigintDecimal("1.23456789e-10").toString()).toBe("0.000000000123456789");
      expect(new BigintDecimal("9.99e+20").toString()).toBe("999000000000000000000");
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON as a string representation', () => {
      const payload = {
        id: 1,
        balance: new BigintDecimal("1500.55")
      };
      // JSON.stringify automatically calls .toJSON() on the class
      expect(JSON.stringify(payload)).toBe('{"id":1,"balance":"1500.55"}');
    });
  });
});
describe('BigintDecimalBase and subclasses', () => {
  it('arithmetic returns the class it was called on', () => {
    const x = new BigintDecimal("1.5");
    for (const result of [x.plus(1), x.minus(1), x.times(2), x.div(3), x.round(0)]) {
      expect(result).toBeInstanceOf(BigintDecimal);
    }
    // so the result can go straight into the Math functions
    expect(BigintDecimal.sqrt(x.times(6)).toString()).toBe("3");

    const base = new BigintDecimalBase("1.5");
    expect(base.plus(1)).toBeInstanceOf(BigintDecimalBase);
    expect(base.plus(1)).not.toBeInstanceOf(BigintDecimal);
  });

  it('setPrecisionGlobal is shared by the base class and subclasses', () => {
    BigintDecimal.setPrecisionGlobal(3);
    expect(new BigintDecimalBase(1).div(3).toString()).toBe("0.333");
    expect(new BigintDecimal(1).div(3).toString()).toBe("0.333");
    expect(BigintDecimal.sqrt(2).toString()).toBe("1.414");

    BigintDecimalBase.setPrecisionGlobal(5);
    expect(new BigintDecimal(1).div(3).toString()).toBe("0.33333");
    expect(BigintDecimal.sqrt(2).toString()).toBe("1.41421");

    BigintDecimal.setPrecisionGlobal(20);
  });

  it('parses huge strings exactly and quickly', () => {
    const digits = "1234567891".repeat(20000); // 200,000 digits, no trailing zero to trim
    const start = performance.now();
    const x = new BigintDecimal(`-${digits}.${digits}`);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(x.toString()).toBe(`-${digits}.${digits}`);
    expect(new BigintDecimal(`${digits}e-100000`).toString()).toBe(`${digits.slice(0, -100000)}.${digits.slice(-100000)}`.replace(/0+$/, ""));
  });

  it('integer inputs take the fast path with the same results', () => {
    expect(new BigintDecimal(123456789012345678901234567890n).toString()).toBe("123456789012345678901234567890");
    expect(new BigintDecimal(-42).toString()).toBe("-42");
    expect(new BigintDecimal(-0).toString()).toBe("0");
    expect(new BigintDecimal(Number.MAX_SAFE_INTEGER).toString()).toBe("9007199254740991");
    // unsafe numbers still use their shortest decimal form, as before
    expect(new BigintDecimal(1e23).toString()).toBe("100000000000000000000000");
    expect(new BigintDecimal(0.1 + 0.2).toString()).toBe("0.30000000000000004");
  });
});

describe('Input validation: every accepted and rejected form', () => {
  const accepted: [input: string | number | bigint, expected: string][] = [
    ["0", "0"], ["-0", "0"], ["+0", "0"], ["007", "7"], ["00012.3400", "12.34"],
    [".5", "0.5"], ["-.5", "-0.5"], ["+.5", "0.5"], ["5.", "5"], ["-5.", "-5"],
    ["1e3", "1000"], ["1E3", "1000"], ["1e+3", "1000"], ["1e-3", "0.001"], ["1e0", "1"], ["1e-0", "1"], ["1e+05", "100000"],
    ["1.5e2", "150"], ["-2.5e-3", "-0.0025"], [".5e1", "5"], ["5.e1", "50"], ["0e10", "0"], ["-0.0e-0", "0"],
    ["123e-5", "0.00123"], ["1e-30", "0.000000000000000000000000000001"],
    [" 12 ", "12"], ["\t7\n", "7"],
    [0, "0"], [-0, "0"], [42, "42"], [-12.5, "-12.5"], [1e21, "1000000000000000000000"], [1e-7, "0.0000001"],
    [0n, "0"], [-5n, "-5"], [10n ** 30n, "1000000000000000000000000000000"],
  ];
  it.each(accepted)('accepts %p as %s', (input, expected) => {
    expect(new BigintDecimal(input).toString()).toBe(expected);
  });

  const rejected: (string | number)[] = [
    "", " ", "-", "+", ".", "-.", "+.", "e", "e5", "-e5", ".e1", "1e", "1e-", "1e+", "1E",
    "1.2.3", "1..2", "1e5e5", "1e5.5", "1e.5", "--1", "+-1", "-+1", "1-", "1+1", "1 2", "1_000", "0x10", "abc", "1a", "a1",
    "Infinity", "-Infinity", "NaN", NaN, Infinity, -Infinity,
  ];
  it.each(rejected)('rejects %p', (input) => {
    expect(() => new BigintDecimal(input)).toThrow('is not safe parameter');
  });

  it('defaults to zero', () => {
    expect(new BigintDecimal().toString()).toBe("0");
    expect(new BigintDecimalBase().toString()).toBe("0");
  });

  it('shows as a plain number in console.log / util.inspect', () => {
    expect(inspect(new BigintDecimal("-12.50"))).toBe("-12.5");
    expect(inspect({ amount: new BigintDecimal("0.1") })).toBe("{ amount: 0.1 }");
  });

  it('copies another instance without sharing state', () => {
    const original = new BigintDecimal("1.25");
    const copy = new BigintDecimal(original);
    expect(copy).not.toBe(original);
    expect(copy.eq(original)).toBe(true);
    expect(new BigintDecimal(new BigintDecimalBase("3.5")).toString()).toBe("3.5");
  });
});

describe('Arithmetic conditions', () => {
  it('signs and zero in every combination', () => {
    const values = ["-2.5", "-1", "0", "1", "2.5"];
    for (const a of values) for (const b of values) {
      const x = Number(a), y = Number(b);
      expect(Number(new BigintDecimal(a).plus(b).toString())).toBe(x + y);
      expect(Number(new BigintDecimal(a).minus(b).toString())).toBe(x - y);
      expect(Number(new BigintDecimal(a).times(b).toString())).toBe(x * y === 0 ? 0 : x * y);
      if (y !== 0) expect(Number(new BigintDecimal(a).div(b).toString())).toBe(x / y === 0 ? 0 : x / y);
      expect(new BigintDecimal(a).gt(b)).toBe(x > y);
      expect(new BigintDecimal(a).eq(b)).toBe(x === y);
    }
  });

  it('results are trimmed and never "-0"', () => {
    expect(new BigintDecimal("1.10").plus("0.90").toString()).toBe("2");
    expect(new BigintDecimal("-0.5").plus("0.5").toString()).toBe("0");
    expect(new BigintDecimal("-0.001").round(2).toString()).toBe("0");
    expect(new BigintDecimal("-1").times(0).toString()).toBe("0");
    expect(new BigintDecimal("0").div("-3").toString()).toBe("0");
  });

  it('round() handles every position and sign', () => {
    expect(new BigintDecimal("1.005").round(2).toString()).toBe("1.01");
    expect(new BigintDecimal("-1.005").round(2).toString()).toBe("-1.01");
    expect(new BigintDecimal("1.004999").round(2).toString()).toBe("1");
    expect(new BigintDecimal("9.995").round(2).toString()).toBe("10");
    expect(new BigintDecimal("0.5").round(0).toString()).toBe("1");
    expect(new BigintDecimal("-0.5").round(0).toString()).toBe("-1");
    expect(new BigintDecimal("1.5").round(5).toString()).toBe("1.5");
    expect(new BigintDecimal("12").round(0).toString()).toBe("12");
  });

  it('div by zero in every form throws', () => {
    for (const zero of [0, "0", "0.000", 0n, "-0", new BigintDecimal(0)]) {
      expect(() => new BigintDecimal(1).div(zero)).toThrow("Division by zero");
    }
  });

  it('div with more decimals than the precision', () => {
    expect(new BigintDecimal("0.000000000000000000000000001").div("1").toString()).toBe("0");
    expect(new BigintDecimal("1").div("0.000000000000000000000000001").toString()).toBe("1000000000000000000000000000");
  });

  it('instance precision overrides the global precision for div', () => {
    const x = new BigintDecimal(2);
    x.setPrecision(4);
    expect(x.div(3).toString()).toBe("0.6666");
    expect(new BigintDecimal(2).div(3).toString()).toBe("0.66666666666666666666");
  });

  it('serializes to JSON as a string', () => {
    expect(JSON.stringify([new BigintDecimal("-0.10"), new BigintDecimal(5n)])).toBe('["-0.1","5"]');
  });
});

describe('Precision and decimal-place arguments are validated', () => {
  const invalid = [-1, 2.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1];

  it.each(invalid)('setPrecisionGlobal(%p) throws and keeps the old setting', (value) => {
    BigintDecimal.setPrecisionGlobal(7);
    expect(() => BigintDecimal.setPrecisionGlobal(value)).toThrow(RangeError);
    expect(BigintDecimalBase.precision).toBe(7);
    expect(new BigintDecimal(1).div(3).toString()).toBe("0.3333333");
    BigintDecimal.setPrecisionGlobal(20);
  });

  it.each(invalid)('setPrecision(%p) throws and keeps the old setting', (value) => {
    const x = new BigintDecimal(1);
    x.setPrecision(4);
    expect(() => x.setPrecision(value)).toThrow(RangeError);
    expect(x.div(3).toString()).toBe("0.3333");
  });

  it.each(invalid)('round(%p) throws', (value) => {
    expect(() => new BigintDecimal("123.456").round(value)).toThrow(RangeError);
  });

  it('accepts 0 and large whole numbers', () => {
    BigintDecimal.setPrecisionGlobal(0);
    expect(new BigintDecimal(7).div(2).toString()).toBe("3");
    BigintDecimal.setPrecisionGlobal(500);
    expect(new BigintDecimal(1).div(3).toString()).toBe("0." + "3".repeat(500));
    BigintDecimal.setPrecisionGlobal(20);
    expect(new BigintDecimal("123.456").round(0).toString()).toBe("123");
  });
});

describe('Package build', () => {
  it('relative imports end in ".js" (Node\'s ESM loader needs the extension)', () => {
    // compiled tests run from dist/test/test, the sources are three levels up
    for (const file of ["index.ts", "bigintDecimalBase.ts"]) {
      const source = readFileSync(join(__dirname, "..", "..", "..", file), "utf8");
      const relativeImports = [...source.matchAll(/from\s+["'](\.[^"']*)["']/g)].map((match) => match[1] ?? "");
      for (const path of relativeImports) expect(path.endsWith(".js")).toBe(true);
    }
  });
});
