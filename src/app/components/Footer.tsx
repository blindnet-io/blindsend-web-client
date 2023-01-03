import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

const view = (): Html<any> => _ => (
  <footer className="site-footer">
    <div className="site-footer__content" style={{ fontSize: '13px' }}>
      <span><a target="_blank" href="https://blindnet.io">blindnet Inc.</a> © {new Date().getFullYear()}</span>
      <span><a target="_blank" href="https://github.com/blindnet-io/blindsend">v{VERSION}</a></span>
    </div>
  </footer>
)

export { view }
