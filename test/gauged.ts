import chai from 'chai';
import { Measured, Gauged } from '@/decorators';

const should = chai.should();

describe('@Gauged', function () {
  it('should collect `Promise`-wrapped return values', async function () {
    const gaugedNumbers: number[] = [];
    @Measured(({ value }) => gaugedNumbers.push(value as number))
    class Test {
      @Gauged({
        measurement: 'gauged',
        key: 'number'
      })
      add(a: number, b: number): Promise<number> {
        return Promise.resolve(a + b);
      }
    }
    const testInstance = new Test();
    const expectedSum = 15;
    const promises = [
      [1, 2],
      [2, 3],
      [3, 4],
    ].map((args) => testInstance.add.apply(testInstance, args as [number, number]));
    await Promise.all(promises);
    const gaugedSum = gaugedNumbers.reduce((sum: number, num: number) => sum + num, 0);
    gaugedSum.should.be.equal(expectedSum);
  });

  it('should collect return values in a `Promise` chain', async function () {
    const gaugedStrings: string[] = [];
    let index = 0;
    @Measured(({ value }) => gaugedStrings.push(value as string))
    class Test {
      @Gauged({
        measurement: 'gauged',
        key: 'string',
        endomorphism: value => `${value}_${index++}`
      })
      echoIndexed(msg: string): string {
        return msg;
      }
      ignore(msg: string): void {}
      @Gauged({
        measurement: 'gauged',
        key: 'string',
      })
      echo(msg: string): string {
        return msg;
      }
    }
    const testInstance = new Test();
    await Promise.resolve()
      .then(() => testInstance.echoIndexed('a'))
      .then(() => testInstance.ignore('a'))
      .then(() => testInstance.echoIndexed('b'))
      .then(() => testInstance.ignore('b'))
      .then(() => testInstance.echo('b'))
      .then(() => testInstance.ignore('c'))
      .then(() => testInstance.echoIndexed('c'))
      .then(() => testInstance.ignore('d'))
      .then(() => testInstance.echo('d'));
    const expectedStrings: string[] = (['a_0', 'b_1', 'b', 'c_2', 'd']);
    gaugedStrings.should.be.eql(expectedStrings);
  });
});
