import { monitorEventLoopDelay, PerformanceObserver } from 'perf_hooks';
import Collector from '../Collector';
import { Dictionary, FieldValue } from '../types';
import { EventLoopUtilizationSnapshot, CpuSnapshot, GcSnapshot, RuntimeMetricsOptions } from './types';
import { clamp, ensurePositive, toMilliseconds, getCpuSnapshot, getCpuCount, getGcKind, getEventLoopUtilization, getHistogramCount } from './util';
type EventLoopDelayHistogram = ReturnType<typeof monitorEventLoopDelay>;

export default class NodeRuntimeMetrics {
  private readonly measurement: string;
  private readonly staticTags?: Dictionary<string>;
  private readonly sampleIntervalMs: number;
  private readonly eventLoopBlockingThresholdMs: number;
  private readonly singleThreadCpuThreshold: number;
  private readonly spareCpuHeadroomThreshold: number;
  private readonly eventLoopHistogram: EventLoopDelayHistogram;

  private sampleHandle?: NodeJS.Timeout;
  private gcObserver?: PerformanceObserver;
  private gcSnapshot: GcSnapshot = { count: 0, totalMs: 0, maxMs: 0 };
  private previousElu: EventLoopUtilizationSnapshot = getEventLoopUtilization();
  private previousProcessCpuUsage: NodeJS.CpuUsage = process.cpuUsage();
  private previousHostCpu: CpuSnapshot = getCpuSnapshot();
  private previousCpuWallClockMs: number = Date.now();

  constructor(options: RuntimeMetricsOptions = {}) {
    this.measurement = options.measurement ?? 'node_runtime';
    this.staticTags = options.tags;
    this.sampleIntervalMs = ensurePositive(options.sampleIntervalMs, 5000);
    const eventLoopResolutionMs = ensurePositive(options.eventLoopResolutionMs, 20);
    this.eventLoopBlockingThresholdMs = ensurePositive(options.eventLoopBlockingThresholdMs, 50);
    this.singleThreadCpuThreshold = clamp(options.singleThreadCpuThreshold ?? 0.9, 0, 1);
    this.spareCpuHeadroomThreshold = clamp(options.spareCpuHeadroomThreshold ?? 0.25, 0, 1);
    this.eventLoopHistogram = monitorEventLoopDelay({ resolution: Math.round(eventLoopResolutionMs) });
  }

  start(): void {
    if (this.sampleHandle) {
      return;
    }
    this.previousElu = getEventLoopUtilization();
    this.previousProcessCpuUsage = process.cpuUsage();
    this.previousHostCpu = getCpuSnapshot();
    this.previousCpuWallClockMs = Date.now();
    this.eventLoopHistogram.enable();
    this.installGcObserver();
    this.sampleHandle = setInterval(() => this.sampleNow(), this.sampleIntervalMs);
    if (typeof this.sampleHandle.unref === 'function') {
      this.sampleHandle.unref();
    }
  }

