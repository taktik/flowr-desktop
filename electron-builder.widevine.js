/* eslint-disable */

const common = require('./electron-builder.common')
const { exec } = require('child_process')

function signIf(targetPlatform) {
  return ({ appOutDir, electronPlatformName }) => {
    if (electronPlatformName !== targetPlatform) {
      return
    }

    return new Promise((resolve, reject) => {
      exec(`${process.env.PYTHON3 ?? 'python3'} -m castlabs_evs.vmp sign-pkg ${appOutDir}`, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
  }
}

module.exports = async function() {
  const { default: getElectronVersion } = await import('./script/electron-version.mjs')
  const ELECTRON_VERSION = await getElectronVersion()

  return {
    ...common,
    artifactName: '${productName}-${version}-${os}-${arch}-widevine.${ext}',
    afterPack: signIf('darwin'),
    afterSign: signIf('win32'),
    electronVersion: ELECTRON_VERSION,
    electronDownload: {
      version: `${ELECTRON_VERSION}+wvcus`,
      mirror: 'https://github.com/castlabs/electron-releases/releases/download/v'
    },
    /*
     * macOS requires hardened runtime and specific entitlements for Widevine builds.
     * Without these, the app crashes on boot on Apple Silicon (arm64) because:
     * - The Widevine CDM .dylib cannot be loaded without 'disable-library-validation'
     * - V8/Chromium JIT compilation fails without 'allow-jit'
     * - Chromium memory management fails without 'allow-unsigned-executable-memory'
     * See static/entitlements.mac.plist for the full list.
     * electron-builder applies these automatically when a valid signing certificate is found.
     * For local testing without a certificate, ad-hoc sign manually (see README).
     */
    mac: {
      ...common.mac,
      hardenedRuntime: true,
      entitlements: 'static/entitlements.mac.plist',
      entitlementsInherit: 'static/entitlements.mac.plist'
    }
  }
}