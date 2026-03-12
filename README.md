# BigintDecimal

![NPM Version](https://img.shields.io/npm/v/bigint-decimal)
![Build Status](https://img.shields.io/github/actions/workflow/status/Generalsimus/bigint-decimal/publish.yml)
![License](https://img.shields.io/npm/l/bigint-decimal)

A blazing-fast, zero-dependency, arbitrary-precision decimal math library for TypeScript and JavaScript. Built on native `BigInt` to safely handle massive numbers, exact decimals, and eliminate floating-point errors.

Perfect for financial applications, trading platforms, and anywhere precise calculation is critical.

## Installation

```bash
npm install bigint-decimal
# or
yarn add bigint-decimal
# or
pnpm add bigint-decimal

```

## Why bigint-decimal?

Native JavaScript floating-point math is notoriously imprecise:

```javascript
console.log(0.1 + 0.2); // 0.30000000000000004 ❌

```

`bigint-decimal` fixes this natively, without the bloat of massive external math libraries:

```javascript
import { BigintDecimal } from 'bigint-decimal';

const a = new BigintDecimal("0.1");
const b = new BigintDecimal("0.2");
console.log(a.plus(b).toString()); // "0.3" ✅

```

## Usage

### Basic Arithmetic

`BigintDecimal` supports all standard arithmetic operations. Always pass numbers as strings to guarantee precision before JavaScript evaluates them.

```typescript
import { BigintDecimal } from 'bigint-decimal';

const walletBalance = new BigintDecimal("1500.50");
const tradeAmount = new BigintDecimal("200.75");
const gasFee = new BigintDecimal("0.005");

// Addition
const newBalance = walletBalance.plus(tradeAmount); // "1701.25"

// Subtraction
const finalBalance = newBalance.minus(gasFee); // "1701.245"

// Multiplication
const price = new BigintDecimal("45000.50");
const amount = new BigintDecimal("0.5");
const totalValue = price.times(amount); // "22500.25"

// Division
const totalTokens = new BigintDecimal("1000");
const splits = new BigintDecimal("3");
const perPerson = totalTokens.div(splits); // "333.33333333333333333333"

```

### Chaining Operations

Every math operation returns a new `BigintDecimal` instance, allowing you to cleanly chain complex formulas.

```typescript
const result = new BigintDecimal("100")
  .plus("50.5")
  .times("2")
  .minus("1.1")
  .div("2");

console.log(result.toString()); // "149.95"

```

### Comparisons

Easily compare values without precision loss.

```typescript
const requiredMargin = new BigintDecimal("1000.00");
const userBalance = new BigintDecimal("999.99");

userBalance.gt(requiredMargin);  // false (Greater Than)
userBalance.gte(requiredMargin); // false (Greater Than or Equal)
userBalance.lt(requiredMargin);  // true  (Less Than)
userBalance.lte(requiredMargin); // true  (Less Than or Equal)
userBalance.eq("999.99");        // true  (Equal)

```

### Rounding

Round to a specific number of decimal places. Standard rounding rules apply (halves round up).

```typescript
const fee = new BigintDecimal("1.555");
console.log(fee.round(2).toString()); // "1.56"
console.log(fee.round(0).toString()); // "2"

```

### Managing Precision (For Division)

Division operations can result in infinitely repeating decimals. `BigintDecimal` handles this by defaulting to a maximum precision of `20` decimal places. You can adjust this globally or per instance.

```typescript
// Change instance precision
const exactDiv = new BigintDecimal("1");
exactDiv.setPrecision(5);
console.log(exactDiv.div("3").toString()); // "0.33333"

// Change global precision for all new instances
BigintDecimal.setPrecisionGlobal(2);
console.log(new BigintDecimal("1").div("3").toString()); // "0.33"

```

## Supported Inputs

`BigintDecimal` safely parses a wide variety of inputs, including scientific notation and massive integers.

```typescript
new BigintDecimal("1e-18"); // "0.000000000000000001"
new BigintDecimal("9999999999999999999999999999"); // Handles massive numbers natively
new BigintDecimal("-0.0005"); // Negative floats
new BigintDecimal(100n); // Native BigInt

```

*Note: While passing `number` primitives (like `new BigintDecimal(100)`) is supported, passing them as strings (`"100"`) is strongly recommended to avoid JS evaluating floating points before the class receives them.*

## License

MIT
