

type SafeValues = string | number | bigint
export class BigintDecimalBase {

    protected value: bigint = 0n;
    protected decimals: number = 0;
    static precision: number = 20
    precision: number = BigintDecimalBase.precision;

    constructor(val: SafeValues | BigintDecimalBase = "0") {
        if (val instanceof BigintDecimalBase) {
            this.value = val.value
            this.decimals = val.decimals
            return
        }
        // Fast paths: integers need no parsing
        if (typeof val === "bigint") {
            this.value = val;
            return
        }
        if (typeof val === "number" && Number.isSafeInteger(val)) {
            this.value = BigInt(val);
            return
        }
        if (!this.isBigintDecimal(val)) {
            throw new Error(`"${val}" is not safe parameter .`)
        }
        const numberInfo = this.getNumberIFoForBigintDecimal(val);
        this.value = numberInfo.value;
        this.decimals = numberInfo.decimals;

        this.trim();
    }

    static setPrecisionGlobal(newPrecision: number) {
        // Always the base class, so subclasses share one setting with it
        BigintDecimalBase.precision = BigintDecimalBase.checkDecimals(newPrecision, "precision");
    }

    setPrecision(newPrecision: number) {
        this.precision = BigintDecimalBase.checkDecimals(newPrecision, "precision");
    }

    // A count of decimal places must be a whole number >= 0 (anything else would corrupt the value)
    protected static checkDecimals(decimals: number, name: string): number {
        if (!Number.isSafeInteger(decimals) || decimals < 0) {
            throw new RangeError(`${name} must be a whole number >= 0, got ${decimals}`);
        }
        return decimals;
    }

    // New instance of the same class as `this` (subclasses get their own type back), without parsing
    protected create(value: bigint, decimals: number): this {
        const Constructor = this.constructor as new (val: BigintDecimalBase) => this;
        const result = new Constructor(this);
        result.value = value;
        result.decimals = decimals;
        return result.trim();
    }

    protected trim(): this {
        if (this.value === 0n) {
            this.value = 0n
            this.decimals = 0;
        }
        // While we have decimals AND the last digit is 0
        while (this.decimals > 0 && this.value !== 0n && this.value % 10n === 0n) {
            this.value /= 10n; // Shrink the number
            this.decimals--;    // Shrink the scale
        }
        return this;
    }

    private toSafeValue(val: unknown) {
        if (typeof val === "string") {
            return val.trim();
        }

        return `${val}`
    }

    // Parses a string already checked by isBigintDecimal.
    // All digits go to the native BigInt parser in one call, instead of one bigint operation per digit.
    private getNumberIFoForBigintDecimal(val: unknown) {
        const safeVal = this.toSafeValue(val);

        // Sign
        const first = safeVal.charCodeAt(0);
        const negative = first === 45;
        const start = negative || first === 43 ? 1 : 0;

        // Scientific Notation Handle
        let end = safeVal.indexOf("e");
        if (end === -1) end = safeVal.indexOf("E");
        let exponent = 0;
        if (end === -1) {
            end = safeVal.length;
        } else {
            // isBigintDecimal guarantees the exponent has digits
            exponent = parseInt(safeVal.slice(end + 1), 10);
        }

        // Digits around the dot
        const dot = safeVal.indexOf(".");
        const hasDot = dot !== -1; // isBigintDecimal guarantees no dot after the exponent
        const digits = hasDot ? safeVal.slice(start, dot) + safeVal.slice(dot + 1, end) : safeVal.slice(start, end);
        let value = BigInt(digits); // isBigintDecimal guarantees at least one digit
        let decimals = (hasDot ? end - dot - 1 : 0) - exponent;

        // Handle negative decimals (large integers)
        if (decimals < 0) {
            value = value * (10n ** BigInt(-decimals));
            decimals = 0;
        };

        return { value: negative ? -value : value, decimals };
    }

    toString(): string {
        // 1. Handle Integer case (Fastest exit, Zero Allocation overhead)
        if (this.decimals === 0) return this.value.toString();

        // 2. Separate Sign and Magnitude
        // Check sign using BigInt math (fastest)
        const isNegative = this.value < 0n;

        // Get the string of digits ONLY.
        // isNegative ? -this.value : this.value -> creates a temporary BigInt
        // .toString() -> creates the string of digits "123"
        // This is cheaper than creating "-123" and slicing it.
        const s = (isNegative ? -this.value : this.value).toString();

        const len = s.length;

        // 3. Logic for insertion vs padding
        if (len > this.decimals) {
            // Case A: 12345 (2 dec) -> 123.45
            // splitIndex is purely digits before the dot
            const splitIndex = len - this.decimals;

            // Build the absolute decimal string
            const result = s.substring(0, splitIndex) + "." + s.substring(splitIndex);

            // Add sign if needed
            return isNegative ? "-" + result : result;
        }

        // Case B: 5 (2 dec) -> 0.05
        // Calculate zeros needed: 2 decimals - length 1 = 1 zero
        const zerosNeeded = this.decimals - len;

        // Build the result directly
        // "0." + "0" + "5"
        return (isNegative ? "-0." : "0.") + "0".repeat(zerosNeeded) + s;
    }

