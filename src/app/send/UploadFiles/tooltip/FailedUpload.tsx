import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import WeakEmoji from '../../../../images/weak.svg'

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--weak">
          <div className="tooltip__img">
            <img src={WeakEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">Could not upload files</h2>
          <div className="tooltip__content-container">
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">An error occured while encrypting and uploading files.</p>
                <p className="tooltip__content-text">Please, try again.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
