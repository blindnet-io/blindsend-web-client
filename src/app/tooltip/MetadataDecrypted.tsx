import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import AmazingEmoji from '../../images/amazing.svg'

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--strong">
          <div className="tooltip__img">
            <img src={AmazingEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">GREAT</h2>
          <div className="tooltip__content-container" style={{ marginTop: '20px' }}>
            <div className="tooltip__content">
              <div className="swiper-slide">
                <p className="tooltip__content-text">Now you can download an individual file<br />or download all files at once.</p>
              </div>
            </div>
            <div className="tooltip__pagination"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