    toJSON() {
        return this.toString();
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }

    isBigintDecimal(val: unknown): boolean {
        const s = this.toSafeValue(val);
        if (s.length === 0) return false;

        let dot = false, e = false, mantissaDigits = 0, exponentDigits = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c >= 48 && c <= 57) { // 0-9
                if (e) exponentDigits++;
                else mantissaDigits++;
                continue;
            }
            if (c === 46 && !dot && !e) { dot = true; continue; } // .
            if (i === 0 && (c === 45 || c === 43)) continue; // +/- at start
            if ((c === 101 || c === 69) && !e) { // e/E
                e = true;
                const next = s.charCodeAt(i + 1);
                if (next === 45 || next === 43) i++; // Skip sign after 'e'
                continue;
            }
            return false;
        }
        // A number needs digits: "-", ".", "e5" and "1e" are not numbers
        return mantissaDigits > 0 && (!e || exponentDigits > 0);
    }

    plus(val: SafeValues | BigintDecimalBase): this {
        const plusValue = val instanceof BigintDecimalBase ? val : new BigintDecimalBase(val);

        // 1. Determine which number has more decimals
        const d1 = this.decimals;
        const d2 = plusValue.decimals;
        const newDecimal = d1 > d2 ? d1 : d2;

        // 2. Align values (Common Denominator)
        // If 'this' has fewer decimals, scale it up.
        const v1 = d1 < newDecimal ? this.value * (10n ** BigInt(newDecimal - d1)) : this.value;
        // If 'plusValue' has fewer decimals, scale it up.
        const v2 = d2 < newDecimal ? plusValue.value * (10n ** BigInt(newDecimal - d2)) : plusValue.value;

        // 3. Now add and return
        return this.create(v1 + v2, newDecimal);
    }

    minus(val: SafeValues | BigintDecimalBase): this {
        const other = val instanceof BigintDecimalBase ? val : new BigintDecimalBase(val);
        const d1 = this.decimals;
        const d2 = other.decimals;
        const newDecimal = d1 > d2 ? d1 : d2;

        // Scale values to the same precision
        const v1 = d1 < newDecimal ? this.value * (10n ** BigInt(newDecimal - d1)) : this.value;
        const v2 = d2 < newDecimal ? other.value * (10n ** BigInt(newDecimal - d2)) : other.value;

        return this.create(v1 - v2, newDecimal);
    }

    times(val: SafeValues | BigintDecimalBase): this {
        const other = val instanceof BigintDecimalBase ? val : new BigintDecimalBase(val);

        // Multiplication: (A * 10^d1) * (B * 10^d2) = (A * B) * 10^(d1 + d2)
        return this.create(this.value * other.value, this.decimals + other.decimals);
    }

    round(toDecimals: number): this {
        const diff = this.decimals - BigintDecimalBase.checkDecimals(toDecimals, "round: decimals");

        if (diff <= 0) return this; // Already more precise than requested

        const power = 10n ** BigInt(diff);
        const half = power / 2n;

        // Standard rounding: add half of the divisor before dividing
        // This turns 0.999... into 1.0
        const roundedValue = (this.value >= 0n) ? (this.value + half) / power : (this.value - half) / power;

        return this.create(roundedValue, toDecimals);
    }

    div(val: SafeValues | BigintDecimalBase): this {
        const other = val instanceof BigintDecimalBase ? val : new BigintDecimalBase(val);
        if (other.value === 0n) throw new Error("Division by zero");

        let v1 = this.value;
        const v2 = other.value;

        // 1. Scale up once to your "Max Allowed" precision
        const shift = this.precision + other.decimals - this.decimals;
        if (shift > 0) v1 *= 10n ** BigInt(shift);
        else if (shift < 0) v1 /= 10n ** BigInt(-shift);

        // 2. create() trims it immediately.
        // This is where 0.500000... becomes 0.5 automatically.
        return this.create(v1 / v2, this.precision);
    }

    private compare(val: SafeValues | BigintDecimalBase): number {
        const other = val instanceof BigintDecimalBase ? val : new BigintDecimalBase(val);
        const maxD = Math.max(this.decimals, other.decimals);

        const v1 = this.decimals < maxD ? this.value * (10n ** BigInt(maxD - this.decimals)) : this.value;
        const v2 = other.decimals < maxD ? other.value * (10n ** BigInt(maxD - other.decimals)) : other.value;

        return v1 > v2 ? 1 : v1 < v2 ? -1 : 0;
    }

    gt(val: SafeValues | BigintDecimalBase) {
        return this.compare(val) === 1;
    }

    lt(val: SafeValues | BigintDecimalBase) {
        return this.compare(val) === -1;
    }

    gte(val: SafeValues | BigintDecimalBase) {
        return this.compare(val) >= 0;
    }

    lte(val: SafeValues | BigintDecimalBase) {
        return this.compare(val) <= 0;
    }

    eq(val: SafeValues | BigintDecimalBase) {
        return this.compare(val) === 0;
    }
}
