interface Besiktning {
  collect: MeasurementCollector;
}

declare global {
  var __besiktning: Besiktning;
}

export {};
