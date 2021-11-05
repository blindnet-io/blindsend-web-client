import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import ClapEmoji from '../../../../images/clap.svg'

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--strong">
          <div className="tooltip__img">
            <img src={ClapEmoji} alt="" />
          </div>
          <div className="tooltip__content-container" style={{ marginTop: '20px' }}>
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">The files were encrypted and uploaded successfully.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
