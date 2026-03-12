

type SafeValues = string | number | bigint
export class BigintDecimal {

    private value: bigint = 0n;
    private decimals: number = 0;
    static precision: number = 20
    precision: number = BigintDecimal.precision;

    constructor(val: SafeValues | BigintDecimal = "0") {
        if (val instanceof BigintDecimal) {
            this.value = val.value
            this.decimals = val.decimals
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
        this.precision = newPrecision;
    }

    setPrecision(newPrecision: number) {
        this.precision = newPrecision;
    }


    private trim(): this {
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

    private getNumberIFoForBigintDecimal(val: unknown) {
        const safeVal = this.toSafeValue(val);
        let isDot = false, value = 0n, decimals = 0, sign = 1n;

        for (let i = 0; i < safeVal.length; i++) {
            const code = safeVal.charCodeAt(i);

            if (code >= 48 && code <= 57) {
                value = (value * 10n) + BigInt(code - 48);
                if (isDot) decimals++;
                continue;
            }

            if (code === 46 && !isDot) {
                isDot = true;
                continue;
            }

            if (i === 0 && (code === 45 || code === 43)) {
                if (code === 45) sign = -1n;
                continue;
            }

            // Scientific Notation Handle
            if (code === 101 || code === 69) {
                const exp = parseInt(safeVal.slice(i + 1), 10);
                if (isNaN(exp)) throw new Error("Invalid exponent");
                decimals -= exp;
                break;
            }
            throw new Error(`Unexpected character: ${String.fromCharCode(code)}`);
        }

        // Handle negative decimals (large integers)
        if (decimals < 0) {
            value = value * (10n ** BigInt(-decimals));
            decimals = 0;
        };

        return { value: value * sign, decimals };
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

        let dot = false, e = false;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c >= 48 && c <= 57) continue; // 0-9
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
        return true;
    }

    plus(val: SafeValues | BigintDecimal) {
        const plusValue = new BigintDecimal(val);

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
        const result = new BigintDecimal("0");
        result.value = v1 + v2;
        result.decimals = newDecimal;

        return result.trim();
    }

    minus(val: SafeValues | BigintDecimal) {
        const other = new BigintDecimal(val);
        const d1 = this.decimals;
        const d2 = other.decimals;
        const newDecimal = d1 > d2 ? d1 : d2;

        // Scale values to the same precision
        const v1 = d1 < newDecimal ? this.value * (10n ** BigInt(newDecimal - d1)) : this.value;
        const v2 = d2 < newDecimal ? other.value * (10n ** BigInt(newDecimal - d2)) : other.value;

        const result = new BigintDecimal("0"); // Fastest instantiation
        result.value = v1 - v2;
        result.decimals = newDecimal;
        return result.trim();
    }

    times(val: SafeValues | BigintDecimal) {
        const other = new BigintDecimal(val);

        const result = new BigintDecimal("0");
        // Multiplication: (A * 10^d1) * (B * 10^d2) = (A * B) * 10^(d1 + d2)
        result.value = this.value * other.value;
        result.decimals = this.decimals + other.decimals;

        return result.trim();
    }

    round(toDecimals: number): BigintDecimal {
        const result = new BigintDecimal("0");
        const diff = this.decimals - toDecimals;

        if (diff <= 0) return this; // Already more precise than requested

        const power = 10n ** BigInt(diff);
        const half = power / 2n;

        // Standard rounding: add half of the divisor before dividing
        // This turns 0.999... into 1.0
        const roundedValue = (this.value >= 0n) ? (this.value + half) / power : (this.value - half) / power;

        result.value = roundedValue;
        result.decimals = toDecimals;
        return result.trim();
    }

    div(val: SafeValues | BigintDecimal) {
        const other = val instanceof BigintDecimal ? val : new BigintDecimal(val);
        if (other.value === 0n) throw new Error("Division by zero");

        let v1 = this.value;
        const v2 = other.value;

        // 1. Scale up once to your "Max Allowed" precision
        const shift = this.precision + other.decimals - this.decimals;
        if (shift > 0) v1 *= 10n ** BigInt(shift);
        else if (shift < 0) v1 /= 10n ** BigInt(-shift);

        const result = new BigintDecimal("0");
        result.value = v1 / v2;
        result.decimals = this.precision;

        // 2. Immediately trim it!
        // This is where 0.500000... becomes 0.5 automatically.
        return result.trim();
    }

    private compare(val: SafeValues | BigintDecimal): number {
        const other = val instanceof BigintDecimal ? val : new BigintDecimal(val);
        const maxD = Math.max(this.decimals, other.decimals);

        const v1 = this.decimals < maxD ? this.value * (10n ** BigInt(maxD - this.decimals)) : this.value;
        const v2 = other.decimals < maxD ? other.value * (10n ** BigInt(maxD - other.decimals)) : other.value;

        return v1 > v2 ? 1 : v1 < v2 ? -1 : 0;
    }

    gt(val: SafeValues | BigintDecimal) {
        return this.compare(val) === 1;
    }

    lt(val: SafeValues | BigintDecimal) {
        return this.compare(val) === -1;
    }

    gte(val: SafeValues | BigintDecimal) {
        return this.compare(val) >= 0;
    }

    lte(val: SafeValues | BigintDecimal) {
        return this.compare(val) <= 0;
    }

    eq(val: SafeValues | BigintDecimal) {
        return this.compare(val) === 0;
    }
};

export { BigintDecimal as default }

