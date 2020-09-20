# Blindsend front-end

This project is a front-end client for [blindsend](https://github.com/blindnet-io/blindsend), an open source tool for private, end-to-end encrypted file exchange between two parties.

Blindsend front-end provides a UI that uses blindsend [back-end (API)](https://github.com/blindnet-io/blindsend-be) for private file exchange. It also performs local encryption and decryption of the exchanged files, so that all files exchanged via blindsend are always encrypted and decrypted only on Sender's/Receiver's local machines.

Blindsend front-end is intended to be used together with [blindsend back-end](https://github.com/blindnet-io/blindsend-be). A demo is avalable [here](https://blindsend.xyz).

## Installation instructions

Before installing blindsend front-end, you need to have [npm](https://www.npmjs.com/get-npm) installed.

To build blindsend front-end, run the following command in the project root
```bash
npm run build
```

If you are using your local back-end instance without the https connection, build the front-end by running the command below. In this case however, you should never use that instance for purposes other than testing. 
```bash
npm run build-local
```

This will create a `dist` folder in project's root. To integrate blindsend front-end with the back-end, after you [install blindsend back-end](https://github.com/blindnet-io/blindsend-be) follow the integration instructions given [here](https://github.com/blindnet-io/blindsend-be#front-end-integration).

## Current status
This project has been started by [blindnet.io](https://blindnet.io/) and is currently under development.

