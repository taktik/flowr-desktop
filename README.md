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
Attention: use ffmpeg-static 5.2.0
```
nvm use && rm -rf node_modules && npm run setup && npm run build && npm run cm
```
### Build for Mac with Widevine support
Attention: use ffmpeg-static 5.2.0
```
nvm use && rm -rf node_modules && npm run setup-widevine && npm run build && npm run cwm
```

### Build for Linux
Attention: use ffmpeg-static 3.0.0
```
nvm use && rm -rf node_modules && npm run setup && npm run build && npm run cl
```
### Build for Linux with Widevine support
Attention: use ffmpeg-static 3.0.0
```
nvm use && rm -rf node_modules && npm run setup-widevine && npm run build && npm run cwl
```

### Build for Windows (On Windows)
Attention: use ffmpeg-static 3.0.0
```
nvm use 20.14.0 ; rd .\node_modules -Recurse -Force ; npm run setup ; npm run build ; npm run cw
```
### Build for Windows with Widevine support (On Windows)
Attention: use ffmpeg-static 3.0.0
```
nvm use 20.14.0 ; rd .\node_modules -Recurse -Force ; npm run setup-widevine ; npm run build ; npm run cww
```

### Helpers (linux/OSX only)
Two script are available to help build and publish
```
$ ./script/build help # build for a given platform
$ ./script/maven help # publish to taktik's maven repository
```
## <a id="widevine"></a> Special notes on widevine builds
OSX and Windows builds require VMP signing for Widevine CDM support. Please read the below section(s) first, but if you need it more info can be found [here](https://github.com/castlabs/electron-releases/wiki/EVS).

### Installation
Python 3.7+ **MUST** be installed.
A requirement for the build scripts to work on all platforms is to define the PYTHON3 environment variable to target the python3 executable (example: "/usr/local/bin/python3").
Then
```
$ PYTHON3 -m pip install --upgrade castlabs-evs
```

An account has already been created, log in (its credentials can be found the usual Taktik way).
This operation is to be renewed periodically (at least once every month).
```
$ PYTHON3 -m castlabs_evs.account reauth
```

However if you ever need to create a new account then use
```
$ PYTHON3 -m castlabs_evs.account signup
```

Once this is done, the build may be performed accordingly to described in the sections above
