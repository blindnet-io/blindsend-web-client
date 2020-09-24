# Blindsend web UI

This project is a web client for [blindsend](https://github.com/blindnet-io/blindsend), an open source tool for private, end-to-end encrypted file exchange between two parties.

Blindsend web client provides a web UI that uses blindsend [server (API)](https://github.com/blindnet-io/blindsend-be) for private file exchange. It also performs local encryption and decryption of the exchanged files, so that all files exchanged via blindsend are always encrypted and decrypted only on Sender's/Receiver's local machines. Web UI has been tested on Chrome, Chromium, and Firefox (all desktop).

Blindsend web UI is intended to be used together with [blindsend server](https://github.com/blindnet-io/blindsend-be). A demo is avalable [here](https://blindsend.xyz).

## Installation instructions

Before building blindsend web UI, you need to have [npm](https://www.npmjs.com/get-npm) installed.

To build blindsend web UI, run the following command in the project root
```bash
npm run build
```

If you are using a server instance without the https connection, build the web UI by running the command below. In this case however, you should never use that instance for purposes other than testing. 
```bash
npm run build-local
```

This will create a `dist` folder in project's root. To integrate blindsend web UI with the server, [install blindsend server](https://github.com/blindnet-io/blindsend-be) and put the `dist` folder in the same location as your `blindsend.jar` before running the server.

## Dependencies

Web UI implementation is written in [TypeScript](https://www.typescriptlang.org/) and [React](https://reactjs.org/).  
App architecture is [Elm](https://guide.elm-lang.org/architecture/) like with [elm-ts](https://github.com/gcanti/elm-ts) library as the backbone.  
For cryptography, [JavaScript + WebAssembly libsodium port](https://github.com/jedisct1/libsodium.js/) is used.  

## Current status
This project has been started by [blindnet.io](https://blindnet.io/) and is currently under development.  