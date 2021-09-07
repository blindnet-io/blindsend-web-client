import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

const view = (mobile?: boolean): Html<any> => _ =>
  <ul className={mobile ? "secondary-menu secondary-menu__header" : "secondary-menu"}>

    <li className="secondary-menu__item" onClick={e => {
      e.stopPropagation()
      document.querySelector('.js-main-privacy')?.classList.add('show')
    }}>
      <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>
    </li>

    <li className="secondary-menu__item" onClick={e => {
      e.stopPropagation()
      document.querySelector('.js-main-legal')?.classList.add('show')
    }}>
      <a href="#" onClick={e => e.preventDefault()}>Legal Mentions</a>
    </li>

    <li className="secondary-menu__item" onClick={e => {
      e.stopPropagation()
      document.querySelector('.js-main-terms')?.classList.add('show')
    }}>
      <a href="#" onClick={e => e.preventDefault()}>Terms and Conditions</a>
    </li>

  </ul>

export { view }