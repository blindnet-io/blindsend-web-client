import * as React from 'react'
import { cmd } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'

import * as LeftPanel from '../components/LeftPanel'
import * as HowToTooltip from './tooltip/HowTo'
import * as CopiedTooltip from './tooltip/Copied'

type CopyLink = { type: 'CopyLink' }
type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }

type Msg =
  | CopyLink
  | LeftPanelMsg

type Model = {
  leftPanelModel: LeftPanel.Model,
  link: string,
  copied: boolean
}

const init: (link: string) => [Model, cmd.Cmd<Msg>] =
  link => {
    const [leftPanelModel, leftPanelCmd] = LeftPanel.init(2)

    return [
      { leftPanelModel, link, copied: false },
      cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd)
    ]
  }

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'CopyLink':
      return [{ ...model, copied: true }, cmd.none]
    case 'LeftPanelMsg': {
      const [leftPanelModel, leftPanelCmd] = LeftPanel.update(msg.msg, model.leftPanelModel)

      return [
        { ...model, leftPanelModel },
        cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd)
      ]
    }
  }
}

const view = (model: Model): Html<Msg> => dispatch => {

  const renderTooltip = () => {
    if (!model.copied)
      return HowToTooltip.view()(dispatch)
    else
      return CopiedTooltip.view()(dispatch)
  }

  const copyToClipboard = () => {
    const el = document.createElement('textarea')
    el.value = model.link
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }

  return (
    <div className="site-page__row row">

      {LeftPanel.view(model.leftPanelModel)(msg => dispatch({ type: 'LeftPanelMsg', msg }))}

      <div className="site-main__wrap col-lg-7">
        <div className="site-main">
          <div className="site-main__content">
            <div className="main-exchange">
              <h2 className="main-exchange__title section-title">Exchange Link</h2>
              <div className="main-exchange__link-wrap">
                <a
                  href=""
                  className="main-exchange__link"
                  onClick={e => {
                    e.preventDefault()
                    copyToClipboard()
                    dispatch({ type: 'CopyLink' })
                  }}
                >
                  {model.link}
                </a>
              </div>
              <div className="btn-wrap">
                <button
                  className="main-exchange__copy btn"
                  onClick={() => {
                    copyToClipboard()
                    dispatch({ type: 'CopyLink' })
                  }}
                >
                  COPY TO CLIPBOARD
                  <span className="main-exchange__copy-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.6667 4.66699H7C6.73478 4.66699 6.48043 4.77235 6.29289 4.95989C6.10536 5.14742 6 5.40178 6 5.66699V21.667C6 21.9322 6.10536 22.1866 6.29289 22.3741C6.48043 22.5616 6.73478 22.667 7 22.667H19.6667C19.9319 22.667 20.1862 22.5616 20.3738 22.3741C20.5613 22.1866 20.6667 21.9322 20.6667 21.667V5.66699C20.6667 5.40178 20.5613 5.14742 20.3738 4.95989C20.1862 4.77235 19.9319 4.66699 19.6667 4.66699ZM19.3333 21.3337H7.33333V6.00033H19.3333V21.3337Z" fill="white" />
                      <path d="M17.3332 2.33301C17.3332 2.06779 17.2278 1.81344 17.0403 1.6259C16.8527 1.43836 16.5984 1.33301 16.3332 1.33301H3.6665C3.40129 1.33301 3.14693 1.43836 2.9594 1.6259C2.77186 1.81344 2.6665 2.06779 2.6665 2.33301V18.333C2.6665 18.5982 2.77186 18.8526 2.9594 19.0401C3.14693 19.2277 3.40129 19.333 3.6665 19.333H3.99984V2.66634H17.3332V2.33301Z" fill="white" />
                    </svg>
                  </span>
                </button>
                <span className="btn-animation"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {renderTooltip()}

    </div>
  )
}

export { Model, Msg, init, update, view }