# NodeRuntimeMetrics

`NodeRuntimeMetrics` is a generic runtime collector for Node.js process health and throughput datapoints.
It emits key/value measurements through the existing `Collector` pipeline.

## Usage

```typescript
import { Collector, telegrafFactory, NodeRuntimeMetrics } from 'besiktning';

const telegraf = telegrafFactory({
  uri: process.env.NODE_TELEGRAF_URI || 'udp://:8094',
  bufferSize: parseInt(process.env.NODE_TELEGRAF_BUFFER_SIZE, 10) || 1,
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

## Constructor options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `measurement` | `string` | `node_runtime` | Measurement name used for all emitted runtime metrics. |
| `tags` | `Dictionary<string>` | `undefined` | Static tags attached to every metric from this instance. `hostname` is always added as a permanent tag. If `tags.hostname` is provided, that value is used. |
| `sampleIntervalMs` | `number` | `5000` | Interval for periodic background sampling after `start()` is called. Invalid/non-positive values fall back to default. |
| `eventLoopResolutionMs` | `number` | `20` | Resolution for event loop delay histogram sampling. Invalid/non-positive values fall back to default. The effective internal resolution is rounded and clamped to a minimum of `1` ms. |
| `eventLoopBlockingThresholdMs` | `number` | `50` | Threshold used for `event_loop.blocked` (`1` when max lag in sample window is at or above threshold). |
| `singleThreadCpuThreshold` | `number` | `0.9` | Process core utilization threshold used for `cpu.single_thread_limited` detection. Clamped to `[0..1]`. |
| `spareCpuHeadroomThreshold` | `number` | `0.25` | Required host CPU headroom for `cpu.single_thread_limited` to be set. Clamped to `[0..1]`. |

## Lifecycle

- `new NodeRuntimeMetrics(...)` creates an idle collector instance.
- `start()` begins continuous background collection (idempotent: repeated calls are ignored).
- `dispose()` stops background collection and disconnects internal observers.


## What it measures

- event loop lag percentiles and max
- event loop utilization
- event loop blocking indicator
- GC pauses (count / total / max / mean and per-pause event)
- process CPU vs host CPU and single-thread limit indicators
- process memory datapoints

## Emitted metrics

All metrics are emitted under the configured `measurement` (default `node_runtime`), with the metric name as the field key.

`hostname` is always included as a permanent tag on emitted metrics. User-provided tags are merged on top.

| Metric key | Type / unit | Emitted by | Notes |
| --- | --- | --- | --- |
| `event_loop.samples` | count | periodic sampler (`start`) | Number of histogram samples in the interval window. |
| `event_loop.lag.mean_ms` | milliseconds | periodic sampler (`start`) | Mean event loop lag in current sample window. |
| `event_loop.lag.p95_ms` | milliseconds | periodic sampler (`start`) | 95th percentile event loop lag. |
| `event_loop.lag.p99_ms` | milliseconds | periodic sampler (`start`) | 99th percentile event loop lag. |
| `event_loop.lag.max_ms` | milliseconds | periodic sampler (`start`) | Max event loop lag in current sample window. |
| `event_loop.blocked` | flag (`0`/`1`) | periodic sampler (`start`) | `1` when max lag is at or above `eventLoopBlockingThresholdMs`. |
| `event_loop.utilization` | ratio | periodic sampler (`start`) | Event loop utilization in `[0..1]` (clamped). |
| `cpu.process.core_utilization` | ratio | periodic sampler (`start`) | Process CPU usage as fraction of one core. |
| `cpu.process.machine_utilization` | ratio | periodic sampler (`start`) | Process CPU usage as fraction of machine CPU capacity. |
| `cpu.host.utilization` | ratio | periodic sampler (`start`) | Host CPU utilization from aggregate CPU deltas. |
| `cpu.host.headroom` | ratio | periodic sampler (`start`) | `1 - cpu.host.utilization`. |
| `cpu.single_thread_limited` | flag (`0`/`1`) | periodic sampler (`start`) | `1` when process is near one-core saturation while host still has headroom. |
| `cpu.machine.cores` | count | periodic sampler (`start`) | Number of logical CPU cores. |
| `memory.rss_bytes` | bytes | periodic sampler (`start`) | Resident set size. |
| `memory.heap.total_bytes` | bytes | periodic sampler (`start`) | Total V8 heap size. |
| `memory.heap.used_bytes` | bytes | periodic sampler (`start`) | Used V8 heap size. |
| `memory.external_bytes` | bytes | periodic sampler (`start`) | External memory tracked by V8. |
| `memory.array_buffers_bytes` | bytes | periodic sampler (`start`) | ArrayBuffer memory (emitted when available in runtime). |
| `gc.pause.count` | count | periodic sampler (`start`) | Number of GC pauses observed during the interval window. |
| `gc.pause.total_ms` | milliseconds | periodic sampler (`start`) | Sum of GC pause durations in current window. |
| `gc.pause.max_ms` | milliseconds | periodic sampler (`start`) | Max GC pause duration in current window. |
| `gc.pause.mean_ms` | milliseconds | periodic sampler (`start`) | Mean GC pause duration in current window. |
| `gc.pause_ms` | milliseconds | GC performance observer | Emitted per GC event, with `kind` tag (`major`, `minor`, `incremental`, `weakcb`, `unknown`). |

## Grafana starter dashboard

A sample dashboard is included at:

- `src/runtimeMetrics/grafana-dashboard.sample.json`

Import it in Grafana, select your InfluxDB datasource, and adjust the `measurement` template variable if you use a different measurement name than `node_runtime`.

The sample dashboard includes a `hostname` selector that filters all panels by the emitted hostname tag.
