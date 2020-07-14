import { MeasurementCollector } from './types';

interface Besiktning {
  collect: MeasurementCollector | undefined;
}

declare global {
  var __besiktning: Besiktning;
}

export {};
