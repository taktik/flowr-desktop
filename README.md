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

The given command below will run flowr-desktop in the development mode.

```bash
$ npm run dev
```

## Other commands

You can also run other commands, for other tasks like building the app or linting the code, by using the commands described below.

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
| `dev`            | Starts flowr-desktop in the development mode       |

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

#### Translation

The browser is available in English (default) and French. 
Translation are located in `src/wexdond/local`.
We used [i18n-manager](https://github.com/gilmarsquinelato/i18n-manager) to edit local directory.


## Build and publish

Two script are available to help build and publish
`./script/build help`
`./script/maven help`
