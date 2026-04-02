import { InternalMeasurementCollector } from './types';

interface Besiktning {
  collect: InternalMeasurementCollector | undefined;
}

declare global {
  var __besiktning: Besiktning;
}

export {};
