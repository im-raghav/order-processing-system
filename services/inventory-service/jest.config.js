module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  testEnvironment: 'node',
  // this service's logic is the insert-or-return SQL idempotency pattern, which is only
  // meaningfully testable against a real database - see test/inventory.e2e-spec.ts
  passWithNoTests: true,
};
