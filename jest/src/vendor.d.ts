declare module 'jest-circus/runner' {
  function run(
    globalConfig,
    config,
    environment,
    runtime,
    testPath,
    sendMessageWrapper
  ): Promise<import('@jest/test-result').TestResult>;
  export = run;
}
