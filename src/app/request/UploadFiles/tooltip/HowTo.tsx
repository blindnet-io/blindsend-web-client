import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import SwiperCore, { Pagination } from 'swiper'
import { Swiper, SwiperSlide } from 'swiper/react'

import MailIcon from '../../../../images/mail.svg'

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
        <p className="tooltip__content-text">Drop your files here. When you are ready, click “<b>SEND</b>” and the magic will happen.</p>
        <p className="tooltip__content-text">Your files will be end-to-end encrypted from your machine, and delivered to the received.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">Drop your files here. When you are ready, click “<b>SEND</b>” and the magic will happen.</p>
          <p className="tooltip__content-text">Your files will be end-to-end encrypted from your machine, and delivered to the received.</p>
        </div>
      </div>
    </div>

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__warning-wrap">
          <span className="tooltip__warning">The sender has not uploaded any files yet.</span>
        </div>

        <div className="tooltip__inner tooltip__inner--default">
          <div className="tooltip__img">
            <img src={MailIcon} alt="" />
          </div>
          <h2 className="tooltip__title section-title">You are the sender?</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
