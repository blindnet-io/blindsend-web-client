<h1 align="center">
  blindsend web client
</h1>

<!-- IF branding -->

<p align=center><img src="https://user-images.githubusercontent.com/7578400/163277439-edd00509-1d1b-4565-a0d3-49057ebeb92a.png#gh-light-mode-only" height="80" /></p>
<p align=center><img src="https://user-images.githubusercontent.com/7578400/163549893-117bbd70-b81a-47fd-8e1f-844911e48d68.png#gh-dark-mode-only" height="80" /></p>

<!-- END IF branding -->

<p align="center">
  <strong>End-to-end encrypted file sharing</strong>
</p>

<p align="center">
  <a href="https://blindsend.io"><strong>blindsend.io</strong></a>
</p>

<p align="center">
  <a href="#deployment">Deployment</a>
  &nbsp;•&nbsp;
  <a href="https://github.com/blindnet-io/blindsend-web-client/issues">Submit an Issue</a>
  <br>
  <br>
</p>

## About

Web client for [blindsend](https://github.com/blindnet-io/blindsend), an open source tool for private, end-to-end encrypted file exchange.

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

## Community

> All community participation is subject to blindnet’s [Code of Conduct][coc].

Stay up to date with new releases and projects, learn more about how to protect your privacy and that of our users, and share projects and feedback with our team.

- [Join our Slack Workspace][chat] to chat with the blindnet community and team
- Follow us on [Twitter][twitter] to stay up to date with the latest news
- Check out our [Openness Framework][openness] and [Product Management][product] on Github to see how we operate and give us feedback.

## License

The blindsend-web-client is available under [MIT][license] (and [here](https://github.com/blindnet-io/openness-framework/blob/main/docs/decision-records/DR-0001-oss-license.md) is why).

<!-- project's URLs -->
[new-issue]: https://github.com/blindnet-io/blindsend-web-client/issues/new/choose
[fork]: https://github.com/blindnet-io/blindsend-web-client/fork

<!-- common URLs -->
[openness]: https://github.com/blindnet-io/openness-framework
[product]: https://github.com/blindnet-io/product-management
[request]: https://github.com/blindnet-io/devrel-management/issues/new?assignees=noelmace&labels=request%2Ctriage&template=request.yml&title=%5BRequest%5D%3A+
[chat]: https://join.slack.com/t/blindnet/shared_invite/zt-1arqlhqt3-A8dPYXLbrnqz1ZKsz6ItOg
[twitter]: https://twitter.com/blindnet_io
[docs]: https://blindnet.dev/docs
[changelog]: CHANGELOG.md
[license]: LICENSE
[coc]: https://github.com/blindnet-io/openness-framework/blob/main/CODE_OF_CONDUCT.md