import os from 'os';
import { performance } from 'perf_hooks';
import { CpuSnapshot, EventLoopUtilizationSnapshot } from './types';

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
  const cpus = os.cpus();
  return cpus.reduce(
    (snapshot: CpuSnapshot, cpu) => {
      const cpuTotal = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
      return {
        idle: snapshot.idle + cpu.times.idle,
        total: snapshot.total + cpuTotal
      };
    },
    { idle: 0, total: 0 }
  );
}

export function getCpuCount(): number {
  return Math.max(1, os.cpus().length);
}

export function getGcKind(kind: number | undefined): string {
  if (kind === 1) {
    return 'major';
  }
  if (kind === 2) {
    return 'minor';
  }
  if (kind === 4) {
    return 'incremental';
  }
  if (kind === 8) {
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
