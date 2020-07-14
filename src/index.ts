import { withGauge, withTimer, withMeter, withExceptionMeter } from './decorators';
import Collector from './Collector';
import telegraf from './collectors/telegraf';

export { withGauge, withTimer, withMeter, withExceptionMeter, Collector, telegraf };
