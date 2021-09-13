import * as React from 'react'
import { cmd } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'

import * as LegalLinks from '../../components/legal/LegalLinks'
import BlindsendLogo from '../../../images/blindsend.svg'

type SwitchToSend = { type: 'SwitchToSend' }
type SwitchToReceive = { type: 'SwitchToReceive' }

type Msg =
  | SwitchToSend
  | SwitchToReceive

type CurrentStep = { type: 'Upload', id: 1 } | { type: 'ExchangeLink', id: 2 } | { type: 'Download', id: 3 }

type Model = {
  curStep: CurrentStep
}

const init: (curStep: 1 | 2 | 3) => [Model, cmd.Cmd<Msg>] = curStep => {
  switch (curStep) {
    case 1: return [{ curStep: { type: 'Upload', id: 1 } }, cmd.none]
    case 2: return [{ curStep: { type: 'ExchangeLink', id: 2 } }, cmd.none]
    case 3: return [{ curStep: { type: 'Download', id: 3 } }, cmd.none]
  }
}

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'SwitchToSend':
      return [model, cmd.none]
    case 'SwitchToReceive':
      return [model, cmd.none]
  }
}

const view = (model: Model): Html<Msg> => dispatch => {

  const passedStep = (title: JSX.Element) =>
    <li className="menu-item active complete">
      <span className="menu-item-number"><svg width="21" height="16" viewBox="0 0 21 16" fill="none"
        xmlns="http://www.w3.org/2000/svg">
        <path
          d="M7.84297 15.5976C7.64741 15.7942 7.38073 15.904 7.10359 15.904C6.82645 15.904 6.55978 15.7942 6.36421 15.5976L0.459629 9.69194C-0.15321 9.07911 -0.15321 8.0856 0.459629 7.4738L1.19901 6.73442C1.81185 6.12159 2.80431 6.12159 3.41715 6.73442L7.10359 10.4209L17.0648 0.459629C17.6777 -0.15321 18.6712 -0.15321 19.283 0.459629L20.0224 1.19901C20.6352 1.81185 20.6352 2.80536 20.0224 3.41715L7.84297 15.5976Z"
          fill="white" />
      </svg>
      </span>
      {title}
    </li>

  const step = (title: JSX.Element, id: number) =>
    <li className={model.curStep.id === id ? "menu-item active" : "menu-item"}>
      <span className="menu-item-number">{id}</span>
      {title}
    </li>

  const renderStep = (title: JSX.Element, id: number) =>
    model.curStep.id > id
      ? passedStep(title)
      : step(title, id)

  return (
    <div className="site-nav__wrap col-lg-2">
      <div className="site-nav">
        <div className="site-nav__img">
          <a href="/" style={{ 'borderBottom': 'none' }}><img src={BlindsendLogo} alt="" /></a>
        </div>
        {(model.curStep.type === 'Upload' || model.curStep.type === 'ExchangeLink') &&
          <div className="site-tabs__wrap">
            <div className="site-tabs site-tabs--send active" onClick={() => dispatch({ type: 'SwitchToSend' })}>send</div>
            <div className="site-tabs site-tabs--recieve" onClick={() => dispatch({ type: 'SwitchToReceive' })}>receive</div>
          </div>
        }
        <ul id="primary-menu" className="primary-menu">
          {renderStep(<span className="menu-item-title">Upload <br /> Files</span>, 1)}
          {renderStep(<span className="menu-item-title">Exchange <br /> Link</span>, 2)}
          {renderStep(<span className="menu-item-title">Download</span>, 3)}
        </ul>
      </div>
      {LegalLinks.view()(dispatch)}
    </div>
  )
}

export { Model, Msg, init, update, view }