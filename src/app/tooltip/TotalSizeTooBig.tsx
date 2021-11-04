import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import WeakEmoji from '../../images/weak.svg'

const view = (size: string, request: Boolean = false): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        {request &&
          <div className="tooltip__warning-wrap">
            <span className="tooltip__warning">No files were uploaded yet.</span>
          </div>
        }

        <div className="tooltip__inner tooltip__inner--weak">
          <div className="tooltip__img">
            <img src={WeakEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">TOTAL SIZE LIMIT</h2>
          <div className="tooltip__content-container">
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">
                  Woah! The total size (all files) limit is <b>{size}</b>!
                  You can always send another batch 🙃
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
