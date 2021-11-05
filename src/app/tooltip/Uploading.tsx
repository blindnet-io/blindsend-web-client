import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import { SpinnerDiamond } from 'spinners-react';

const view = (cancel: () => void): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--strong">
          <SpinnerDiamond
            size={68}
            thickness={131}
            speed={121}
            color="rgba(57, 172, 62, 1)"
            secondaryColor="rgba(57, 172, 124, 0.78)"
            style={{ marginBottom: '20px' }}
          />
          <h2 className="tooltip__title section-title">Encrypting and uploading</h2>
          <div className="tooltip__content-container" style={{ marginTop: '20px' }}>
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">Please don't close the tab<br />until the upload is finished.</p>
                <div className="btn-secondary-wrap">
                  <button
                    onClick={cancel}
                    className="btn secondary"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
