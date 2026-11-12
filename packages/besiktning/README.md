# besiktning

TS + Decorators to get Metrics with Node and Telegraf

## Install

```bash
$ npm install besiktning
```

[slf](https://www.npmjs.com/package/slf) is a peer-dependency:

```bash
$ npm install slf
```

## API

### Tracing (Node and browsers)

`besiktning/tracing` is a browser-safe facade over `@opentelemetry/api`. It
re-exports the native API (including `Span`, `Context`, `trace`, `context` and
`propagation`) and adds `createTracing` and `withActiveSpan`. It does not load the
metrics entry, register a provider, install a context manager/propagator, or configure an SDK,
exporter or endpoint. Those are application responsibilities. With no provider,
spans are OpenTelemetry no-ops. Async context continuity requires an
application-installed context manager appropriate to the runtime.

```typescript
import { createTracing } from 'besiktning/tracing';

const { tracer, withActiveSpan } = createTracing('lx.commands', '1.0.0');
const value = withActiveSpan('calculate', span => {
  span.setAttribute('input.count', 3);
  return 42;
});
const loaded = await withActiveSpan('command.submit', async span => {
  return await loadData();
});
```

`createTracing(scopeName, version?)` gets the application's native tracer via
`trace.getTracer` and returns it with a destructuring-safe bound helper:
`withActiveSpan(name, callback, options?, parentContext?)`. Use a fixed subsystem
scope (like a logger name), not a tenant/request name. No provider is initialized;
OpenTelemetry also supports registering the application provider later.

The callback receives the native span. Synchronous values/throws stay
synchronous; Promises/thenables produce a Promise preserving the resolved value
or rejection reason (not Promise identity). The helper owns the span and ends
it once on completion: do not end it inside the callback, and return/await all
work belonging to it. Failures (including thrown/rejected cancellation) set ERROR
status; Error and string failures are also recorded as exceptions. Other thrown
values are preserved without inventing exception data. Success leaves status
unchanged. Options and explicit parent context are native OpenTelemetry types.
Browser async continuity still depends on the application's context manager;
the helper does not patch async APIs.

The original explicit-tracer helper remains available, including for injected
tracers. Native options support links and explicit new roots:

```typescript
import { ROOT_CONTEXT, withActiveSpan as withExplicitSpan } from 'besiktning/tracing';

const previousSpan = tracer.startSpan('previous');
const previousSpanContext = previousSpan.spanContext();
previousSpan.end();
withExplicitSpan(tracer, 'new-root', span => span.addEvent('started'), {
  links: [{ context: previousSpanContext }]
}, ROOT_CONTEXT);
```

Its signature remains `withActiveSpan(tracer, name, callback, options?, parentContext?)`;
the bound helper accepts the same native options and context.

For callback/event adapters, use native context capture, binding and propagation;
there is no package-specific trace model:

```typescript
import { context, propagation, ROOT_CONTEXT, trace } from 'besiktning/tracing';

const captured = context.active();
const callback = context.bind(captured, onResult);
registerCallback(callback); // binding preserves receiver and arguments
const carrier: Record<string, string> = {};
propagation.inject(captured, carrier); // requires an application propagator
const parent = propagation.extract(ROOT_CONTEXT, carrier);
const span = tracer.startSpan('callback-operation', {}, parent);
context.with(trace.setSpan(parent, span), () => handleResult());
span.end(); // manual spans have application-owned lifetimes
```

The metrics root and `besiktning/lib/*` imports remain available, including
extensionless and explicit `.js` deep imports. The tracing subpath supports
CommonJS, native Node ESM and browser bundlers; only this entry is intended as
browser-safe.

Initialize `besiktning`:

```typescript
import { Collector, telegrafFactory } from 'besiktning';

const telegraf = telegrafFactory({
  uri: process.env.NODE_TELEGRAF_URI || 'udp://:8094',
  bufferSize: parseInt(process.env.NODE_TELEGRAF_BUFFER_SIZE, 10) || 1,
  flushInterval: parseInt(process.env.NODE_TELEGRAF_FLUSH_INTERVAL, 10 * 1000) || -1,
  prefix: 'myMeasurementPrefix'
});
Collector.set(telegraf);
```

The API provides four method decorators for performing measurements:

-   `withExceptionMeter`: counts number of exceptions thrown by the target function
-   `withGauge`: collects return value of the target function
-   `withMeter`: counts number of invocations of the target function
-   `withTimer`: collects execution time of the target function

The decorators work with regular functions as well.

Each decorator accepts an object with structure based on the data model of InfluxDB:

```typescript
type FieldValue = NonNullable<number | bigint | string | boolean>;
type Dynamic<T> = T | ((...args: any) => T);
type Dictionary<T> = { [key: string]: T };

interface DecoratorPayload {
  measurement: Dynamic<string>;
  key: Dynamic<string>;
  tags?: Dynamic<Dictionary<string>>;
  apply?: (value: FieldValue) => FieldValue;
}
```

## Examples

Measure number of exceptions:

```typescript
class Vehicle {
  @withExceptionMeter({
    measurement: 'vehicle',
    key: 'exception',
    tags: { brand: 'myBrand' }
  })
  start(): void {
    // ...
    throw new Error('Vehicle failed to start.')
    // ...
  }
}
```

Measure number of method invocations:

```typescript
class Store {
  @withMeter({
    measurement: 'store',
    key: 'membership_count',
    tags: person => ({
      age_group: getAgeGroup(person.age),
      region: getRegion(person.address)
    })
  })
  registerMembership(person: Person): void {
    // ...
  }
}
```

Measure return value of a method:

```typescript
class Store {
  @withGauge({
    measurement: 'store',
    key: 'income',
    tags: item => item
  })
  sell(item: Item): number {
    // ...
  }
}
```

Measure execution time of a method:

```typescript
class Fibonacci {
  @withTimer({
    measurement: 'fibonacci',
    key: getKey()
  })
  next(): number {
    // ...
  }
}
```

The decorators can also wrap regular functions:

```typescript
let i = 0
const counter = () => i++;
const gaugedCounter = withGauge({
  measurement: 'regular_function',
  key: 'count'
})(counter)
gaugedCounter();
```

The codebase is tested extensively, and the test cases may serve as further examples.
