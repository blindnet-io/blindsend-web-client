import * as React from 'react'
import { cmd } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'

type ChangePassword = { type: 'ChangePassword', value: string }
type ToggleHidden = { type: 'ToggleHidden' }

type Msg =
  | ChangePassword
  | ToggleHidden

type Model = {
  value: string,
  hidden: boolean
}

const init: [Model, cmd.Cmd<Msg>] = [{ value: '', hidden: true }, cmd.none]

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'ChangePassword':
      return [{ ...model, value: msg.value }, cmd.none]
    case 'ToggleHidden':
      return [{ ...model, hidden: !model.hidden }, cmd.none]
  }
}

const view = (model: Model): Html<Msg> => dispatch => (
  <div className="main-password__form">
    <div className="main-password__input-wrap">
      <input
        type={model.hidden ? "password" : "text"}
        placeholder="Type password"
        id="myInput"
        className="main-input main-password__input"
        value={model.value}
        onChange={e => dispatch({ type: 'ChangePassword', value: e.target.value })}
      />
      <span
        className={model.hidden ? "main-password-btn font-password-show" : "main-password-btn font-password-hide"}
        onClick={e => dispatch({ type: 'ToggleHidden' })}
      ></span>
    </div>
    <div className="btn-wrap">
      <input type="submit" className="main-password__submit btn" value="generate Link" />
      <span className="btn-animation"></span>
    </div>
  </div>
)

export { Model, Msg, init, update, view }