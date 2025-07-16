/* globals module */

module.exports = {
  appId: 'org.taktik.flowr.pcClient',
  productName: 'flowr-desktop',
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  nsis: {
    include: 'static/installer.nsh',
    oneClick: false,
    allowToChangeInstallationDirectory: true
  },

  asar: false,
  directories: {
    output: 'dist',
    buildResources: 'static/app-icons'
  },
  files: ['build/**/*', 'package.json', 'script/beid/**/*'],
  linux: {
    category: 'Network',
    target: [
      {
        target: 'deb',
        arch: ['x64']
      }
    ]
  },
  deb: {
    depends: ['ffmpeg']
  },
  win: {
    target: [
      {
        target: 'zip',
        arch: ['x64', 'ia32']
      },
      {
        target: 'nsis',
        arch: ['x64', 'ia32']
      }
    ]
  },
  mac: {
    category: 'public.app-category.navigation'
  }
}
