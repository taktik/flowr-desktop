[![Build Status](https://travis-ci.com/taktik/flowr-desktop.svg?branch=base)](https://travis-ci.com/taktik/flowr-desktop)
<p align="center">
  <img src="static/app-icons/icon.png" width="256">
</p>

<div align="center">
  <h1>Flowr Desktop</h1>

Flowr Desktop is an Flowr client for PC, Mac or Linux. It also is an embedded privacy-focused web browser.

</div>

# Features

- Flowr
- [Wexond](https://github.com/wexond/wexond)  **2.1.0** A privacy-focused, extensible and beautiful web browser

## Running

Before running flowr-desktop, please ensure you have [`Node.js`](https://nodejs.org/en/) installed on your machine.

When running on Windows, make sure you have build tools installed. You can install them by running as **administrator**:

```bash
$ npm i -g windows-build-tools
```

Firstly, run this command to install all needed dependencies. If you have encountered any problems, please report it. I will try to help as much as I can.

```bash
$ npm run setup
```

The given command below will serve renderer files in the development mode.

```bash
$ npm run dev
```
and in another terminal
```bash
$ npm start
```

## Other commands

You can also run other commands, for other tasks like building the app or linting the code, by using the commands described below.
Also take a look at the [build](#build) script.

### Usage:

```bash
$ npm run <command>
```

#### List of available commands:

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `setup`          | install dependency and configure compilation tools. |
| `build`          | Bundles flowr-desktop's source in production mode. |
| `compile-win32`  | Compiles flowr-desktop binaries for Windows.       |
| `compile-darwin` | Compiles flowr-desktop binaries for macOS.         |
| `compile-linux`  | Compiles flowr-desktop binaries for Linux.         |
| `lint`           | Lints code.                                          |
| `lint-fix`       | Fixes eslint errors if any                           |
| `start`          | Starts flowr-desktop.                              |
| `dev`            | Build and serves project in the development mode       |

#### Known issues

##### compile-darwin

```
$ spctl --assess --type execute --verbose --ignore-cache --no-cache /Users/loris/Documents/taktik/flowr-pc-client/dist/mac/flowr-desktop.app
/Users/loris/Documents/taktik/flowr-pc-client/dist/mac/flowr-desktop.app: rejected
```

This error is caused by the signing mechanism for OSX applications. To temporarily disable it run:

```bash
$ sudo spctl --master-disable
```

You should re-enable it afterwards with:

```bash
$ sudo spctl --master-enable
```

##### getUserMedia (on OSX)
VSCode terminal does not have enough permission to request access to camera capabilities.
Using the native terminal does the trick.
A reference to this issue can be found [here](https://github.com/electron/electron/issues/14801#issuecomment-615219188)

```
DOMException: Could not start video source
```

#### Translation

The browser is available in English (default) and French. 
Translation are located in `src/wexdond/local`.
We used [i18n-manager](https://github.com/gilmarsquinelato/i18n-manager) to edit local directory.


# <a id="build"></a> Build and publish
**/!\\ Widevine builds require special attention. Please check the dedicated [section below](#widevine) /!\\**
## Installation
When making several builds, always ensure that the modules are properly installed.
```
$ rm -rf node_modules # if setup was already done, just to be sure
$ npm run setup # (Regular)
$ npm run setup-widevine # (Widevine linux/OSX)
$ npm run setup-widevine-win # (Widevine Windows)
```
## Actual build
```
$ npm run compile-$platform # (Regular)
$ npm run compile-widevine-$platform # (Widevine)
```
Where $platform is one of [win32, darwin, linux].

The builds may automatically be published on github. For this you need to setup a GH_TOKEN env variable with a [Github auth token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token), and then add the following flag to the build command: "--publish always".
```
$ npm run compile-win32 -- --publish always # note the additional "--" to pass the flag to the actual command
```

### Build for Mac
```
nvm use && rm -rf node_modules && npm run setup && npm run build && npm run cm
```
### Build for Mac with Widevine support
```
nvm use && rm -rf node_modules && npm run setup-widevine && npm run build && PYTHON3=/path/to/castlabs/python3 npm run cwm
```

### Build for Linux
```
nvm use && rm -rf node_modules && npm run setup && npm run build && npm run cl
```
### Build for Linux with Widevine support
```
nvm use && rm -rf node_modules && npm run setup-widevine && npm run build && npm run cwl
```

### Build for Windows (On Windows)
```
nvm use 20.14.0 ; rd .\node_modules -Recurse -Force ; npm run setup ; npm run build ; npm run cw
```
### Build for Windows with Widevine support (On Windows)
```
nvm use 20.14.0 ; rd .\node_modules -Recurse -Force ; npm run setup-widevine ; npm run build ; npm run cww
```

### Helpers (linux/OSX only)
Two script are available to help build and publish
```
$ ./script/build help # build for a given platform
$ ./script/maven help # publish to taktik's maven repository
```
## <a id="macos-signing"></a> macOS code signing

macOS builds (especially Widevine) require proper code signing to run without issues on end-user machines.

### Why signing is needed
- **Apple Silicon (arm64)** enforces stricter code signing. Unsigned apps may crash on boot.
- **Widevine CDM** requires the `com.apple.security.cs.disable-library-validation` entitlement to load its library.
- **Hardened Runtime** is required for notarization and proper operation on modern macOS.

The entitlements are defined in `static/entitlements.mac.plist` and are automatically applied by electron-builder when a valid signing certificate is found.

### Setting up a signing certificate

1. **Apple Developer Program**: Ensure Taktik has an [Apple Developer Program](https://developer.apple.com/programs/enroll/) membership ($99/year).

2. **Create a Certificate Signing Request (CSR)**:
   - Open **Keychain Access** on your Mac
   - Menu: **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority**
   - Fill in your email and name, select **Saved to disk**

3. **Create the certificate** at [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates):
   - Click **+** > select **Developer ID Application**
   - Upload your CSR file > download the `.cer` file

4. **Install the certificate**: double-click the `.cer` file to add it to your Keychain.

5. **Verify** the certificate is available:
   ```
   $ security find-identity -v -p codesigning
   ```
   You should see: `"Developer ID Application: Taktik (TEAM_ID)"`

Once the certificate is installed, electron-builder will automatically detect it from the Keychain and sign the app with hardened runtime + entitlements. No extra configuration needed.

### Signing on CI

For CI environments without Keychain access, set these environment variables:
- `CSC_LINK`: base64-encoded `.p12` certificate file
- `CSC_KEY_PASSWORD`: password for the `.p12` file

To export the `.p12` from your Keychain:
1. Open **Keychain Access** > find your "Developer ID Application" certificate
2. Right-click > **Export** > save as `.p12` with a password
3. Base64-encode it: `base64 -i certificate.p12 | tr -d '\n'`

### Local testing without a certificate

For local development/testing without an Apple Developer certificate, you can ad-hoc sign after building:
```
$ codesign --force --deep --sign - --entitlements static/entitlements.mac.plist dist/mac-arm64/flowr-desktop.app
```
This is sufficient for running locally but not for distribution.

## <a id="widevine"></a> Special notes on widevine builds
macOS and Windows builds require VMP signing for Widevine CDM support. Please read the below section(s) first, but if you need it more info can be found [here](https://github.com/castlabs/electron-releases/wiki/EVS).

### Installation
Python 3.7+ **MUST** be installed.
The build scripts use the `PYTHON3` environment variable to locate the python3 executable.

If using pipx (recommended on macOS with Homebrew-managed Python):
```
$ pipx install castlabs-evs
```
Then set `PYTHON3` to the pipx venv's python, e.g.:
```
$ export PYTHON3=~/.local/pipx/venvs/castlabs-evs/bin/python3
```

Alternatively, install into a venv:
```
$ python3 -m venv ~/.castlabs-venv
$ source ~/.castlabs-venv/bin/activate
$ pip install castlabs-evs
$ export PYTHON3=~/.castlabs-venv/bin/python3
```

An account has already been created, log in (its credentials can be found the usual Taktik way).
This operation is to be renewed periodically (at least once every month).
```
$ $PYTHON3 -m castlabs_evs.account reauth
```

However if you ever need to create a new account then use
```
$ $PYTHON3 -m castlabs_evs.account signup
```

Once this is done, the build may be performed accordingly to described in the sections above
