import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

const view = (): Html<any> => _ => (
  <footer className="site-footer">
    <div className="site-footer__content">
      <span>blindnet Inc. ©2021</span>
      <span>v.0.0.2</span>
    </div>
  </footer>
)

export { view }
