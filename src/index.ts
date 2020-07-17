import { withGauge, withTimer, withMeter, withExceptionMeter } from './decorators';
import Collector from './Collector';
import telegrafFactory from './collectors/telegrafFactory';

export { withGauge, withTimer, withMeter, withExceptionMeter, Collector, telegrafFactory };
