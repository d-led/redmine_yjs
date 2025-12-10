// Cucumber configuration
// See: https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md

const common = {
  requireModule: ['ts-node/register'],
  require: ['src/**/*.ts'],
  format: [
    'progress-bar',
    'html:reports/cucumber-report.html',
  ],
  formatOptions: {
    snippetInterface: 'async-await',
  },
  publishQuiet: true,
};

module.exports = {
  default: {
    ...common,
    paths: ['features/**/*.feature'],
  },
  // Run specific tag
  ui: {
    ...common,
    paths: ['features/**/*.feature'],
    tags: '@ui',
  },
  concurrent: {
    ...common,
    paths: ['features/**/*.feature'],
    tags: '@concurrent',
  },
};

