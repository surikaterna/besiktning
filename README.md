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

Each decorator accepts a data object, inspired by the data model of InfluxDB:

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

`withMeter` as a decorator:

```typescript
class MyClass {
  @withMeter({
    measurement: 'example',
    key: 'hello',
    tags: (x, y, z) => {
      // same arguments as myMethod below
      // logic to compute tags
      return computedTags;
    }
  })
  myMethod(x, y, z) {
    // Implementation
  }
}
const myInstance = new MyClass();
myInstance.myMethod(one, 2, 'three');
```

`withMeter` as a regular function wrapper:

```typescript
const measuredMyFunction = withMeter({
  measurement: 'myMeasurement',
  key: 'myKey',
  tags: (x, y, z) => {
    // same arguments as the arrow function below
    // logic to compute tags
    return computedTags;
  }
})((x, y, z) => {
    /* Implementation */
});
// ...
measuredMyFunction(one, 2, 'three');
```

The codebase is tested extensively, and the test cases may serve as further examples.
