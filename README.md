# Blindsend front-end

This project is a front-end client for blindsend, an open source tool for private, end-to-end encrypted file exchange between two parties. Blindsend is still under development by [blindnet.io](https://blindnet.io/).

Blindsend front-end provides a UI that uses blindsend back-end (API) for private file exchange. It also performs local encryption and decryption of the exchanged files, so that all files exchanged via blindsend are always encrypted and decrypted only on a local machine.

Blindsend front-end is intended for use together with [blindsend back-end](https://github.com/blindnet-io/blindsend-be).

## Installation instructions

Before installing blindsend front-end, you need to have [npm](https://www.npmjs.com/get-npm) installed.

To build blindsend front-end, run the following command in the project root
```bash
npm run build
```

If you are using your local blindsend back-end instance without https connection, build the front-end by running the command below. In this case however, you should not use the instance for purposes other than testing. 
```bash
npm run build-local
```

This will create a `dist` folder in project's root. To integrate blindsend front-end with the back-end, follow the instruction for [blindsend back-end installation](https://github.com/blindnet-io/blindsend-be) and its integration with the front-end.

