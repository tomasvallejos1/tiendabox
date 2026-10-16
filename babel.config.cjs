// Babel solo lo usa Jest (via babel-jest) para transpilar TypeScript al vuelo.
// Ojo: Babel quita los tipos sin verificarlos; la verificacion la hace tsc.
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }],
    ["@babel/preset-typescript", { allowDeclareFields: true }],
  ],
};
