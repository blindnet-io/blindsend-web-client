import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import SwiperCore, { Pagination } from 'swiper'
import { Swiper, SwiperSlide } from 'swiper/react'

import AmazingEmoji from '../../../../images/amazing.svg'

SwiperCore.use([Pagination])

const view = (passNotCorrect: Boolean): Html<any> => _ => {

  const mobile =
    <Swiper
      watchOverflow={true}
      slidesPerView={1}
      spaceBetween={24}
      pagination={{ type: 'bullets' }}
      className="tooltip__content-container swiper-container"
      style={{ marginTop: '10px' }}
    >
      <SwiperSlide>
        <p className="tooltip__content-text">Enter {passNotCorrect && 'the correct '}password to see files.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">The password was set by you when you created this link.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container" style={{ marginTop: '20px' }}>
      <div className="tooltip__content">
        <div className="swiper-slide">
          <p className="tooltip__content-text">Enter {passNotCorrect && 'the correct '}password to see files.</p>
          <p className="tooltip__content-text">The password was set by you when<br />you created this link.</p>
        </div>
      </div>
      <div className="tooltip__pagination"></div>
    </div>

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--strong">
          <div className="tooltip__img">
            <img src={AmazingEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">FILES ARE READY FOR YOU</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
