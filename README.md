# Blindsend web UI

This project is a web client for [blindsend](https://github.com/blindnet-io/blindsend), an open source tool for private, end-to-end encrypted file exchange.

## Design

Web client communicates with the [server](https://github.com/blindnet-io/blindsend-server) through REST API. It executes encryption and handles uploading and downloading of the files from the [Cloud Storage](https://cloud.google.com/storage).

To access the [Cloud Storage](https://cloud.google.com/storage), the web client must obtain [signed GCP links](https://cloud.google.com/storage/docs/access-control/signed-urls) from the [server](https://github.com/blindnet-io/blindsend-server). The signed links are used when a third party needs to access a resource on the GCP.

To keep sensitive information away from the blindsend servers, links use the [URL fragments](https://en.wikipedia.org/wiki/URI_fragment). They are the parts of the URL after the # symbol which are not sent to the server when the URL is opened in the browser.

When uploading a file, the file is split into chunks of 4MB. 4MB chunks are loaded into the memory, encrypted and uploaded to the [Cloud Storage](https://cloud.google.com/storage).

When [js fetch api](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) implementations start supporting [ReadableStream<Uint8Array> request bodies](https://github.com/whatwg/fetch/pull/425), one request will be enough to transfer the file.

When downloading a file, the entire file is downloaded in a single request. Body of a response of the fetch api has type `ReadableStream<Uint8Array>` so the file bytes can be decrypted (transformed with `TransformStream`) before the entire file arrives.  
As soon as a 4MB chunk is downloaded, it is decrypted and streamed to disk with a help from [StreamSaver](https://github.com/jimmywarting/StreamSaver.js) library. At no point is the whole file kept in memory, just the part currently being decrypted. 

Web client is written in [TypeScript](https://www.typescriptlang.org/) and [React](https://reactjs.org/).
[Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) is used for encryption.

### Dependencies

- App architecture is [Elm](https://guide.elm-lang.org/architecture/) like with [elm-ts](https://github.com/gcanti/elm-ts) library as the backbone.  
- [streamsaver.js](https://github.com/jimmywarting/StreamSaver.js) to handle saving large files as streams.  
- [filesize.js](https://github.com/avoidwork/filesize.js) to display file sizes.  
- [Idb-keyval](https://github.com/jakearchibald/idb-keyval) to store the keys in the [browser storage](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) in case of passwordless file request.  
- [tai-password-strength](https://github.com/tests-always-included/password-strength) to calculate the relative strength of a password.  
- Various UI elements are handled with [swiper](https://github.com/nolimits4web/swiper) and [spinners-react](https://github.com/adexin/spinners-react).  
- [web-streams-adapter](https://github.com/MattiasBuelens/web-streams-adapter) and [web-streams-polyfill](https://github.com/MattiasBuelens/web-streams-polyfill) to make streams work in different browsers.

## Browser support

Web client is tested in different browsers using [BrowserStack](https://www.browserstack.com/).

On desktop operating systems, It works with all major browsers.  
On iOS, it works with Safari. For other iOS browsers, download doesn’t work.  
On Android, it works with Chrome and Firefox.  

## Deployment

Install [npm](https://www.npmjs.com/) and [yarn](https://yarnpkg.com/).

In the root directory of the project, run
```sh
yarn
```
to install dependencies and then
```sh
yarn build
```
to build the project.

Web client files will be in the _dist_ folder in the root directory.

If the [server](https://github.com/blindnet-io/blindsend-server) is on a different domain, change the value of the `HOST` variable in the `webpack.prod.js` file to the server endpoint (default value is `null`, if the server and client are using the same domain).

```js
new webpack.DefinePlugin({
  HOST: 'https://server-endpoint.com',
  ...
)}
```

## Current status

blindsend is under development by a team of software engineers at [blindnet.io](https://blindnet.io) and several independent cryptography experts.

## License

See [blindsend](https://github.com/blindnet-io/blindsend).