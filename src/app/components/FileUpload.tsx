import * as React from 'react'
import { cmd } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import filesize from 'filesize'

type Remove = { type: 'Remove', id: string }

type Msg =
  | Remove

const update = (msg: Msg, model: any): [any, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Remove':
      return [model, cmd.none]
  }
}

const view = (
  id: string,
  name: string,
  size: number,
  progress: number,
  complete: boolean,
  tooBig: boolean,
  disabled: boolean
): Html<Msg> => dispatch =>

    <div className={tooBig ? "main-drop__file large-file" : "main-drop__file"} key={id}>
      <span className="main-drop__file-name" style={{ maxWidth: '70%' }}>
        {name.length > 30 ? `${name.slice(0, 25)}...${name.slice(-5)}` : name}
      </span>
      <span className="main-drop__file-bar" style={tooBig ? {} : { width: `${complete ? 100 : progress}%` }}></span>
      <div className="main-drop__file-bar-status">
        <span className="main-drop__file-bar-status-text">{filesize(size)}</span>
        {
          !tooBig && !disabled &&
          <span
            className={disabled ? "main-drop__file-cross-disabled" : "main-drop__file-cross"}
            onClick={e => {
              e.stopPropagation()
              disabled ? undefined : dispatch({ type: 'Remove', id: id })
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="12" fill={disabled ? "#606060" : "#292B2E"} />
              <path
                d="M16.2001 7.80682C16.1385 7.74501 16.0652 7.69598 15.9846 7.66253C15.9039 7.62907 15.8175 7.61185 15.7301 7.61185C15.6428 7.61185 15.5564 7.62907 15.4757 7.66253C15.3951 7.69598 15.3218 7.74501 15.2601 7.80682L12.0001 11.0601L8.74015 7.80015C8.67843 7.73843 8.60515 7.68947 8.52451 7.65606C8.44387 7.62266 8.35744 7.60547 8.27015 7.60547C8.18286 7.60547 8.09643 7.62266 8.01579 7.65606C7.93514 7.68947 7.86187 7.73843 7.80015 7.80015C7.73843 7.86187 7.68947 7.93514 7.65606 8.01579C7.62266 8.09643 7.60547 8.18286 7.60547 8.27015C7.60547 8.35744 7.62266 8.44387 7.65606 8.52451C7.68947 8.60515 7.73843 8.67843 7.80015 8.74015L11.0601 12.0001L7.80015 15.2601C7.73843 15.3219 7.68947 15.3951 7.65606 15.4758C7.62266 15.5564 7.60547 15.6429 7.60547 15.7301C7.60547 15.8174 7.62266 15.9039 7.65606 15.9845C7.68947 16.0652 7.73843 16.1384 7.80015 16.2001C7.86187 16.2619 7.93514 16.3108 8.01579 16.3442C8.09643 16.3776 8.18286 16.3948 8.27015 16.3948C8.35744 16.3948 8.44387 16.3776 8.52451 16.3442C8.60515 16.3108 8.67843 16.2619 8.74015 16.2001L12.0001 12.9401L15.2601 16.2001C15.3219 16.2619 15.3951 16.3108 15.4758 16.3442C15.5564 16.3776 15.6429 16.3948 15.7301 16.3948C15.8174 16.3948 15.9039 16.3776 15.9845 16.3442C16.0652 16.3108 16.1384 16.2619 16.2001 16.2001C16.2619 16.1384 16.3108 16.0652 16.3442 15.9845C16.3776 15.9039 16.3948 15.8174 16.3948 15.7301C16.3948 15.6429 16.3776 15.5564 16.3442 15.4758C16.3108 15.3951 16.2619 15.3219 16.2001 15.2601L12.9401 12.0001L16.2001 8.74015C16.4535 8.48682 16.4535 8.06015 16.2001 7.80682Z"
                fill={disabled ? "#aaaaaa" : "white"} />
            </svg>
          </span>
        }
      </div>
    </div>

export { Msg, update, view }