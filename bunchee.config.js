export default {
  entries: {
    './src/index': './dist/index',
  },
  format: 'esm',
  target: 'node18',
  external: [
    'bun:sqlite',
    'node:fs',
    'node:fs/promises',
    'node:os',
    'node:path',
    'node:stream',
    'node:util',
    'node:crypto',
    'node:buffer',
    'node:events',
    'node:url',
    'node:querystring',
    'node:http',
    'node:https',
    'node:zlib',
    'node:child_process'
  ],
  dts: true,
  minify: false,
  sourcemap: false,
  clean: true
}