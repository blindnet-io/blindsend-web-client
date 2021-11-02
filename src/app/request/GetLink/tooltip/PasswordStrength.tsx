import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import { PasswordStrength, PasswordStrengthStatistics } from 'tai-password-strength'

import WeakEmoji from '../../../../images/weak.svg'
import StrongEmoji from '../../../../images/strong.svg'

const view = (pass: string): Html<any> => _ => {

  const stat = new PasswordStrength().check(pass)

  const weak = (title: string, msg: string, showText: boolean) => {
    return (
      <div className="tooltip__inner tooltip__inner--weak">
        <div className="tooltip__img">
          <img src={WeakEmoji} alt="" />
        </div>
        <h2 className="tooltip__title section-title">{title}</h2>
        <div className="tooltip__content-container">
          <div className="tooltip__content">
            <div className="tooltip__slide">
              <p className="tooltip__content-text">{msg}</p>
              {showText && <p className="tooltip__content-text">You can still proceed but anyone possessing the link will have an easier time cracking your password.</p>}
              {showText && <p className="tooltip__content-text">Good passwords include uppercase letters, lowercase letters, numbers and special characters.</p>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const ok = (title: string, msg: string) => {
    return (
      <div className="tooltip__inner tooltip__inner--strong">
        <div className="tooltip__img">
          <img src={StrongEmoji} alt="" />
        </div>
        <h2 className="tooltip__title section-title">{title}</h2>
        <div className="tooltip__content-container">
          <div className="tooltip__content">
            <div className="tooltip__slide">
              <p className="tooltip__content-text">{msg}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const screen = () => {
    // @ts-ignore
    const entropyBits = stat.trigraphEntropyBits ? stat.trigraphEntropyBits : stat.shannonEntropyBits

    if (entropyBits < 15)
      return weak('VERY WEAK PASSWORD', 'It will keep out a typical attacker for minutes.', true)
    else if (entropyBits < 20)
      return weak('WEAK PASSWORD', 'It will keep out a typical attacker for hours.', false)
    else if (entropyBits < 32)
      return ok('OK PASSWORD', 'Crackable by a typical home computer in a week.')
    else if (entropyBits < 64)
      return ok('REASONABLE PASSWORD', 'A specialized computer could get this in one year.')
    else if (entropyBits < 80)
      return ok('STRONG PASSWORD', 'Resistant to a large, coordinated attack (botnet) for over a year.')
    else
      return ok('VERY STRONG PASSWORD', 'Nearly impossible to brute force, given more than all of the computing power in the world, optimized algorithms, specialized hardware and a thousand years.')
  }

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        {screen()}
      </div>
    </div>
  )
}

export { view }
