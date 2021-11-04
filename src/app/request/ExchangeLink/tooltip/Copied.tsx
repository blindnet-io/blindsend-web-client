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
          <h2 className="tooltip__title section-title">YOU’VE COPIED THE LINK</h2>
          <div className="tooltip__content-container">
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">Provide the sender with the link and ask them to upload the files.
                </p>
                <p className="tooltip__content-text">Once uploaded, the files will be encrypted and accessible only to you, on the same link.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
