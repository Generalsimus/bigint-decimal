// ".js" is required for the ESM build: Node's ESM loader needs the file extension
import { BigintDecimalBase } from "./bigintDecimalBase.js";

type DecimalInput = NonNullable<ConstructorParameters<typeof BigintDecimalBase>[0]>;

// A number split into its parts: `v * 10^-d` (v: all digits as bigint, d: digits after the dot).
interface Parts { v: bigint; d: number }

/**
 * BigintDecimal with the JS `Math` object's members as statics
 * (except fround, f16round, clz32 and imul, which only make sense for JS floats and 32-bit integers).
 * Functions take the same values as the constructor and return BigintDecimal,
 * computed to `BigintDecimal.precision` decimal places.
 * Where JS Math would return NaN or ±Infinity, they throw a RangeError.
 */
export class BigintDecimal extends BigintDecimalBase {

    constructor(...args: ConstructorParameters<typeof BigintDecimalBase>) {
        super(...args)
    }

    // ---------------------------------------------------------------- constants

    /** Euler's number, e ≈ 2.718 */
    static get E(): BigintDecimal { return BigintDecimal.exp(1); }
    /** Natural logarithm of 10 ≈ 2.303 */
    static get LN10(): BigintDecimal { return BigintDecimal.compute((w) => BigintDecimal.ln10Fixed(w)); }
    /** Natural logarithm of 2 ≈ 0.693 */
    static get LN2(): BigintDecimal { return BigintDecimal.compute((w) => BigintDecimal.ln2Fixed(w)); }
    /** Base-10 logarithm of e ≈ 0.434 */
    static get LOG10E(): BigintDecimal { return BigintDecimal.compute((w) => BigintDecimal.one(2 * w) / BigintDecimal.ln10Fixed(w)); }
    /** Base-2 logarithm of e ≈ 1.443 */
    static get LOG2E(): BigintDecimal { return BigintDecimal.compute((w) => BigintDecimal.one(2 * w) / BigintDecimal.ln2Fixed(w)); }
    /** Ratio of a circle's circumference to its diameter ≈ 3.14159 */
    static get PI(): BigintDecimal { return BigintDecimal.compute((w) => BigintDecimal.piFixed(w)); }
    /** Square root of 1/2 ≈ 0.707 */
    static get SQRT1_2(): BigintDecimal { return BigintDecimal.sqrt("0.5"); }
    /** Square root of 2 ≈ 1.414 */
    static get SQRT2(): BigintDecimal { return BigintDecimal.sqrt(2); }

    // ---------------------------------------------------------------- rounding & sign

    /** Absolute value */
    static abs(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.fromParts(BigintDecimal.absBig(p.v), p.d);
    }

    /** -1, 0 or 1, depending on the sign of x */
    static sign(x: DecimalInput): BigintDecimal {
        const v = BigintDecimal.parts(x).v;
        return new BigintDecimal(v > 0n ? 1 : v < 0n ? -1 : 0);
    }

    /** Integer part of x (removes the fractional digits) */
    static trunc(x: DecimalInput): BigintDecimal {
        return new BigintDecimal(BigintDecimal.integerPart(BigintDecimal.parts(x)));
    }

    /** Largest integer less than or equal to x */
    static floor(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return new BigintDecimal(BigintDecimal.floorDiv(p.v, BigintDecimal.pow10(p.d)));
    }

    /** Smallest integer greater than or equal to x */
    static ceil(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return new BigintDecimal(-BigintDecimal.floorDiv(-p.v, BigintDecimal.pow10(p.d)));
    }

    /** Rounds to the nearest integer; halves go up (toward +Infinity), like Math.round */
    static round(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        const scale = BigintDecimal.pow10(p.d);
        return new BigintDecimal(BigintDecimal.floorDiv(2n * p.v + scale, 2n * scale));
    }

    // ---------------------------------------------------------------- aggregates

    /** Largest of the arguments (at least one is required) */
    static max(...values: DecimalInput[]): BigintDecimal {
        return BigintDecimal.pick(values, "max", (best, next) => next.gt(best));
    }

    /** Smallest of the arguments (at least one is required) */
    static min(...values: DecimalInput[]): BigintDecimal {
        return BigintDecimal.pick(values, "min", (best, next) => next.lt(best));
    }

    /** Exact sum of all values in an iterable */
    static sumPrecise(values: Iterable<DecimalInput>): BigintDecimal {
        let sum = new BigintDecimal(0);
        for (const value of values) sum = sum.plus(value);
        return sum;
    }

    /** Square root of the sum of squares of the arguments */
    static hypot(...values: DecimalInput[]): BigintDecimal {
        let sum = new BigintDecimal(0);
        for (const value of values) sum = sum.plus(new BigintDecimal(value).times(value));
        return BigintDecimal.sqrt(sum);
    }

    // ---------------------------------------------------------------- powers & roots

    /** Square root. Argument must be >= 0. Always correctly rounded. */
    static sqrt(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        if (p.v < 0n) throw new RangeError("sqrt: argument must be >= 0 (NaN)");
        // Computed in decimal: r = floor(sqrt(x) * 10^P), then
        // sqrt(x) >= r + 1/2 (in units of 10^-P)  <=>  floor(4x * 10^2P) >= (2r + 1)^2, exactly.
        const P = BigintDecimal.precision;
        const r = BigintDecimal.isqrt(BigintDecimal.floorScale(p.v, p.d, 2 * P));
        const roundUp = BigintDecimal.floorScale(4n * p.v, p.d, 2 * P) >= (2n * r + 1n) ** 2n;
        return BigintDecimal.fromParts(roundUp ? r + 1n : r, P);
    }

