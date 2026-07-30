module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  testEnvironment: 'node',
  // this service's claim-and-send logic is exercised directly (no mocking needed) in
  // test/notifications.e2e-spec.ts against a real database
  passWithNoTests: true,
};
