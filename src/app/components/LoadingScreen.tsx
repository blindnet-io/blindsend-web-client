import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import BlindsendLogo from '../../images/blindsend.svg'
import * as MainNavigation from './MainNavigation'
import * as Footer from './Footer'
import * as LegalLinks from './legal/LegalLinks'
import * as PrivacyPolicy from './legal/PrivacyPolicy'
import * as LegalMentions from './legal/LegalMentions'
import * as TermsAndConditions from './legal/TermsAndCondidions'

import { SpinnerCircular } from 'spinners-react'

function view(): Html<any> {

  return dispatch => (
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
              <ul id="primary-menu" className="primary-menu" style={{ filter: 'blur(4px)' }}>
                <li className="menu-item">
                  <span className="menu-item-number">1</span>
                  <span className="menu-item-title">Pick <br /> Password</span>
                </li>
                <li className="menu-item">
                  <span className="menu-item-number">2</span>
                  <span className="menu-item-title">Exchange <br /> Link</span>
                </li>
                <li className="menu-item">
                  <span className="menu-item-number">3</span>
                  <span className="menu-item-title">Sender<br /> Upload</span>
                </li>
                <li className="menu-item">
                  <span className="menu-item-number">4</span>
                  <span className="menu-item-title">Download</span>
                </li>
              </ul>
            </div>
            {LegalLinks.view()(dispatch)}
          </div>

          <div className="site-main__wrap col-lg-7" style={{ filter: 'blur(4px)' }}>
            <div className="site-main">
              <div className="site-main__content">
                <SpinnerCircular
                  size={53}
                  thickness={143}
                  speed={100}
                  color="rgba(150, 150, 150, 1)"
                  secondaryColor="rgba(0, 0, 0, 0)"
                  style={{ margin: 'auto' }}
                />
              </div>
            </div>
          </div>

          <div className="tooltip__wrap col-lg-3" style={{ filter: 'blur(4px)' }}>
            <div className="tooltip">
              <div className="tooltip__inner tooltip__inner--empty">
                <SpinnerCircular
                  size={53}
                  thickness={143}
                  speed={100}
                  color="rgba(150, 150, 150, 1)"
                  secondaryColor="rgba(0, 0, 0, 0)"
                  style={{ margin: 'auto' }}
                />
              </div>
            </div>
          </div>

        </div>

        {Footer.view()(dispatch)}

        {PrivacyPolicy.view()(dispatch)}
        {LegalMentions.view()(dispatch)}
        {TermsAndConditions.view()(dispatch)}

      </div>
    </div>
  )
}

export { view }