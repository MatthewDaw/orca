const base = require('./electron-builder.config.cjs')

const FORK_PRODUCT_NAME = 'Orca - Matt Fork'

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'com.matthewdaw.orca-fork',
  productName: FORK_PRODUCT_NAME,
  // Why: a distinct scheme keeps the stock Orca app as the owner of orca:// links.
  protocols: [{ name: 'Orca Fork', schemes: ['orca-fork'] }],
  extraMetadata: { ...base.extraMetadata, productName: FORK_PRODUCT_NAME },
  mac: {
    ...base.mac,
    icon: 'resources/build/icon-fork.icns',
    extraResources: [
      ...base.mac.extraResources,
      { from: 'resources/build/fork-build.marker', to: 'fork-build' }
    ],
    target: [{ target: 'dir', arch: ['arm64'] }]
  }
}
