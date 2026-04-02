import Collector from '../src/Collector';
import NodeRuntimeMetrics from '../src/runtimeMetrics';
import { EvaluatedMeasurementPayload } from '../src/types';

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
    keys.should.include('event_loop.lag.mean_ms');
    keys.should.include('event_loop.blocked');
    keys.should.include('cpu.process.core_utilization');
    keys.should.include('cpu.single_thread_limited');
    keys.should.include('memory.rss_bytes');
    keys.should.include('gc.pause.count');
  });
});
