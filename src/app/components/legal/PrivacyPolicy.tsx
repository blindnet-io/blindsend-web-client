import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import BlindsendLogo from '../../../images/blindsend.svg'

const view = (): Html<any> => _ => {

  window.addEventListener('keyup', e => {
    e.preventDefault();
    if (e.code === 'Escape' || e.keyCode === 27) {
      document.querySelector('.js-main-privacy')?.classList.remove('show')
    }
  })

  return (
    <div className="main-privacy js-main-privacy">
      <div className="site-header">
        <div className="site-nav__img">
          <a href="/" style={{ 'borderBottom': 'none' }}><img src={BlindsendLogo} alt="" /></a>
        </div>
        <span className="site-privacy__close js-policy-close" onClick={() => {
          document.querySelector('.js-main-privacy')?.classList.remove('show')
        }}>
          &#10005;
        </span>
      </div>
      <div className="main-privacy__content">
        <h1 className="main-privacy__title">Privacy Policy</h1>
        <h2>Who we are</h2>
        <p>Blindsend is an open source tool for private, end-to-end encrypted file exchange between two parties created by <a href="https://blindnet.io" target="_blank">Blindnet Inc.</a></p>

        <h2>What sensitive personal data we collect</h2>
        <p>We don’t collect any sensitive personal data.</p>

        <h2>Cookies</h2>
        <p>We don't store cookies.</p>
        <p>If a passwordless link is requested, we store the requestor's private key in browser's IndexedDB. The data stored in IndexedDB is stored locally inside your browser and never sent to blindsend server. It's intended to authenticate you and generate a key to decrypt files you requested.</p>

        <h2>Who we share your data with</h2>
        <p>We do not share your data with anyone.</p>
        <p>We use Google servers to host the platform and to provide the service. We don’t store any personal data there. Since you’re uploading files on the Google servers, Google can potentially collect your IP address.</p>

        <h2>How long we retain your data</h2>
        <p>All the data that you’re uploading on blindsend is cleared after a week.</p>

        <h2>What rights you have over your data</h2>
        <p>If you have an account on this site, or have left comments, you can request to receive an exported file of the personal data we hold about you, including any data you have provided to us. You can also request that we erase any personal data we hold about you. This does not include any data we are obliged to keep for administrative, legal, or security purposes.</p>

        <h2>Changes to this Privacy Policy</h2>
        <p>We may update our Privacy Policy from time to time.</p>
        <p>You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.</p>

        <h2>General provisions</h2>
        <p>The Privacy Policy is governed by French law. In the event of a difficulty arising from pre-contractual relations or related to the validity, execution or interpretation of the present terms, the parties will seek an amicable solution as a priority. In the absence of an amicable agreement, the dispute will be submitted to the courts of Paris, that shall have exclusive jurisdiction to hear any dispute arising between the parties.</p>

        <h2>Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, You can contact us.</p>
        <p>By email: privacy@blindnet.io</p>
      </div>
    </div>
  )
}

export { view }