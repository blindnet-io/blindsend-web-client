import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import BlindsendLogo from '../../images/blindsend.svg'
import * as MainNavigation from '../components/MainNavigation'
import * as Footer from '../components/Footer'
import * as LegalLinks from './legal/LegalLinks'
import * as PrivacyPolicy from './legal/PrivacyPolicy'
import * as LegalMentions from './legal/LegalMentions'
import * as TermsAndConditions from './legal/TermsAndCondidions'

import * as ServerErrorTooltip from '../tooltip/ServerError'

function view(): Html<any> {

  return dispatch => {

    return (
      <div className="site-page">
        <div className="site-page__container container">

          <header className="site-header">
            {MainNavigation.view()(dispatch)}
            <div className="site-header__logo">
              <img src={BlindsendLogo} alt="" />
            </div>
            <ul className="site-header__nav-desktop">
              {/* <li className="site-header__nav-item"><a href="">Create account</a></li>
                <li className="site-header__nav-item"><a href="">Log-in</a></li> */}
            </ul>
            <div className="site-header__inner">
              <ul className="site-header__nav">
                {/* <li className="site-header__nav-item"><a href="">Create account</a></li>
                  <li className="site-header__nav-item"><a href="">Log-in</a></li> */}
              </ul>
              {LegalLinks.view(true)(dispatch)}
            </div>
          </header>

          <div className="site-page__row row">

            <div className="site-nav__wrap col-lg-2">
              <div className="site-nav">
                <div className="site-nav__img">
                  <img src={BlindsendLogo} alt="" />
                </div>
              </div>
              {LegalLinks.view()(dispatch)}
            </div>

            <div className="site-main__wrap col-lg-7">
              <div className="site-main">
                <div className="site-main__content">
                </div>
              </div>
            </div>

            {ServerErrorTooltip.view()(dispatch)}

          </div>

          {Footer.view()(dispatch)}

          {PrivacyPolicy.view()(dispatch)}
          {LegalMentions.view()(dispatch)}
          {TermsAndConditions.view()(dispatch)}

        </div>
      </div>
    )
  }

}

export { view }