import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import { SpinnerDiamond } from 'spinners-react';

const view = (): Html<any> => _ => {

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
          <h2 className="tooltip__title section-title">Decrypting files</h2>
          <div className="tooltip__content-container" style={{ marginTop: '20px' }}>
            <div className="tooltip__content">
              <div className="tooltip__slide">
                <p className="tooltip__content-text">Please don't close the tab until the download is finished.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { view }
