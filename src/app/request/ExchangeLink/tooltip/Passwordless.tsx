import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import SwiperCore, { Pagination } from 'swiper'
import { Swiper, SwiperSlide } from 'swiper/react'

import HandsEmoji from '../../../../images/hands.svg'

SwiperCore.use([Pagination])

const view = (): Html<any> => _ => {

  const mobile =
    <Swiper
      watchOverflow={true}
      slidesPerView={1}
      spaceBetween={24}
      pagination={{ type: 'bullets' }}
      className="tooltip__content-container swiper-container"
    >
      <SwiperSlide>
        <p className="tooltip__content-text">An encryption key will be generated for you in the background and saved in this browser.</p>
        <p className="tooltip__content-text">You only have to share the link with the file sender and wait.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">An encryption key will be generated for you in the background and saved in this browser.</p>
          <p className="tooltip__content-text">You only have to share the link with the file sender and wait.</p>
        </div>
      </div>
    </div>

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__warning-wrap">
          <span className="tooltip__warning">This version uses IndexedDB API. <br /> Check our &#x200B;
            <a href="#" onClick={e => {
              e.stopPropagation()
              document.querySelector('.js-main-privacy')?.classList.add('show')
            }}>
              Cookie Policy.
            </a>
          </span>
        </div>

        <div className="tooltip__inner tooltip__inner--pink">
          <div className="tooltip__img">
            <img src={HandsEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">PASSWORDLESS</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
