import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import { SpinnerCircularSplit } from 'spinners-react';

const view = (): Html<any> => _ => {

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--strong">
          <SpinnerCircularSplit
            size={68}
            thickness={131}
            speed={121}
            color="rgba(57, 172, 62, 1)"
            secondaryColor="rgba(57, 172, 124, 0.78)"
            style={{ marginBottom: '20px' }}
          />
          <h2 className="tooltip__title section-title">Verifying password</h2>
        </div>
      </div>
    </div>
  )
}

export { view }
