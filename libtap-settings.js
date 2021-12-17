// This file is needed since version ts-node v10.x.x introduces its own fork of source-map-support that breaks the TS node-tap stacktraces
// reference: https://github.com/TypeStrong/ts-node/issues/1440#issuecomment-937556116

'use strict'

const sourceMapSupport = require('@cspotcode/source-map-support')
const settings = require('libtap/settings')

sourceMapSupport.install({ environment: 'node', hookRequire: true })
const customSettings = {
  stackUtils: settings.stackUtils,
}
customSettings.stackUtils.wrapCallSite = sourceMapSupport.wrapCallSite

module.exports = customSettings
