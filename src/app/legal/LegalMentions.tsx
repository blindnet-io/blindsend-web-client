import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import BlindsendLogo from '../../images/blindsend.svg'

const view = (): Html<any> => _ => {

  window.addEventListener('keyup', e => {
    e.preventDefault();
    if (e.code === 'Escape' || e.keyCode === 27) {
      document.querySelector('.js-main-legal')?.classList.remove('show')
    }
  })

  return (
    <div className="main-privacy js-main-legal">
      <div className="site-header">
        <div className="site-nav__img">
          <img src={BlindsendLogo} alt="" />
        </div>
        <span className="site-privacy__close js-legal-close" onClick={() => {
          document.querySelector('.js-main-legal')?.classList.remove('show')
        }}>
          &#10005;
      </span>
      </div>
      <div className="main-privacy__content">
        <h1 className="main-privacy__title">Legal Mentions</h1>
      </div>
    </div>
  )
}

export { view }