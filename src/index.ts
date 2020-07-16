import { withGauge, withTimer, withMeter, withExceptionMeter } from './decorators';
import Collector from './Collector';
import telegrafFactory from './collectors/telegrafFactory';

export default { withGauge, withTimer, withMeter, withExceptionMeter, Collector, telegrafFactory };
