const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, copyFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const packageDir = path.resolve(__dirname, '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'besiktning-tracing-'));
const run = (command, args, cwd = scratch) => execFileSync(command, args, { cwd, encoding: 'utf8' });

try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], packageDir));
  writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({ private: true }));
  run('npm', ['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', path.join(scratch, packed[0].filename)]);
  const smoke = `
    import { trace, context, propagation, withActiveSpan } from 'besiktning/tracing';
    import * as native from '@opentelemetry/api';
    if (trace !== native.trace || context !== native.context || propagation !== native.propagation) throw Error('API mismatch');
    const result = withActiveSpan(trace.getTracer('browser'), 'smoke', span => {
      if (span.isRecording()) throw Error('unexpected provider');
      return 42;
    });
    if (result !== 42) throw Error('return mismatch');
  `;
  const bundle = buildSync({
    stdin: { contents: smoke, resolveDir: scratch },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
    metafile: true
  });
  assert(!Object.keys(bundle.metafile.inputs).some((file) => /sdk-|node:|Collector|telegraf/.test(file)));
  vm.runInNewContext(bundle.outputFiles[0].text, {});
  run(process.execPath, [
    '-e',
    `
    const assert = require('node:assert/strict');
    assert.equal(typeof require('besiktning').Collector, 'function');
    assert.equal(require('besiktning/lib'), require('besiktning'));
    assert.equal(typeof require('besiktning/lib/Collector').default, 'function');
    assert.equal(typeof require('besiktning/lib/Collector.js').default, 'function');
    assert.equal(typeof require('besiktning/lib/instruments/timer').default, 'function');
    assert.equal(require('besiktning/package.json').name, 'besiktning');
    assert.equal(require('besiktning/tracing').trace, require('@opentelemetry/api').trace);
  `
  ]);
  run(process.execPath, [
    '--input-type=module',
    '-e',
    `
    import { trace, withActiveSpan } from 'besiktning/tracing';
    import * as native from '@opentelemetry/api';
    if (trace !== native.trace || withActiveSpan(trace.getTracer('esm'), 'esm', () => 42) !== 42) {
      throw Error('native ESM import failed');
    }
  `
  ]);
  writeFileSync(
    path.join(scratch, 'consumer.ts'),
    `
    import { withActiveSpan, trace, context, type Span, type Context } from 'besiktning/tracing';
    import type { Span as NativeSpan, Context as NativeContext } from '@opentelemetry/api';
    const captured: NativeContext = context.active() satisfies Context;
    const tracer = trace.getTracer('types');
    const n: number = withActiveSpan(tracer, 'sync', (span: Span): number => {
      const native: NativeSpan = span;
      native.setAttribute('count', 1);
      return 1;
    }, {}, captured);
    const p: Promise<number> = withActiveSpan(tracer, 'async', async () => n);
    void p;
  `
  );
  writeFileSync(
    path.join(scratch, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'NodeNext',
        target: 'ES2022',
        types: [],
        lib: ['ES2022', 'DOM']
      },
      files: ['consumer.ts', 'consumer.mts']
    })
  );
  copyFileSync(path.join(scratch, 'consumer.ts'), path.join(scratch, 'consumer.mts'));
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', scratch]);
  console.log('Packed browser import, native singleton, legacy imports and consumer types: PASS');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
