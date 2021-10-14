import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import BlindsendLogo from '../../images/blindsend.svg'
import * as MainNavigation from '../components/MainNavigation'
import * as Footer from '../components/Footer'
import * as LegalLinks from './legal/LegalLinks'
import * as PrivacyPolicy from './legal/PrivacyPolicy'
import * as LegalMentions from './legal/LegalMentions'
import * as TermsAndConditions from './legal/TermsAndCondidions'

import * as AppErrorTooltip from '../tooltip/AppError'
import * as LinkNotFoundTooltip from '../tooltip/LinkNotFound'

function view(errorType: 'LinkNotFound' | 'AppError'): Html<any> {

  return dispatch => {

    function renderErrorTooltip() {
      switch (errorType) {
        case 'LinkNotFound': return LinkNotFoundTooltip.view()(dispatch)
        case 'AppError': return AppErrorTooltip.view()(dispatch)
      }
    }

    return (
      <div className="site-page">
        <div className="site-page__container container">

          <header className="site-header">
            {MainNavigation.view()(dispatch)}
            <div className="site-header__logo">
              <a href="/" style={{ 'borderBottom': 'none' }}><img src={BlindsendLogo} alt="" /></a>
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
                  <a href="/" style={{ 'borderBottom': 'none' }}><img src={BlindsendLogo} alt="" /></a>
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

            {renderErrorTooltip()}

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