declare module 'jest-circus/runner' {
  function run(
    globalConfig,
    config,
    environment,
    runtime,
    testPath,
    sendMessageWrapper
  ): Promise<any>;
  export = run;
}

