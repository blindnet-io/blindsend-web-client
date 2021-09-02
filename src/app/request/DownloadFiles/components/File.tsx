import * as React from 'react'
import { cmd } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import filesize from 'filesize'

type Download = { type: 'Download', id: string }

type Msg =
  | Download

const update = (msg: Msg, model: any): [any, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'Download':
      return [model, cmd.none]
  }
}

const view = (
  id: string,
  state: {
    type: 'Hidden'
  } | {
    type: 'Visible',
    name: string,
    size: number,
    downloading: boolean,
    progress: number,
    complete: boolean,
  }
): Html<Msg> => dispatch => {

  switch (state.type) {
    case 'Hidden':
      return (
        <div className="main-download__files" key={id}>
          <svg className="main-download__files-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8.342C20 8.07556 19.9467 7.81181 19.8433 7.56624C19.7399 7.32068 19.5885 7.09824 19.398 6.912L14.958 2.57C14.5844 2.20466 14.0826 2.00007 13.56 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V4Z" stroke="#A7A7A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 13H15" stroke="#A7A7A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 17H12" stroke="#A7A7A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2V6C14 6.53043 14.2107 7.03914 14.5858 7.41421C14.9609 7.78929 15.4696 8 16 8H20" stroke="#A7A7A7" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span style={{ textShadow: '0 0 5px rgba(255, 255, 255, 0.9)', color: 'transparent' }} className="main-download__file-name">Hidden file {id}</span>
          <span className="main-download__file-disabled">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15L16 11M12 15V3V15ZM12 15L8 11L12 15Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17L2.621 19.485C2.72915 19.9177 2.97882 20.3018 3.33033 20.5763C3.68184 20.8508 4.11501 20.9999 4.561 21H19.439C19.885 20.9999 20.3182 20.8508 20.6697 20.5763C21.0212 20.3018 21.2708 19.9177 21.379 19.485L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      )
    case 'Visible':
      return (
        <div className="main-download__files" key={id}>
          <svg className="main-download__files-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8.342C20 8.07556 19.9467 7.81181 19.8433 7.56624C19.7399 7.32068 19.5885 7.09824 19.398 6.912L14.958 2.57C14.5844 2.20466 14.0826 2.00007 13.56 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V4Z" stroke="#A7A7A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 13H15" stroke="#A7A7A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 17H12" stroke="#A7A7A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2V6C14 6.53043 14.2107 7.03914 14.5858 7.41421C14.9609 7.78929 15.4696 8 16 8H20" stroke="#A7A7A7" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span className="main-download__file-name">
            {state.name.length > 40 ? `${state.name.slice(0, 25)}...${state.name.slice(-5)}` : state.name}
            <span style={{ marginLeft: '10px', color: '#CCCCCC' }}>({filesize(state.size)})</span>
          </span>
          <span className="main-download__file">
            {state.downloading
              ?
              <span style={{ cursor: 'default' }}>{state.progress} %</span>
              :
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                onClick={() => dispatch({ type: 'Download', id })}
              >
                <path d="M12 15L16 11M12 15V3V15ZM12 15L8 11L12 15Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 17L2.621 19.485C2.72915 19.9177 2.97882 20.3018 3.33033 20.5763C3.68184 20.8508 4.11501 20.9999 4.561 21H19.439C19.885 20.9999 20.3182 20.8508 20.6697 20.5763C21.0212 20.3018 21.2708 19.9177 21.379 19.485L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          </span>
        </div>
      )

  }
}

export { Msg, update, view }