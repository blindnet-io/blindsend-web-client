import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import SwiperCore, { Pagination } from 'swiper'
import { Swiper, SwiperSlide } from 'swiper/react'

import ThinkEmoji from '../../../../images/think-emoji.svg'

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
        <p className="tooltip__content-text">Your files will be waiting on the exchange link.</p>
        <p className="tooltip__content-text">If you didn't set up the password, make sure to share the link using a private channel.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">Otherwise, don't share the password on the same channel as the link.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">Your files will be waiting on the exchange link.</p>
          <p className="tooltip__content-text">If you didn't set up the password, make sure to share the link using a private channel.</p>
          <p className="tooltip__content-text">Otherwise, don't share the password on the same channel as the link.</p>
        </div>
      </div>
    </div>

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--default">
          <div className="tooltip__img">
            <img src={ThinkEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">NOW WHAT?</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