  dispose(): void {
    if (this.sampleHandle) {
      clearInterval(this.sampleHandle);
      this.sampleHandle = undefined;
    }
    this.eventLoopHistogram.disable();
    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = undefined;
    }
  }

  private sampleNow(): void {
    this.emitEventLoopMetrics();
    this.emitProcessMetrics();
    this.emitGcMetrics();
  }

  private emitEventLoopMetrics(): void {
    const sampleCount = getHistogramCount(this.eventLoopHistogram);
    const meanMs = sampleCount > 0 ? toMilliseconds(this.eventLoopHistogram.mean) : 0;
    const p95Ms = sampleCount > 0 ? toMilliseconds(this.eventLoopHistogram.percentile(95)) : 0;
    const p99Ms = sampleCount > 0 ? toMilliseconds(this.eventLoopHistogram.percentile(99)) : 0;
    const maxMs = sampleCount > 0 ? toMilliseconds(this.eventLoopHistogram.max) : 0;
    this.emit('event_loop.samples', sampleCount, undefined);
    this.emit('event_loop.lag.mean_ms', meanMs, undefined);
    this.emit('event_loop.lag.p95_ms', p95Ms, undefined);
    this.emit('event_loop.lag.p99_ms', p99Ms, undefined);
    this.emit('event_loop.lag.max_ms', maxMs, undefined);
    this.emit('event_loop.blocked', maxMs >= this.eventLoopBlockingThresholdMs ? 1 : 0, undefined);
    this.eventLoopHistogram.reset();

    const elu = getEventLoopUtilization(this.previousElu);
    this.previousElu = getEventLoopUtilization();
    this.emit('event_loop.utilization', clamp(elu.utilization), undefined);
  }

  private emitProcessMetrics(): void {
    const now = Date.now();
    const elapsedMicros = Math.max(1, now - this.previousCpuWallClockMs) * 1000;
    const currentProcessCpu = process.cpuUsage();
    const processCpuUsedMicros =
      Math.max(0, currentProcessCpu.user - this.previousProcessCpuUsage.user) + Math.max(0, currentProcessCpu.system - this.previousProcessCpuUsage.system);
    this.previousProcessCpuUsage = currentProcessCpu;
    this.previousCpuWallClockMs = now;

    const hostCpuSnapshot = getCpuSnapshot();
    const hostIdleDelta = Math.max(0, hostCpuSnapshot.idle - this.previousHostCpu.idle);
    const hostTotalDelta = Math.max(0, hostCpuSnapshot.total - this.previousHostCpu.total);
    this.previousHostCpu = hostCpuSnapshot;

    const cpuCount = getCpuCount();
    const processCoreUtilization = clamp(processCpuUsedMicros / elapsedMicros, 0, Number.POSITIVE_INFINITY);
    const processMachineUtilization = clamp(processCoreUtilization / cpuCount, 0, Number.POSITIVE_INFINITY);
    const hostUtilization = hostTotalDelta > 0 ? clamp(1 - hostIdleDelta / hostTotalDelta) : 0;
    const hostHeadroom = clamp(1 - hostUtilization);
    const singleThreadLimited =
      processCoreUtilization >= this.singleThreadCpuThreshold && processCoreUtilization <= 1.1 && hostHeadroom >= this.spareCpuHeadroomThreshold ? 1 : 0;

    this.emit('cpu.process.core_utilization', processCoreUtilization, undefined);
    this.emit('cpu.process.machine_utilization', processMachineUtilization, undefined);
    this.emit('cpu.host.utilization', hostUtilization, undefined);
    this.emit('cpu.host.headroom', hostHeadroom, undefined);
    this.emit('cpu.single_thread_limited', singleThreadLimited, undefined);
    this.emit('cpu.machine.cores', cpuCount, undefined);

    const memoryUsage = process.memoryUsage() as NodeJS.MemoryUsage & { arrayBuffers?: number };
    this.emit('memory.rss_bytes', memoryUsage.rss, undefined);
    this.emit('memory.heap.total_bytes', memoryUsage.heapTotal, undefined);
    this.emit('memory.heap.used_bytes', memoryUsage.heapUsed, undefined);
    this.emit('memory.external_bytes', memoryUsage.external, undefined);
    if (typeof memoryUsage.arrayBuffers === 'number') {
      this.emit('memory.array_buffers_bytes', memoryUsage.arrayBuffers, undefined);
    }
  }

  private emitGcMetrics(): void {
    const count = this.gcSnapshot.count;
    const totalMs = this.gcSnapshot.totalMs;
    const maxMs = count > 0 ? this.gcSnapshot.maxMs : 0;
    const meanMs = count > 0 ? totalMs / count : 0;
    this.emit('gc.pause.count', count, undefined);
    this.emit('gc.pause.total_ms', totalMs, undefined);
    this.emit('gc.pause.max_ms', maxMs, undefined);
    this.emit('gc.pause.mean_ms', meanMs, undefined);
    this.gcSnapshot = { count: 0, totalMs: 0, maxMs: 0 };
  }

  private installGcObserver(): void {
    if (this.gcObserver) {
      return;
    }
    const supportedEntryTypes = (PerformanceObserver as typeof PerformanceObserver & { supportedEntryTypes?: string[] }).supportedEntryTypes || [];
    if (!supportedEntryTypes.includes('gc')) {
      return;
    }
    this.gcObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const durationMs = entry.duration;
        this.gcSnapshot.count++;
        this.gcSnapshot.totalMs += durationMs;
        this.gcSnapshot.maxMs = Math.max(this.gcSnapshot.maxMs, durationMs);
        const gcEntry = entry as PerformanceEntry & { kind?: number };
        this.emit('gc.pause_ms', durationMs, { kind: getGcKind(gcEntry.kind) });
      }
    });
    this.gcObserver.observe({ entryTypes: ['gc'] });
  }

  private mergeTags(tags?: Dictionary<string>): Dictionary<string> | undefined {
    const mergedTags: Dictionary<string> = {};
    if (this.staticTags) {
      Object.keys(this.staticTags).forEach(key => {
        mergedTags[key] = this.staticTags![key];
      });
    }
    if (tags) {
      Object.keys(tags).forEach(key => {
        mergedTags[key] = tags[key];
      });
    }
    return Object.keys(mergedTags).length > 0 ? mergedTags : undefined;
  }

  private emit(key: string, value: FieldValue, tags?: Dictionary<string>): void {
    const collect = Collector.get();
    if (!collect) {
      return;
    }
    collect.call(
      undefined,
      {
        measurement: this.measurement,
        key,
        value,
        tags: this.mergeTags(tags),
        instrument: 'runtimeMetrics',
        target: 'NodeRuntimeMetrics'
      },
      []
    );
  }
}

export { RuntimeMetricsOptions } from './types';
