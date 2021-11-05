import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import ThinkEmoji from '../../../../images/think-emoji.svg'

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--default">
          <div className="tooltip__img">
            <img src={ThinkEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">NOW WHAT?</h2>
          <div className="tooltip__content-container">
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">Copy the link, and ask the person with the files you’re requesting to visit the link and upload the file(s).</p>
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