    /** Cube root. Always correctly rounded. */
    static cbrt(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        const v = BigintDecimal.absBig(p.v);
        // Same as sqrt: r = floor(cbrt(|x|) * 10^P), rounded up when floor(8|x| * 10^3P) >= (2r + 1)^3
        const P = BigintDecimal.precision;
        const r = BigintDecimal.icbrt(BigintDecimal.floorScale(v, p.d, 3 * P));
        const rounded = BigintDecimal.floorScale(8n * v, p.d, 3 * P) >= (2n * r + 1n) ** 3n ? r + 1n : r;
        return BigintDecimal.fromParts(p.v < 0n ? -rounded : rounded, P);
    }

    /** base raised to the power of exponent. Integer powers are exact where the result stays reasonably sized. */
    static pow(base: DecimalInput, exponent: DecimalInput): BigintDecimal {
        const x = BigintDecimal.parts(base), y = BigintDecimal.parts(exponent);

        if (y.v === 0n) return new BigintDecimal(1);
        if (x.v === 0n) {
            if (y.v > 0n) return new BigintDecimal(0);
            throw new RangeError("pow: 0 to a negative power is Infinity");
        }

        if (y.d === 0) {
            // Integer exponent: exact power, unless the base's decimals would multiply into far more
            // digits than the rounded result keeps (e.g. 1.0001^1e9); then e^(y * ln x) is much cheaper.
            const n = BigintDecimal.absBig(y.v);
            if (x.d === 0 || BigInt(x.d) * n <= BigInt(4 * BigintDecimal.precision + 100)) {
                const v = x.v ** n;
                const d = x.d * Number(n);
                return y.v > 0n
                    ? BigintDecimal.roundDecimal(v, d)
                    : BigintDecimal.compute((w) => (BigintDecimal.pow10(d) << BigInt(w)) / v);
            }
        } else if (x.v < 0n) {
            throw new RangeError("pow: negative base with a non-integer exponent is NaN");
        }

        // x^y = e^(y * ln|x|). The result's integer bits need extra working precision,
        // estimated from a cheap low-precision ln|x|.
        const absX = { v: BigintDecimal.absBig(x.v), d: x.d };
        const roughLnX = Number(BigintDecimal.lnFixed(absX.v, 0, absX.d, 64)) / 2 ** 64;
        const magnitude = Math.max(0, Math.ceil(Number(new BigintDecimal(exponent).toString()) * roughLnX * Math.LOG2E)) + 1;
        if (!Number.isFinite(magnitude)) throw new RangeError("pow: result is too large to represent");
        const negative = x.v < 0n && (y.v & 1n) === 1n;

        return BigintDecimal.compute((w) => {
            // ln|x| is multiplied by y, so it needs y's integer bits as extra precision too
            const ww = w + BigintDecimal.GUARD_BITS + magnitude + BigintDecimal.bitLength(BigintDecimal.integerPart(y));
            const t = (BigintDecimal.toFixed(y, ww) * BigintDecimal.lnFixed(absX.v, 0, absX.d, ww)) >> BigInt(ww);
            const r = BigintDecimal.expFixed(t, ww, w);
            return negative ? -r : r;
        });
    }

    // ---------------------------------------------------------------- exponentials & logarithms

