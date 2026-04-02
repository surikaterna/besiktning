import { Dictionary } from 'besiktning';

export interface EventLoopUtilizationSnapshot {
  idle: number;
  active: number;
  utilization: number;
}

export interface CpuSnapshot {
  idle: number;
  total: number;
}

export interface GcSnapshot {
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface RuntimeMetricsOptions {
  measurement?: string;
  tags?: Dictionary<string>;
  sampleIntervalMs?: number;
  eventLoopResolutionMs?: number;
  eventLoopBlockingThresholdMs?: number;
  singleThreadCpuThreshold?: number;
  spareCpuHeadroomThreshold?: number;
}
