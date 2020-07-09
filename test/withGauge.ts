import chai from 'chai';
import Collector from '@/Collector';
import { withGauge } from '@/decorators';
import { FieldValue } from '@/types';

const should = chai.should();
let gaugedValues: Array<FieldValue | Promise<FieldValue>> = [];

describe('@withGauge', function () {

  before(function () {
    Collector.set(({ value }) => gaugedValues.push(value));
  })

  beforeEach(function () {
    gaugedValues = [];
  })

  it('should collect `Promise`-wrapped return values', async function () {
    class Test {
      @withGauge({
        measurement: 'with_gauge',
        key: 'number'
      })
      add(a: number, b: number): Promise<number> {
        return Promise.resolve(a + b);
      }
    }
    const test = new Test();
    const expectedSum = 15;
    const promises = [
      [1, 2],
      [2, 3],
      [3, 4],
    ].map((args) => test.add(...args as [number, number]));
    await Promise.all(promises);
    const sum = (gaugedValues as number[]).reduce((sum: number, num: number) => sum + num, 0);
    sum.should.be.equal(expectedSum);
  });

  it('should collect return values in a `Promise` chain', async function () {
    let index = 0;
    class Test {
      @withGauge({
        measurement: 'with_gauge',
        key: 'string',
        apply: (value: FieldValue) => `${value}_${index++}`
      })
      echoIndexed(msg: string): string {
        return msg;
      }
      ignore(msg: string): void {}
      @withGauge({
        measurement: 'with_gauge',
        key: 'some_other_string',
      })
      echo(msg: string): string {
        return msg;
      }
    }
    const test = new Test();
    await Promise.resolve()
      .then(() => test.echoIndexed('a'))
      .then(() => test.ignore('a'))
      .then(() => test.echoIndexed('b'))
      .then(() => test.ignore('b'))
      .then(() => test.echo('b'))
      .then(() => test.ignore('c'))
      .then(() => test.echoIndexed('c'))
      .then(() => test.ignore('d'))
      .then(() => test.echo('d'));
    const expectedStrings = ['a_0', 'b_1', 'b', 'c_2', 'd'];
    gaugedValues.should.be.eql(expectedStrings);
  });

  it('should work with synchronous functions', function () {
    const gaugedAdder = withGauge({
      measurement: 'with_gauge',
      key: 'number'
    })((a: number, b:number): number => a + b);
    const expectedNumbers = [];
    expectedNumbers.push(gaugedAdder(1, 1));
    expectedNumbers.push(gaugedAdder(2, 2));
    expectedNumbers.push(gaugedAdder(3, 3));
    gaugedValues.should.be.eql(expectedNumbers);
  });

  it('should work with asynchronous functions', async function () {
    const gaugedAdder = withGauge({
      measurement: 'with_gauge',
      key: 'number'
    })((a: number, b:number): Promise<number> => new Promise(resolve => setTimeout(() => resolve(a + b), 1000 + a + b)));
    const expectedNumbers = [];
    this.timeout(0);
    expectedNumbers.push(gaugedAdder(1, 1));
    expectedNumbers.push(gaugedAdder(2, 2));
    expectedNumbers.push(gaugedAdder(3, 3));
    gaugedValues.should.be.eql(await Promise.all(expectedNumbers));
  });
});
