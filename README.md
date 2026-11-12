# besiktning

TS decorators for collecting Node metrics with OpenTelemetry or Telegraf.

## Install

```bash
$ npm install besiktning
```

[slf](https://www.npmjs.com/package/slf) is a required peer dependency:

```bash
$ npm install slf
```

The OpenTelemetry API is an optional peer dependency. Install it when using `otelFactory`; Telegraf-only consumers do not need it:

```bash
$ npm install @opentelemetry/api
```

## API

Initialize `besiktning` with the OpenTelemetry metrics API. Configure an SDK `MeterProvider` and exporter in the application before creating the collector.

```typescript
import { Collector, otelFactory } from 'besiktning';

Collector.set(
  otelFactory({
    meterName: 'my-service',
    prefix: 'my_service'
  })
);
```

The collector maps meters and exception meters to counters, timers to nanosecond histograms, and gauges/runtime samples to gauges. Measurement names and keys form the OTEL metric name (`<prefix>.<measurement>.<key>`), while tags become attributes.

The legacy Telegraf collector remains available:

```typescript
import { Collector, telegrafFactory, NodeRuntimeMetrics } from 'besiktning';

const telegraf = telegrafFactory({
  uri: process.env.NODE_TELEGRAF_URI || 'udp://:8094',
  bufferSize: parseInt(process.env.NODE_TELEGRAF_BUFFER_SIZE, 10) || 1,
  flushInterval: parseInt(process.env.NODE_TELEGRAF_FLUSH_INTERVAL, 10 * 1000) || -1,
  prefix: 'myMeasurementPrefix'
});
Collector.set(telegraf);

const runtimeMetrics = new NodeRuntimeMetrics({
  measurement: 'node_runtime',
  tags: { service: 'my-service' },
  sampleIntervalMs: 5000,
  eventLoopBlockingThresholdMs: 50
});
runtimeMetrics.start();
```

The API provides four method decorators for performing measurements:

- `withExceptionMeter`: counts number of exceptions thrown by the target function
- `withGauge`: collects return value of the target function
- `withMeter`: counts number of invocations of the target function
- `withTimer`: collects execution time of the target function

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

For `NodeRuntimeMetrics` (runtime collector) usage, options, emitted metrics, and lifecycle, see [`src/runtimeMetrics/README.md`](src/runtimeMetrics/README.md).

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

Measure generic runtime metrics passively:

```typescript
class Runtime {
  private readonly metrics = new NodeRuntimeMetrics({
    measurement: 'node_runtime',
    sampleIntervalMs: 5000
  });

  start(): void {
    this.metrics.start();
  }

  dispose(): void {
    this.metrics.dispose();
  }
}
```

The codebase is tested extensively, and the test cases may serve as further examples.
