// bunchee.config.ts
export default {
  entry: "src/index.ts",
  format: ["esm"],
  target: "node18",
  dts: true,
  minify: true,
  sourcemap: true,
  shebang: true,
};
