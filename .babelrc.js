const dependencies = require('./package').dependencies || {}

const NODE_ENV = process.env.NODE_ENV || 'development'
const __PROD__ = NODE_ENV === 'production'
const __TEST__ = NODE_ENV === 'test'

module.exports = {
  comments: !__PROD__,
  ignore: __TEST__ ? undefined : [/\.spec\.js$/],
  plugins: [
    '@babel/plugin-proposal-class-properties',
    'lodash',
  ],
  presets: [
    [
      '@babel/env',
      {
        debug: !__TEST__,
        loose: true,
        forceAllTransforms: true, // ES5 compatibility, requires for create-react-app
        shippedProposals: true,
        targets: {
          browsers: '>2%',
          node: '4',
        },
        useBuiltIns: '@babel/polyfill' in dependencies && 'usage',
      },
    ],
    '@babel/flow',
  ],
}