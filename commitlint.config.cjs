module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: ['commitlint-plugin-function-rules'],
  rules: {
    'header-max-length': [2, 'always', 180],
    'subject-case': [0, 'never'],
    'footer-max-line-length': [0, 'always'],
    'body-max-line-length': [0, 'always'],
  },
};
