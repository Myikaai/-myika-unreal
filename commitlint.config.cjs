/**
 * Conventional Commits configuration for Myika Unreal.
 * Documents the rule set; not yet wired into a Husky hook.
 *
 * To enable enforcement locally:
 *   cd desktop && npm i -D @commitlint/cli @commitlint/config-conventional husky
 *   npx husky init
 *   echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
 *
 * See CONTRIBUTING.md for the full spec.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'bridge',
        'desktop',
        'plugin',
        'tools',
        'docs',
        'security',
        'memory',
        'repo',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
};
