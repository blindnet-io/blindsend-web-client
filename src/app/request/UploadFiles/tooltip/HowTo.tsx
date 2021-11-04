import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import MailIcon from '../../../../images/mail.svg'

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__warning-wrap">
          <span className="tooltip__warning">No files were uploaded yet.</span>
        </div>

        <div className="tooltip__inner tooltip__inner--default">
          <div className="tooltip__img">
            <img src={MailIcon} alt="" />
          </div>
          <h2 className="tooltip__title section-title">Sending files?</h2>
          <div className="tooltip__content-container">
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">Drop your files here. When you are ready, click “<b>SEND</b>” and the magic will happen.</p>
                <p className="tooltip__content-text">Your files will be encrypted and accessible to the person who gave you the link.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
