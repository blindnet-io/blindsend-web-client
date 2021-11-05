import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import HandsEmoji from '../../../../images/hands.svg'

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__warning-wrap">
          <span className="tooltip__warning">This version uses the IndexedDB API. <br /> Check our &#x200B;
            <a href="#" onClick={e => {
              e.stopPropagation()
              document.querySelector('.js-main-privacy')?.classList.add('show')
            }}>
              Cookie Policy.
            </a>
          </span>
        </div>

        <div className="tooltip__inner tooltip__inner--pink">
          <div className="tooltip__img">
            <img src={HandsEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">PASSWORDLESS</h2>
          <div className="tooltip__content-container">
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">An encryption key will be generated for you in the background and saved in this browser.</p>
                <p className="tooltip__content-text">You only have to share the link with the person you’re requesting the files from and wait.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
