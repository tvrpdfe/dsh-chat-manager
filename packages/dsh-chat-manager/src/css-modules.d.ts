/** CSS Module imports resolve to the hashed class-name map produced by scripts/build.mjs. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
