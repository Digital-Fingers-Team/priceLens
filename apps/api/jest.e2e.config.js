// End-to-end smoke suite: boots the whole AppModule against the local test
// database. Run with `pnpm --filter @pricelens/api test:e2e` (needs the dev
// stack from `pnpm dev:up` or `pnpm docker:up` + `pnpm test:db:migrate`).
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        // As in `nest build` (nest-cli.json): the OpenAPI document needs the
        // swagger plugin's DTO metadata (test/e2e/openapi.e2e-spec.ts).
        astTransformers: {
          before: ['<rootDir>/test/setup/swagger-transformer.js'],
        },
      },
    ],
  },
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  testTimeout: 60000,
  // Every e2e file truncates and refills the same test database, so files
  // must never run concurrently.
  maxWorkers: 1,
};
