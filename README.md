# bigint-decimal

[![License: MIT][license-src]][license-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]

[license-src]: https://img.shields.io/badge/license-MIT-brightgreen?&style=flat-square
[license-href]: https://github.com/Generalsimus/bigint-decimal/blob/main/LICENSE
[npm-version-src]: https://img.shields.io/npm/v/bigint-decimal?&style=flat-square
[npm-version-href]: https://www.npmjs.com/package/bigint-decimal
[npm-downloads-src]: https://img.shields.io/npm/dt/bigint-decimal?&style=flat-square
[npm-downloads-href]: https://www.npmjs.com/package/bigint-decimal

Exact decimal arithmetic and `Math` functions at any precision, built on native `BigInt`.

JavaScript numbers are binary floating point, so everyday decimals come out wrong:

```javascript
0.1 + 0.2; // 0.30000000000000004
```

`bigint-decimal` stores every number exactly, as a `BigInt` plus a count of decimal places:

```javascript
import { BigintDecimal } from "bigint-decimal";

new BigintDecimal("0.1").plus("0.2").toString(); // "0.3"
```

- **Exact** `plus`, `minus` and `times`, with no rounding errors.
- **The `Math` functions**: `sqrt`, `pow`, `exp`, `log`, `sin`, `atan2` and more, plus `PI`, `E` and the other constants.
- **Any precision**: 20 decimal places by default, or thousands if you need them.
- **Correctly rounded**: results are checked digit by digit against independent references.
- **Fast**: faster than decimal.js, bignumber.js and big.js in every [benchmark](#benchmarks).
- **Zero dependencies**, TypeScript types included, ESM and CommonJS.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [How it works](#how-it-works)
- [Benchmarks](#benchmarks)
- [Testing](#testing)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

## Install

```bash
npm install bigint-decimal
# or
yarn add bigint-decimal
# or
pnpm add bigint-decimal
```

Works in Node.js 14+ and all modern browsers, with both `import` and `require`:

```javascript
import { BigintDecimal } from "bigint-decimal";       // ES modules
const { BigintDecimal } = require("bigint-decimal");  // CommonJS
```

## Usage

### Quick start

```javascript
import { BigintDecimal } from "bigint-decimal";

const price = new BigintDecimal("19.99");
const total = price.times(3).times("1.0825").round(2); // 3 items plus 8.25% tax, rounded to cents

total.toString();   // "64.92"
total.eq("64.92");  // true
```

Methods return `BigintDecimal` objects, not strings. In the examples below, a comment shows the value as `toString()` returns it. Compare values with `eq`, `gt` and the other [comparison methods](#comparing), not with `===`.

### Creating numbers

Pass strings, numbers, bigints or another `BigintDecimal`. Scientific notation works too.

```javascript
new BigintDecimal("123.45");  // "123.45"
new BigintDecimal("1e-18");   // "0.000000000000000001"
new BigintDecimal("1.5e3");   // "1500"
new BigintDecimal(100n);      // "100"
new BigintDecimal();          // "0"
```

Prefer strings for decimals. A JavaScript `number` is already rounded before the library sees it:

```javascript
new BigintDecimal(0.1 + 0.2); // "0.30000000000000004"
new BigintDecimal("0.3");     // "0.3"
```

Anything that is not a number throws an error instead of silently becoming `0`:

```javascript
new BigintDecimal("abc"); // Error: "abc" is not safe parameter .
new BigintDecimal("-");   // Error: "-" is not safe parameter .
```

### Arithmetic

Every operation returns a new `BigintDecimal`, so calls chain. The original value never changes.

```javascript
new BigintDecimal("1500.50").plus("200.75");   // "1701.25"
new BigintDecimal("1701.25").minus("0.005");   // "1701.245"
new BigintDecimal("45000.50").times("0.5");    // "22500.25"
new BigintDecimal("1000").div("3");            // "333.33333333333333333333"

new BigintDecimal("100").plus("50.5").times("2").minus("1.1").div("2"); // "149.95"
```

- `plus`, `minus` and `times` are always exact.
- `div` stops at the [precision](#precision), 20 decimal places by default, and cuts off the remaining digits: `2 / 3` gives `0.66666666666666666666`.
- Dividing by zero throws `Error: Division by zero`.

### Comparing

Comparisons return `true` or `false` and compare exact values, so `"1.50"` equals `"1.5"`.

```javascript
const balance = new BigintDecimal("999.99");

balance.gt("1000");  // false  (greater than)
balance.gte("1000"); // false  (greater than or equal)
balance.lt("1000");  // true   (less than)
balance.lte("1000"); // true   (less than or equal)
new BigintDecimal("1.50").eq("1.5"); // true
```

### Rounding

`round(decimals)` rounds to a number of decimal places. Halves round away from zero.

```javascript
new BigintDecimal("1.555").round(2);  // "1.56"
new BigintDecimal("-1.555").round(2); // "-1.56"
new BigintDecimal("1.555").round(0);  // "2"
```

`BigintDecimal.floor`, `ceil`, `trunc` and `round` round to whole numbers, like `Math`. See [Math functions](#math-functions).

### Converting to strings

`toString()` returns the exact value without trailing zeros. `JSON.stringify` and `console.log` use the same string.

```javascript
new BigintDecimal("12.500").toString();                  // "12.5"
JSON.stringify({ total: new BigintDecimal("12.50") });   // '{"total":"12.5"}'
```

### Precision

Precision is the number of decimal places that `div` and the math functions compute. The default is 20.

```javascript
BigintDecimal.setPrecisionGlobal(2);
new BigintDecimal("1").div("3"); // "0.33"
BigintDecimal.sqrt(2);           // "1.41"

BigintDecimal.setPrecisionGlobal(50);
BigintDecimal.PI; // "3.14159265358979323846264338327950288419716939937511"
```

`setPrecision` changes the precision of one value's own `div`. Results of later operations are new values, which use the global precision again.

```javascript
const x = new BigintDecimal("1");
x.setPrecision(5);
x.div("3");            // "0.33333"
x.plus("1").div("3");  // "0.66666666666666666666" (new value, global precision)
```

Precision must be a whole number `>= 0`. Anything else throws a `RangeError`.

### Math functions

Every function of the JavaScript `Math` object is a static method of `BigintDecimal`, except `fround`, `f16round`, `clz32` and `imul`, which only make sense for floating-point and 32-bit integers. They take the same values as the constructor and return a `BigintDecimal`, rounded to the global precision.

```javascript
BigintDecimal.sqrt("2");          // "1.4142135623730950488"
BigintDecimal.cbrt("-27");        // "-3"
BigintDecimal.pow("1.05", 10);    // "1.62889462677744140625"
BigintDecimal.pow(2, 100);        // "1267650600228229401496703205376"
BigintDecimal.exp(1);             // "2.71828182845904523536"
BigintDecimal.log(10);            // "2.30258509299404568402"
BigintDecimal.log10(1000);        // "3"
BigintDecimal.atan2(1, 1);        // "0.78539816339744830962"
BigintDecimal.hypot(3, 4);        // "5"
BigintDecimal.max("1.5", 2n, -3); // "2"

BigintDecimal.PI; // "3.14159265358979323846"
BigintDecimal.E;  // "2.71828182845904523536"
```

They work detached from the class, just like `Math.sqrt`:

```javascript
["4", "2.25"].map(BigintDecimal.sqrt).map(String); // ["2", "1.5"]
```

`sumPrecise` adds a whole list exactly, so small values are never lost next to big ones:

```javascript
BigintDecimal.sumPrecise(["1e30", "1e-30", "-1e30"]); // "0.000000000000000000000000000001"
```

### Errors

Where `Math` would return `NaN` or `Infinity`, `BigintDecimal` throws a `RangeError` with a clear message instead:

```javascript
BigintDecimal.sqrt(-1);       // RangeError: sqrt: argument must be >= 0 (NaN)
BigintDecimal.log(0);         // RangeError: log: argument is out of range
BigintDecimal.asin(2);        // RangeError: asin/acos: argument must be between -1 and 1 (NaN)
BigintDecimal.pow(-8, "0.5"); // RangeError: pow: negative base with a non-integer exponent is NaN
```

## API

### Constructor

| Signature | Description |
| --- | --- |
| `new BigintDecimal(value?)` | `value`: `string`, `number`, `bigint` or `BigintDecimal`. Defaults to `0`. Throws an `Error` for anything that is not a number. |

### Instance methods

Every `value` argument accepts the same values as the constructor. `decimals` is a whole number `>= 0`.

| Method | Returns | Description |
| --- | --- | --- |
| `plus(value)` | `BigintDecimal` | Exact sum |
| `minus(value)` | `BigintDecimal` | Exact difference |
| `times(value)` | `BigintDecimal` | Exact product |
| `div(value)` | `BigintDecimal` | Quotient to `precision` decimal places, extra digits cut off. Throws on division by zero. |
| `round(decimals)` | `BigintDecimal` | Rounded to `decimals` places, halves away from zero |
| `gt(value)`, `gte(value)`, `lt(value)`, `lte(value)`, `eq(value)` | `boolean` | Comparisons |
| `setPrecision(decimals)` | `void` | Precision of this value's `div` |
| `toString()`, `toJSON()` | `string` | The exact value, without trailing zeros |
| `isBigintDecimal(value)` | `boolean` | Whether `value` can be parsed as a number |

### Settings

| Property or method | Description |
| --- | --- |
| `BigintDecimal.precision` | Current global precision (default `20`) |
| `BigintDecimal.setPrecisionGlobal(decimals)` | Sets the global precision |
| `BigintDecimal.clearCache()` | Frees the cached constants. Only useful after very high precision work. |

### Math functions and constants

All are static methods. Results are rounded half away from zero to `BigintDecimal.precision` decimal places.

| Group | Functions |
| --- | --- |
| Rounding and sign | `abs(x)`, `sign(x)`, `floor(x)`, `ceil(x)`, `round(x)`, `trunc(x)` |
| Roots and powers | `sqrt(x)`, `cbrt(x)`, `pow(base, exponent)`, `hypot(...values)` |
| Exponentials and logarithms | `exp(x)`, `expm1(x)`, `log(x)`, `log10(x)`, `log2(x)`, `log1p(x)` |
| Trigonometry (radians) | `sin(x)`, `cos(x)`, `tan(x)`, `asin(x)`, `acos(x)`, `atan(x)`, `atan2(y, x)` |
| Hyperbolic | `sinh(x)`, `cosh(x)`, `tanh(x)`, `asinh(x)`, `acosh(x)`, `atanh(x)` |
| Lists | `max(...values)`, `min(...values)`, `sumPrecise(values)` |
| Random | `random()`: a random number in `[0, 1)`, using `crypto.getRandomValues` when available |
| Constants | `E`, `LN2`, `LN10`, `LOG2E`, `LOG10E`, `PI`, `SQRT1_2`, `SQRT2` |

Like `Math.round`, `BigintDecimal.round(x)` rounds halves up: `round("2.5")` is `"3"` and `round("-2.5")` is `"-2"`.

## How it works

- **Numbers** are stored as a `BigInt` of all their digits plus the number of decimal places: `123.45` is `12345n` with 2 decimals. Arithmetic is plain `BigInt` arithmetic, which V8 runs as optimized native code.
- **Math functions** work internally in binary fixed point with extra guard digits, then round once to the precision. `sqrt` and `cbrt` are computed directly in decimal and are always correctly rounded.
- **Algorithms** adapt to the precision: Taylor series with argument reduction at normal sizes, then rectangular splitting, binary splitting (the Chudnovsky series for π) and Newton's method as numbers grow to thousands of digits.
- **Constants** such as π and ln 2 are computed once and cached at the highest precision used so far. `BigintDecimal.clearCache()` frees them.

## Benchmarks

**In short:** `bigint-decimal` was the fastest in every test, compared with the three most popular decimal libraries.

- **Everyday precision (20 digits):** 1.4× faster for basic arithmetic, 6× to 45× faster for math functions.
- **High precision (1000 digits):** 1.4× faster for basic arithmetic, 30× to 2800× faster for math functions.
- **Same accuracy:** both `bigint-decimal` and decimal.js give correctly rounded results.

### 20 digits

Time per call, lower is better. "—" means the library does not have that function.

| Test | Speed-up | bigint-decimal | decimal.js | bignumber.js | big.js |
| --- | ---: | ---: | ---: | ---: | ---: |
| Basic arithmetic (`plus`, `times`, `div`) | **1.4× faster** | 🏆 **1.11 µs** | 1.58 µs | 3.09 µs | 3.13 µs |
| Square root (`sqrt`) | **6× faster** | 🏆 **1.02 µs** | 6.37 µs | 6.08 µs | 43 µs |
| Exponential (`exp`) | **10× faster** | 🏆 **2.88 µs** | 29 µs | — | — |
| Natural logarithm (`log`) | **14× faster** | 🏆 **1.85 µs** | 25 µs | — | — |
| Sine (`sin`) | **7× faster** | 🏆 **3.84 µs** | 28 µs | — | — |
| Arctangent (`atan`) | **45× faster** | 🏆 **3.65 µs** | 163 µs | — | — |
| Power with a fractional exponent (`pow`) | **10× faster** | 🏆 **6.12 µs** | 62 µs | — | — |

### 1000 digits

| Test | Speed-up | bigint-decimal | decimal.js | bignumber.js | big.js |
| --- | ---: | ---: | ---: | ---: | ---: |
| Basic arithmetic (`plus`, `times`, `div`) | **1.4× faster** | 🏆 **3.85 µs** | 5.32 µs | 15 µs | 68 µs |
| Square root (`sqrt`) | **30× faster** | 🏆 **64 µs** | 2.6 ms | 1.9 ms | 195 ms |
| Exponential (`exp`) | **169× faster** | 🏆 **224 µs** | 37.8 ms | — | — |
| Natural logarithm (`log`) | **586× faster** | 🏆 **215 µs** | 126 ms | — | — |
| Sine (`sin`) | **73× faster** | 🏆 **416 µs** | 30.5 ms | — | — |
| Arctangent (`atan`) | **2826× faster** | 🏆 **734 µs** | 2074 ms | — | — |
| Power with a fractional exponent (`pow`) | **527× faster** | 🏆 **456 µs** | 240 ms | — | — |

🏆 marks the fastest library. Speed-up: how much faster `bigint-decimal` is than the fastest other library that has the function.

### Accuracy and limits

| Test | Result |
| --- | --- |
| Accuracy at 1000 digits | **Tie.** For `exp`, `log`, `sin`, `atan`, `sqrt` and `pow`, both `bigint-decimal` and decimal.js give correctly rounded results. |
| `log(2)` at 2000 digits | **`bigint-decimal` wins.** It works at any precision; decimal.js throws `Precision limit exceeded` above about 1025 digits. |

### How it was measured

- Libraries: [decimal.js](https://github.com/MikeMcl/decimal.js) 10.6.0, [bignumber.js](https://github.com/MikeMcl/bignumber.js) 11.1.5 and [big.js](https://github.com/MikeMcl/big.js) 7.0.1, all computing the same operation to the same number of digits.
- Each time is the average over 16 different inputs, measured with [tinybench](https://github.com/tinylibs/tinybench).
- Node v24.21.0 on an AMD Ryzen 9 7940HS. Run `npm run bench` to reproduce the numbers on your machine.

## Testing

```bash
npm test
```

The test suite checks results digit by digit, not just roughly:

- **Independent references:** about 300 results, from 20 up to 2000 digits, match Python's `decimal` module exactly. They include hard cases next to singularities (`asin` near ±1, `tan` near π/2) and huge arguments such as `sin(1e300)`.
- **Exact checks:** arithmetic, rounding, `floor`/`ceil`/`round` and correctly rounded `sqrt`/`cbrt` on random big numbers are compared with plain `BigInt` arithmetic.
- **Memory:** a heavy workload in a separate process shows no memory growth, and `clearCache()` frees the cache.
- **Coverage:** 100% of statements, branches and functions.

## Limitations

- **Precision is counted in decimal places**, not significant digits. A result smaller than the precision rounds to `0`: `exp(-50)` is `"0"` at the default 20 places.
- **`div` cuts off** extra digits instead of rounding them; the math functions round.
- **One rounding mode** (half away from zero), and one global precision for the math functions.
- **Untrusted input:** there is no size limit besides memory. A string like `"1e1000000000"` creates a billion-digit number, which can freeze a server. Check the length or exponent of user input before passing it in.

## Contributing

Questions, bug reports and pull requests are welcome on [GitHub](https://github.com/Generalsimus/bigint-decimal/issues). Please run `npm test` before opening a pull request, and `npm run bench` if your change affects speed.

## License

[MIT](LICENSE) © 2024 soso