    /** e raised to the power of x */
    static exp(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => BigintDecimal.expParts(p, w));
    }

    /** e^x - 1 */
    static expm1(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => BigintDecimal.expParts(p, w) - BigintDecimal.one(w));
    }

    /** Natural logarithm (base e). Argument must be > 0. */
    static log(x: DecimalInput): BigintDecimal {
        return BigintDecimal.logBase(x, "log");
    }

    /** Base-10 logarithm. Argument must be > 0. */
    static log10(x: DecimalInput): BigintDecimal {
        return BigintDecimal.logBase(x, "log10", (w) => BigintDecimal.ln10Fixed(w));
    }

    /** Base-2 logarithm. Argument must be > 0. */
    static log2(x: DecimalInput): BigintDecimal {
        return BigintDecimal.logBase(x, "log2", (w) => BigintDecimal.ln2Fixed(w));
    }

    /** Natural logarithm of 1 + x. Argument must be > -1. */
    static log1p(x: DecimalInput): BigintDecimal {
        return BigintDecimal.logBase(new BigintDecimal(x).plus(1), "log1p");
    }

    // ---------------------------------------------------------------- trigonometry (radians)

    /** Sine */
    static sin(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => BigintDecimal.sinCosParts(p, w)[0]);
    }

    /** Cosine */
    static cos(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => BigintDecimal.sinCosParts(p, w)[1]);
    }

    /** Tangent */
    static tan(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => {
            // Near the poles cos(x) is tiny and sin / cos multiplies its error by 1 / cos^2,
            // so the working precision grows until cos has enough correct bits.
            // cos is never exactly 0 for a decimal x (pi is irrational), so this ends.
            let ww = w + BigintDecimal.GUARD_BITS;
            while (true) {
                const [sin, cos] = BigintDecimal.sinCosParts(p, ww);
                const needed = w + 2 * (ww - BigintDecimal.bitLength(cos)) + BigintDecimal.GUARD_BITS;
                if (cos !== 0n && ww >= needed) return ((sin << BigInt(ww)) / cos) >> BigInt(ww - w);
                ww = cos === 0n ? 2 * ww : needed;
            }
        });
    }

    /** Arcsine. Argument must be in [-1, 1]. */
    static asin(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => BigintDecimal.asinFixed(p, w));
    }

    /** Arccosine. Argument must be in [-1, 1]. */
    static acos(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => (BigintDecimal.piFixed(w) >> 1n) - BigintDecimal.asinFixed(p, w));
    }

    /** Arctangent */
    static atan(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => BigintDecimal.atanFixed(BigintDecimal.toFixed(p, w), w));
    }

    /** Angle between the positive x-axis and the point (x, y). Note the order: (y, x). */
    static atan2(y: DecimalInput, x: DecimalInput): BigintDecimal {
        const yp = BigintDecimal.parts(y), xp = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => {
            const pi = BigintDecimal.piFixed(w);
            if (xp.v === 0n) return yp.v > 0n ? pi >> 1n : yp.v < 0n ? -(pi >> 1n) : 0n;
            // y / x computed exactly from the parts
            const ratio = ((yp.v * BigintDecimal.pow10(xp.d)) << BigInt(w)) / (xp.v * BigintDecimal.pow10(yp.d));
            const a = BigintDecimal.atanFixed(ratio, w);
            if (xp.v > 0n) return a;
            return yp.v >= 0n ? a + pi : a - pi;
        });
    }

    // ---------------------------------------------------------------- hyperbolic

    /** Hyperbolic sine */
    static sinh(x: DecimalInput): BigintDecimal {
        return BigintDecimal.expPair(x, (ePos, eNeg) => (ePos - eNeg) >> 1n);
    }

    /** Hyperbolic cosine */
    static cosh(x: DecimalInput): BigintDecimal {
        return BigintDecimal.expPair(x, (ePos, eNeg) => (ePos + eNeg) >> 1n);
    }

    /** Hyperbolic tangent */
    static tanh(x: DecimalInput): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) => {
            // tanh|x| = (1 - e^(-2|x|)) / (1 + e^(-2|x|)), which never builds huge numbers
            const one = BigintDecimal.one(w);
            const t = BigintDecimal.expParts({ v: -2n * BigintDecimal.absBig(p.v), d: p.d }, w);
            const r = ((one - t) << BigInt(w)) / (one + t);
            return p.v < 0n ? -r : r;
        });
    }

    /** Hyperbolic arcsine */
    static asinh(x: DecimalInput): BigintDecimal {
        const value = new BigintDecimal(x);
        // asinh(-x) = -asinh(x)
        return BigintDecimal.lnPlusRoot(BigintDecimal.abs(value), 1, value.lt(0));
    }

    /** Hyperbolic arccosine. Argument must be >= 1. */
    static acosh(x: DecimalInput): BigintDecimal {
        const value = new BigintDecimal(x);
        if (value.lt(1)) throw new RangeError("acosh: argument must be >= 1 (NaN)");
        return BigintDecimal.lnPlusRoot(value, -1);
    }

    /** Hyperbolic arctangent. Argument must be in (-1, 1). */
    static atanh(x: DecimalInput): BigintDecimal {
        const value = new BigintDecimal(x);
        if (value.gte(1) || value.lte(-1)) throw new RangeError("atanh: argument must be between -1 and 1 (exclusive)");
        // (ln(1 + x) - ln(1 - x)) / 2, both arguments exact
        const plus = BigintDecimal.parts(value.plus(1));
        const minus = BigintDecimal.parts(new BigintDecimal(1).minus(value));
        return BigintDecimal.compute((w) =>
            (BigintDecimal.lnFixed(plus.v, 0, plus.d, w) - BigintDecimal.lnFixed(minus.v, 0, minus.d, w)) >> 1n);
    }

    // ---------------------------------------------------------------- random

    /** Random number in [0, 1) with `BigintDecimal.precision` decimal digits */
    static random(): BigintDecimal {
        const p = BigintDecimal.precision;
        const limit = BigintDecimal.pow10(p);
        // 8 extra bytes make the modulo bias negligible
        const bytes = new Uint8Array(Math.ceil(BigintDecimal.bitLength(limit) / 8) + 8);
        if (typeof globalThis.crypto?.getRandomValues === "function") {
            globalThis.crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        let r = 0n;
        for (const byte of bytes) r = (r << 8n) | BigInt(byte);
        return BigintDecimal.fromParts(r % limit, p);
    }

    // ---------------------------------------------------------------- cache

    /**
     * Frees the cached constants (pi, ln2, ln10, the log table) and powers of ten.
     * They are kept at the highest precision used so far and rebuilt on demand, so this is only
     * useful to give memory back after very high precision work. Results do not change.
     */
    static clearCache(): void {
        BigintDecimal.constants.clear();
        BigintDecimal.pow10Cache.length = 0;
    }

    // =========================================================================
    // Private helpers.
    // The algorithms work on binary fixed-point bigints: an integer meaning `value / 2^w`.
    // A binary scale turns every rescaling into a cheap bit shift instead of a big division.
    // `compute` runs them with GUARD_BITS extra bits, then rounds to `BigintDecimal.precision` decimals.
    // Helpers are called through the class name, not `this`, so detached calls
    // like `values.map(BigintDecimal.sqrt)` keep working, as they do with Math.
    // =========================================================================

    // Extra working bits (~12 decimal digits) that absorb rounding errors
    private static readonly GUARD_BITS = 40;
    // Measured crossovers (working scale in bits) where the asymptotically faster algorithm starts to win:
    // atan by Newton's method instead of its series (~1500 digits)
    private static readonly ATAN_NEWTON_BITS = 5000;
    // series by rectangular splitting instead of term by term (~410 digits)
    private static readonly RECTANGULAR_BITS = 1400;
    // constants by binary splitting instead of small-integer series (~1200 digits)
    private static readonly BINARY_SPLIT_BITS = 4000;
    // Cached constants (pi, ln2, ln10 and the ln(1 + j/256) table) at the highest scale computed so far
    private static readonly constants = new Map<string, { scale: number; value: bigint }>();
    private static readonly POW10_CACHE_SIZE = 1024;
    private static readonly pow10Cache: (bigint | undefined)[] = [];

    // ---------------------------------------------------------------- conversion

    private static compute(fn: (w: number) => bigint): BigintDecimal {
        const w = Math.ceil(BigintDecimal.precision * Math.log2(10)) + BigintDecimal.GUARD_BITS;
        const p = BigintDecimal.precision;
        // fixed value / 2^w -> decimal digits, rounded half away from zero
        const v = fn(w);
        const rounded = ((BigintDecimal.absBig(v) * BigintDecimal.pow10(p)) + BigintDecimal.one(w - 1)) >> BigInt(w);
        return BigintDecimal.fromParts(v < 0n ? -rounded : rounded, p);
    }

    // v * 10^-d -> BigintDecimal rounded half away from zero to the current precision
    private static roundDecimal(v: bigint, d: number): BigintDecimal {
        const p = BigintDecimal.precision;
        if (d <= p) return BigintDecimal.fromParts(v, d);
        const unit = BigintDecimal.pow10(d - p);
        const half = unit / 2n;
        return BigintDecimal.fromParts(v >= 0n ? (v + half) / unit : (v - half) / unit, p);
    }

    private static parts(x: DecimalInput): Parts {
        const n = x instanceof BigintDecimal ? x : new BigintDecimal(x);
        return { v: n.value, d: n.decimals };
    }

    // v * 10^-d -> BigintDecimal, without going through a string
    private static fromParts(v: bigint, d: number): BigintDecimal {
        const result = new BigintDecimal(v);
        result.decimals = d;
        return result.trim();
    }

    // v * 10^-d -> floor(v * 10^(to - d)) for v >= 0, i.e. the value as an integer count of 10^-to
    private static floorScale(v: bigint, d: number, to: number): bigint {
        return to >= d ? v * BigintDecimal.pow10(to - d) : v / BigintDecimal.pow10(d - to);
    }

    // Decimal parts -> binary fixed point at scale w (truncated toward zero)
    private static toFixed(x: Parts, w: number): bigint {
        const shifted = x.v << BigInt(w);
        return x.d === 0 ? shifted : shifted / BigintDecimal.pow10(x.d);
    }

    // Integer part, truncated toward zero
    private static integerPart(x: Parts): bigint {
        return x.v / BigintDecimal.pow10(x.d);
    }

    // ---------------------------------------------------------------- bigint basics

    // 1 at binary scale w, i.e. 2^w
    private static one(w: number): bigint {
        return 1n << BigInt(w);
    }

    // Moves a fixed value from binary scale `from` to scale `to`
    private static shift(v: bigint, from: number, to: number): bigint {
        return to >= from ? v << BigInt(to - from) : v >> BigInt(from - to);
    }

    // 10^n, cached for the small exponents every call uses (precision, decimals)
    private static pow10(n: number): bigint {
        if (n >= BigintDecimal.POW10_CACHE_SIZE) return 10n ** BigInt(n);
        let cached = BigintDecimal.pow10Cache[n];
        if (cached === undefined) {
            cached = 10n ** BigInt(n);
            BigintDecimal.pow10Cache[n] = cached;
        }
        return cached;
    }

    private static absBig(n: bigint): bigint {
        return n < 0n ? -n : n;
    }

    private static bitLength(n: bigint): number {
        if (n === 0n) return 0;
        const hex = BigintDecimal.absBig(n).toString(16);
        // 4 bits per hex digit, minus the unused high bits of the first digit
        return hex.length * 4 - (Math.clz32(parseInt(hex.charAt(0), 16)) - 28);
    }

    private static floorDiv(a: bigint, b: bigint): bigint {
        const q = a / b;
        return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q;
    }

    // floor(sqrt(n)), Newton's method.
    // Starts from a float estimate of the top bits (already ~50 bits correct, and never below the root),
    // so only one or two Newton steps are needed.
    private static isqrt(n: bigint): bigint {
        if (n < 2n) return n;
        const s = Math.max(0, BigintDecimal.bitLength(n) - 100) & ~1; // even, so the root shifts by s / 2
        let x = (BigInt(Math.ceil(Math.sqrt(Number(n >> BigInt(s))))) + 1n) << BigInt(s >> 1);
        while (true) {
            const y = (x + n / x) >> 1n;
            if (y >= x) return x;
            x = y;
        }
    }

    // floor(cbrt(n)), Newton's method, seeded like isqrt
    private static icbrt(n: bigint): bigint {
        if (n < 2n) return n;
        const s = Math.floor(Math.max(0, BigintDecimal.bitLength(n) - 150) / 3) * 3; // multiple of 3
        let x = (BigInt(Math.ceil(Math.cbrt(Number(n >> BigInt(s))))) + 1n) << BigInt(s / 3);
        while (true) {
            const y = (2n * x + n / (x * x)) / 3n;
            if (y >= x) return x;
            x = y;
        }
    }

    // ---------------------------------------------------------------- shared by public functions

    private static pick(values: DecimalInput[], name: string, isBetter: (best: BigintDecimal, next: BigintDecimal) => boolean): BigintDecimal {
        const [first, ...rest] = values;
        if (first === undefined) throw new RangeError(`${name}: needs at least one argument`);
        let best = new BigintDecimal(first);
        for (const value of rest) {
            const next = new BigintDecimal(value);
            if (isBetter(best, next)) best = next;
        }
        return best;
    }

    // ln(x), or ln(x) / ln(base) when `lnBase` is given
    private static logBase(x: DecimalInput, name: string, lnBase?: (w: number) => bigint): BigintDecimal {
        const p = BigintDecimal.parts(x);
        if (p.v <= 0n) throw new RangeError(`${name}: argument is out of range`);
        return BigintDecimal.compute((w) => {
            const ln = BigintDecimal.lnFixed(p.v, 0, p.d, w);
            return lnBase ? (ln << BigInt(w)) / lnBase(w) : ln;
        });
    }

    // ±ln(x + sqrt(x^2 + c)), x >= 0: asinh (c = 1) and acosh (c = -1)
    private static lnPlusRoot(x: BigintDecimal, c: number, negate = false): BigintDecimal {
        const xp = BigintDecimal.parts(x);
        const square = BigintDecimal.parts(x.times(x).plus(c));
        return BigintDecimal.compute((w) => {
            const sum = BigintDecimal.toFixed(xp, w) + BigintDecimal.isqrt(BigintDecimal.toFixed(square, 2 * w));
            const r = BigintDecimal.lnFixed(sum, w, 0, w);
            return negate ? -r : r;
        });
    }

    // Combines e^x and e^-x: sinh and cosh
    private static expPair(x: DecimalInput, combine: (ePos: bigint, eNeg: bigint) => bigint): BigintDecimal {
        const p = BigintDecimal.parts(x);
        return BigintDecimal.compute((w) =>
            combine(BigintDecimal.expParts(p, w), BigintDecimal.expParts({ v: -p.v, d: p.d }, w)));
    }

    // ---------------------------------------------------------------- fixed-point algorithms

    private static constant(name: string, w: number, compute: (w: number) => bigint): bigint {
        let cached = BigintDecimal.constants.get(name);
        if (!cached || w > cached.scale) {
            const scale = w + BigintDecimal.GUARD_BITS;
            cached = { scale, value: compute(scale) };
            BigintDecimal.constants.set(name, cached);
        }
        return cached.value >> BigInt(cached.scale - w);
    }

    // pi at scale w. Low precision: Machin's formula, pi = 16 atan(1/5) - 4 atan(1/239).
    // High precision: the Chudnovsky series (~47 bits per term) by binary splitting:
    // pi = 426880 sqrt(10005) / Σ (-1)^k (6k)! (13591409 + 545140134 k) / ((3k)! (k!)^3 640320^(3k))
    private static piFixed(w: number): bigint {
        return BigintDecimal.constant("pi", w, (s) => {
            if (s < BigintDecimal.BINARY_SPLIT_BITS) {
                return 4n * (4n * BigintDecimal.atanRatio(1n, 5n, s) - BigintDecimal.atanRatio(1n, 239n, s));
            }
            const C3 = 10939058860032000n; // 640320^3 / 24
            const [, Q, T] = BigintDecimal.binarySplit(0, Math.ceil(s / 47.11) + 2,
                (k) => 13591409n + 545140134n * k,
                (k) => -(6n * k - 5n) * (2n * k - 1n) * (6n * k - 1n),
                (k) => k * k * k * C3);
            return (426880n * BigintDecimal.isqrt(10005n << BigInt(2 * s)) * Q) / T;
        });
    }

    // ln(2) = 2 atanh(1/3)
    private static ln2Fixed(w: number): bigint {
        return BigintDecimal.constant("ln2", w, (s) => 2n * BigintDecimal.atanhRatio(1n, 3n, s));
    }

    // ln(10) = 3 ln(2) + ln(1.25), ln(1.25) = 2 atanh(1/9)
    private static ln10Fixed(w: number): bigint {
        return BigintDecimal.constant("ln10", w,
            (s) => 3n * BigintDecimal.ln2Fixed(s) + 2n * BigintDecimal.atanhRatio(1n, 9n, s));
    }

    // atanh(j/c) at scale w, for small integers 0 < j < c.
    // High precision: Euler's form atanh(y) = y / (1 - y^2) Σ (2k)!! / (2k + 1)!! (-y^2 / (1 - y^2))^k
    // has small-integer term ratios, so it can be summed by binary splitting.
    private static atanhRatio(j: bigint, c: bigint, w: number): bigint {
        if (w < BigintDecimal.BINARY_SPLIT_BITS) return BigintDecimal.atanRatio(j, c, w, false);
        const j2 = j * j, d = c * c - j2;
        const terms = Math.ceil(w / Math.log2(Number(d) / Number(j2))) + 2;
        const [, Q, T] = BigintDecimal.binarySplit(0, terms, () => 1n, (k) => -2n * k * j2, (k) => (2n * k + 1n) * d);
        return (((j * c) << BigInt(w)) * T) / (d * Q);
    }

    // Σ_{k=lo}^{hi-1} a(k) Π_{t=lo+1..k} p(t)/q(t) as [P, Q, T] with the sum = T / Q (binary splitting).
    // Halving the range recursively turns the work into a few large, balanced multiplications,
    // where V8's fast multiplication algorithms do best.
    private static binarySplit(lo: number, hi: number, a: (k: bigint) => bigint,
        p: (k: bigint) => bigint, q: (k: bigint) => bigint): [bigint, bigint, bigint] {
        if (hi - lo === 1) {
            const k = BigInt(lo);
            const P = lo === 0 ? 1n : p(k), Q = lo === 0 ? 1n : q(k);
            return [P, Q, a(k) * P];
        }
        const mid = (lo + hi) >> 1;
        const [P1, Q1, T1] = BigintDecimal.binarySplit(lo, mid, a, p, q);
        const [P2, Q2, T2] = BigintDecimal.binarySplit(mid, hi, a, p, q);
        return [P1 * P2, Q1 * Q2, T1 * Q2 + P1 * T2];
    }

    // Σ_{k>=0} x^k Π_{t=1..k} p(t)/q(t) at scale w, for x fixed at scale w (|x| < 1, |p(t)| <= q(t)),
    // by rectangular splitting (Paterson–Stockmeyer): with m ≈ sqrt(N) powers x^1..x^m, each block of
    // m terms costs one full multiplication, and everything else multiplies or divides by small integers.
    // Used from RECTANGULAR_BITS up; below that the callers' direct term-by-term loops are faster.
    private static series(x: bigint, w: number, p: (t: bigint) => bigint, q: (t: bigint) => bigint): bigint {
        const W = BigInt(w), one = 1n << W;
        if (x === 0n) return one;

        // Terms needed: until |x|^N Π p/q < 2^-(w + 8)
        const log2x = BigintDecimal.bitLength(x) - w;
        let terms = 0;
        for (let size = 0; size > -(w + 8);) {
            terms++;
            const t = BigInt(terms);
            size += log2x + Math.log2(Math.abs(Number(p(t))) / Number(q(t)));
        }
        const m = Math.ceil(Math.sqrt(terms));
        // x^(m-1) .. x^0, highest first, and x^m
        const descendingPowers: bigint[] = [one];
        let xm = one;
        for (let i = 1; i <= m; i++) {
            xm = (xm * x) >> W;
            if (i < m) descendingPowers.unshift(xm);
        }

        // Blocks from the last one down, Horner-style in x^m. For a block starting at term b:
        //   sum_b = (Σ_i x^i num_i den_i + x^m sum_{b+m} num_m / q(b+m)) / den_0
        // with num_i = Π_{t=b+1..b+i} p(t) and den_i = Π_{t=b+i+1..b+m-1} q(t), both built while i goes down.
        let sum = 0n;
        for (let b = (Math.ceil(terms / m) - 1) * m; b >= 0; b -= m) {
            const base = BigInt(b);
            let num = 1n;
            for (let t = 1; t <= m; t++) num *= p(base + BigInt(t));
            let block = sum === 0n ? 0n : (((xm * sum) >> W) * num) / q(base + BigInt(m));
            let den = 1n, i = m;
            for (const power of descendingPowers) {
                i--;
                num /= p(base + BigInt(i + 1)); // exact: num was a product including this factor
                if (i < m - 1) den *= q(base + BigInt(i + 1));
                block += power * num * den;
            }
            sum = block / den;
        }
        return sum;
    }

    // Halvings of the argument before a Taylor series (each costs one squaring or double-angle step afterwards).
    // Term-by-term summation favours more halvings (~sqrt(w)/2); rectangular splitting fewer (~1.5 cbrt(w)).
    private static halvings(w: number): number {
        return w < BigintDecimal.RECTANGULAR_BITS ? Math.ceil(Math.sqrt(w) / 2) : Math.round(1.5 * Math.cbrt(w));
    }

    // atan(p/q), or atanh(p/q) when `alternating` is false, at scale w, for small integers p < q.
    // Every step multiplies and divides by small integers, which is much cheaper than a full multiplication.
    private static atanRatio(p: bigint, q: bigint, w: number, alternating = true): bigint {
        const p2 = p * p, q2 = q * q;
        let term = (p << BigInt(w)) / q, sum = term, negative = alternating;
        for (let k = 3n; term !== 0n; k += 2n) {
            term = (term * p2) / q2;
            sum = negative ? sum - term / k : sum + term / k;
            negative = alternating && !negative;
        }
        return sum;
    }

    // ln(m) for m (fixed at scale w) in [1, 2], using ln(m) = 2 atanh(y), y = (m - 1) / (m + 1)
    private static lnNear1(m: bigint, w: number): bigint {
        const W = BigInt(w), one = BigintDecimal.one(w);
        const y = ((m - one) << W) / (m + one);
        const y2 = (y * y) >> W;
        if (w >= BigintDecimal.RECTANGULAR_BITS) {
            // Euler's form: atanh(y) = y / (1 - y^2) Σ (2k)!! / (2k + 1)!! (-y^2 / (1 - y^2))^k
            const oneMinusY2 = one - y2;
            const sum = BigintDecimal.series(-(y2 << W) / oneMinusY2, w, (t) => 2n * t, (t) => 2n * t + 1n);
            return 2n * ((((y << W) / oneMinusY2) * sum) >> W);
        }
        let term = y, sum = y;
        for (let k = 3n; term !== 0n; k += 2n) {
            term = (term * y2) >> W;
            sum += term / k;
        }
        return 2n * sum;
    }

    // ln(v * 2^-binaryExp * 10^-decimalExp) at scale w, for v > 0.
    // Uses v = m * 2^k with m in [1, 2), so ln = ln(m) + (k - binaryExp) ln2 - decimalExp ln10.
    // m is then split as (1 + j/256) * m' using its top 8 bits j. ln(1 + j/256) = 2 atanh(j / (512 + j)) comes
    // from a table, computed once per j and precision, and m' < 1 + 2^-8 makes the remaining series short.
    private static lnFixed(v: bigint, binaryExp: number, decimalExp: number, w: number): bigint {
        const k = BigintDecimal.bitLength(v) - 1;
        const powerOf2 = k - binaryExp;
        // the constants are multiplied by these exponents, so they need their bits as extra precision
        const ww = w + BigintDecimal.bitLength(BigInt(Math.abs(powerOf2) + decimalExp)) + 8;
        const m = BigintDecimal.shift(v, k, ww);
        const j = (m >> BigInt(ww - 8)) - 256n;
        let r = BigInt(powerOf2) * BigintDecimal.ln2Fixed(ww) - BigInt(decimalExp) * BigintDecimal.ln10Fixed(ww);
        if (j === 0n) {
            r += BigintDecimal.lnNear1(m, ww);
        } else {
            r += BigintDecimal.lnNear1((m << 8n) / (256n + j), ww)
                + BigintDecimal.constant(`ln(1+${j}/256)`, ww, (s) => 2n * BigintDecimal.atanhRatio(j, 512n + j, s));
        }
        return r >> BigInt(ww - w);
    }

    // e^x for exact decimal parts, at scale w
    private static expParts(x: Parts, w: number): bigint {
        // The result has about integerPart * log2(e) integer bits; x needs that much extra precision.
        const integerPart = BigintDecimal.integerPart(x);
        const magnitude = Math.max(0, Math.ceil(Number(integerPart) * Math.LOG2E));
        if (!Number.isFinite(magnitude)) throw new RangeError("exp: result is too large to represent");
        const xw = w + magnitude + BigintDecimal.GUARD_BITS + BigintDecimal.bitLength(integerPart);
        return BigintDecimal.expFixed(BigintDecimal.toFixed(x, xw), xw, w);
    }

    // e^(x / 2^xw) at scale w.
    // e^x = 2^n * e^r with r = x - n * ln2, |r| <= 0.35. Multiplying by 2^n is a shift.
    // e^r: the argument is halved k times, summed as a Taylor series, then squared k times.
    private static expFixed(x: bigint, xw: number, w: number): bigint {
        // n only has to be close to x / ln2, so a low-precision estimate is enough
        const roughScale = BigintDecimal.bitLength(x >> BigInt(xw)) + 64;
        const roughX = BigintDecimal.shift(x, xw, roughScale);
        const roughLn2 = BigintDecimal.ln2Fixed(roughScale);
        const n = BigintDecimal.floorDiv(2n * roughX + roughLn2, 2n * roughLn2);
        // e^x < 2^-(w + 1): rounds to zero
        if (n < -BigInt(w + 2)) return 0n;

        const integerBits = Math.max(0, Number(n));
        const k = BigintDecimal.halvings(w + integerBits);
        // squaring k times doubles the error k times; the result's integer bits need precision too
        const ww = w + integerBits + k + BigintDecimal.GUARD_BITS;
        const nBits = BigintDecimal.bitLength(n);
        const r = (BigintDecimal.shift(x, xw, ww + nBits) - n * BigintDecimal.ln2Fixed(ww + nBits)) >> BigInt(nBits + k);

        // e^r = Σ r^t / t!
        const WW = BigInt(ww);
        let sum: bigint;
        if (ww >= BigintDecimal.RECTANGULAR_BITS) {
            sum = BigintDecimal.series(r, ww, () => 1n, (t) => t);
        } else {
            let term = BigintDecimal.one(ww);
            sum = term;
            for (let t = 1n; term !== 0n; t++) {
                term = ((term * r) >> WW) / t;
                sum += term;
            }
        }
        for (let i = 0; i < k; i++) sum = (sum * sum) >> WW;
        return sum >> BigInt(ww - w - Number(n));
    }

    // [sin(x), cos(x)] for exact decimal parts, at scale w
    private static sinCosParts(x: Parts, w: number): [bigint, bigint] {
        // Large arguments need pi with as many extra bits as the integer part has.
        const base = w + BigintDecimal.GUARD_BITS + BigintDecimal.bitLength(BigintDecimal.integerPart(x));
        const ww = base + BigintDecimal.sinCosLoss(base);
        const [s, c] = BigintDecimal.sinCosFixed(BigintDecimal.toFixed(x, ww), ww);
        return [s >> BigInt(ww - w), c >> BigInt(ww - w)];
    }

    // Bits of precision sinCosFixed loses at scale w (the argument halvings), which callers add as guard bits
    private static sinCosLoss(w: number): number {
        return BigintDecimal.halvings(w) + 4;
    }

    // [sin(x), cos(x)] for x fixed at scale w.
    // x = q * (pi / 2) + r with |r| <= pi / 4; r is halved k times, both Taylor series are summed,
    // then the double-angle formulas are applied k times.
    private static sinCosFixed(x: bigint, w: number): [bigint, bigint] {
        const halfPi = BigintDecimal.piFixed(w) >> 1n;
        const q = BigintDecimal.floorDiv(2n * x + halfPi, 2n * halfPi);
        const k = BigintDecimal.halvings(w);
        const r = (x - q * halfPi) >> BigInt(k);
        const W = BigInt(w);
        const minusR2 = -((r * r) >> W);

        // sin r = r Σ (-r^2)^t / (2t + 1)!,  cos r = Σ (-r^2)^t / (2t)!
        let sin: bigint, cos: bigint;
        if (w >= BigintDecimal.RECTANGULAR_BITS) {
            sin = (r * BigintDecimal.series(minusR2, w, () => 1n, (t) => 2n * t * (2n * t + 1n))) >> W;
            cos = BigintDecimal.series(minusR2, w, () => 1n, (t) => (2n * t - 1n) * 2n * t);
        } else {
            let term = r;
            sin = r;
            for (let n = 2n; term !== 0n; n += 2n) {
                term = ((term * minusR2) >> W) / (n * (n + 1n));
                sin += term;
            }
            term = BigintDecimal.one(w);
            cos = term;
            for (let n = 1n; term !== 0n; n += 2n) {
                term = ((term * minusR2) >> W) / (n * (n + 1n));
                cos += term;
            }
        }
        // sin(2a) = 2 sin(a) cos(a), cos(2a) = cos(a)^2 - sin(a)^2
        for (let i = 0; i < k; i++) {
            [sin, cos] = [(2n * sin * cos) >> W, (cos * cos - sin * sin) >> W];
        }

        const quadrant = Number(((q % 4n) + 4n) % 4n);
        return quadrant === 0 ? [sin, cos] :
            quadrant === 1 ? [cos, -sin] :
                quadrant === 2 ? [-sin, -cos] :
                    [-cos, sin];
    }

    // atan(x) for x fixed at scale w, result at scale w
    private static atanFixed(x: bigint, w: number): bigint {
        if (x < 0n) return -BigintDecimal.atanFixed(-x, w);
        const one = BigintDecimal.one(w);
        if (x > one) return (BigintDecimal.piFixed(w) >> 1n) - BigintDecimal.atanFixed(BigintDecimal.one(2 * w) / x, w);
        if (w > BigintDecimal.ATAN_NEWTON_BITS) return BigintDecimal.atanNewton(x, w);

        // atan(x) = 2 * atan(x / (1 + sqrt(1 + x^2))), until x < 1/8
        let halvings = 0n;
        while (x << 3n > one) {
            x = (x << BigInt(w)) / (one + BigintDecimal.isqrt(BigintDecimal.one(2 * w) + x * x));
            halvings++;
        }
        const W = BigInt(w);
        const x2 = (x * x) >> W;
        if (w >= BigintDecimal.RECTANGULAR_BITS) {
            // Euler's form: atan(x) = x / (1 + x^2) Σ (2k)!! / (2k + 1)!! (x^2 / (1 + x^2))^k
            const sum = BigintDecimal.series((x2 << W) / (one + x2), w, (t) => 2n * t, (t) => 2n * t + 1n);
            return ((((x << W) / (one + x2)) * sum) >> W) << halvings;
        }
        let sum = x, term = x;
        for (let k = 3n; term !== 0n; k += 2n) {
            term = -((term * x2) >> W);
            sum += term / k;
        }
        return sum << halvings;
    }

    // atan(x) for x in [0, 1] fixed at scale w, by Newton's method on tan(y) = x:
    // y += (x cos y - sin y) / (cos y + x sin y). Each step doubles the correct bits,
    // so it starts from Math.atan and works at twice the precision every step.
    private static atanNewton(x: bigint, w: number): bigint {
        let scale = 53;
        let y = BigInt(Math.round(Math.atan(Number(BigintDecimal.shift(x, w, 53)) / 2 ** 53) * 2 ** 53));
        let correctBits = 50;
        const target = w + 8;
        while (correctBits < target) {
            correctBits = Math.min(2 * correctBits, target);
            const s = correctBits + BigintDecimal.sinCosLoss(correctBits) + 16;
            y = BigintDecimal.shift(y, scale, s);
            scale = s;
            const xs = BigintDecimal.shift(x, w, s);
            const [sin, cos] = BigintDecimal.sinCosFixed(y, s);
            const numerator = ((xs * cos) >> BigInt(s)) - sin;
            const denominator = cos + ((xs * sin) >> BigInt(s));
            y += (numerator << BigInt(s)) / denominator;
        }
        return BigintDecimal.shift(y, scale, w);
    }

    // asin(x) at scale w, |x| <= 1
    private static asinFixed(x: Parts, w: number): bigint {
        // 1 - x^2 computed exactly from the decimal parts: near x = ±1 it is tiny, and rounding x first
        // would lose it. asin(x) = atan(x / sqrt(1 - x^2)).
        const oneMinusSquare = BigintDecimal.pow10(2 * x.d) - x.v * x.v;
        if (oneMinusSquare < 0n) throw new RangeError("asin/acos: argument must be between -1 and 1 (NaN)");
        const c = BigintDecimal.isqrt(BigintDecimal.toFixed({ v: oneMinusSquare, d: 2 * x.d }, 2 * w));
        if (c === 0n) return x.v > 0n ? BigintDecimal.piFixed(w) >> 1n : -(BigintDecimal.piFixed(w) >> 1n);
        return BigintDecimal.atanFixed((BigintDecimal.toFixed(x, w) << BigInt(w)) / c, w);
    }

}

export { BigintDecimal as default };
