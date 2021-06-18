import * as React from 'elm-ts/lib/React'
import { render } from 'react-dom'

// import { init, update, view } from './request-file/App'
// import { init, update, view } from './send-file/App'
import { init, update, view } from './App'

import '../styles/index.scss'

const main = React.program(init(), update, view)

React.run(main, dom => render(dom, document.getElementById('app')))
