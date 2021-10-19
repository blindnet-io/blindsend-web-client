import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import WeakEmoji from '../../images/weak.svg'

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--weak">
          <div className="tooltip__img">
            <img src={WeakEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title" style={{ fontSize: '24px', marginTop: '15px' }}>Link expired or not found</h2>
          <div className="tooltip__content-container">
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">Note that the links are valid only for 7 days,<br />after which the files are deleted.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
