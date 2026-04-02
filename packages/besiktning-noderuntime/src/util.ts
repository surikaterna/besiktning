import os from 'os';
import * as perfHooks from 'perf_hooks';
import { CpuSnapshot, EventLoopUtilizationSnapshot } from './types';

interface PerfHooksConstants {
  NODE_PERFORMANCE_GC_MAJOR?: number;
  NODE_PERFORMANCE_GC_MINOR?: number;
  NODE_PERFORMANCE_GC_INCREMENTAL?: number;
  NODE_PERFORMANCE_GC_WEAKCB?: number;
}

const performance = perfHooks.performance;
const perfConstants = (perfHooks as typeof perfHooks & { constants?: PerfHooksConstants }).constants;

export function clamp(value: number, min: number = 0, max: number = 1): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function ensurePositive(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function toMilliseconds(nanoseconds: number): number {
  if (!Number.isFinite(nanoseconds)) {
    return 0;
  }
  return Math.max(0, nanoseconds) / 10 ** 6;
}

export function getCpuSnapshot(): CpuSnapshot {
  return getCpuSnapshotAndCount().snapshot;
}

export function getCpuSnapshotAndCount(): { snapshot: CpuSnapshot; count: number } {
  const cpus = os.cpus();
  const snapshot = cpus.reduce(
    (nextSnapshot: CpuSnapshot, cpu) => {
      const cpuTotal = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
      return {
        idle: nextSnapshot.idle + cpu.times.idle,
        total: nextSnapshot.total + cpuTotal
      };
    },
    { idle: 0, total: 0 }
  );
  return {
    snapshot,
    count: Math.max(1, cpus.length)
  };
}

export function getGcKind(kind: number | undefined): string {
  const gcMajor = perfConstants?.NODE_PERFORMANCE_GC_MAJOR;
  if (typeof gcMajor === 'number' && kind === gcMajor) {
    return 'major';
  }
  const gcMinor = perfConstants?.NODE_PERFORMANCE_GC_MINOR;
  if (typeof gcMinor === 'number' && kind === gcMinor) {
    return 'minor';
  }
  const gcIncremental = perfConstants?.NODE_PERFORMANCE_GC_INCREMENTAL;
  if (typeof gcIncremental === 'number' && kind === gcIncremental) {
    return 'incremental';
  }
  const gcWeakcb = perfConstants?.NODE_PERFORMANCE_GC_WEAKCB;
  if (typeof gcWeakcb === 'number' && kind === gcWeakcb) {
    return 'weakcb';
  }
  return 'unknown';
}

export function getEventLoopUtilization(previous?: EventLoopUtilizationSnapshot): EventLoopUtilizationSnapshot {
  const perf = performance as unknown as {
    eventLoopUtilization?: (utilization1?: EventLoopUtilizationSnapshot) => EventLoopUtilizationSnapshot;
  };
  if (typeof perf.eventLoopUtilization !== 'function') {
    return { idle: 0, active: 0, utilization: 0 };
  }
  return perf.eventLoopUtilization(previous);
}

export function getHistogramCount(histogram: unknown): number {
  const count = (histogram as { count?: number }).count;
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return 0;
  }
  return Math.max(0, count);
}
