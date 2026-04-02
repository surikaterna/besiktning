import { expect } from 'chai';
import { Collector, EvaluatedMeasurementPayload } from 'besiktning';
import NodeRuntimeMetrics from '../src';

describe('NodeRuntimeMetrics', function () {
  let payloads: EvaluatedMeasurementPayload[] = [];
  let metricsInstances: NodeRuntimeMetrics[] = [];

  beforeEach(function () {
    payloads = [];
    metricsInstances = [];
    Collector.set(payload => payloads.push(payload));
  });

  afterEach(function () {
    metricsInstances.forEach(metrics => metrics.dispose());
  });

  it('should run continuously in background after explicit start', async function () {
    const metrics = new NodeRuntimeMetrics({
      sampleIntervalMs: 10,
      eventLoopResolutionMs: 10,
      measurement: 'runtime'
    });
    metricsInstances.push(metrics);
    metrics.start();
    await new Promise(resolve => setTimeout(resolve, 30));

    const keys = payloads.map(payload => Object.keys(payload.fields)[0]);
    expect(keys).to.include('event_loop.lag.mean_ms');
    expect(keys).to.include('event_loop.blocked');
    expect(keys).to.include('cpu.process.core_utilization');
    expect(keys).to.include('cpu.single_thread_limited');
    expect(keys).to.include('memory.rss_bytes');
    expect(keys).to.include('gc.pause.count');
  });
});
