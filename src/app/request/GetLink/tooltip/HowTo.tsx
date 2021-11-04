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
        <p className="tooltip__content-text">To request the encrypted files from someone, pick a password and you’ll receive a <b>unique link</b>.</p>
        <p className="tooltip__content-text"><b>Send</b> the link to the person you are requesting files from, and wait for them to upload the file.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">The file will wait for you encrypted, for your eyes only.</p>
        <p className="tooltip__content-text">Magic. GDPR-compliant. Enjoy.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">To request the encrypted files from someone, pick a password and you’ll receive a <b>unique link</b>.</p>
          <p className="tooltip__content-text"><b>Send</b> the link to the person you are requesting files from, and wait for them to upload the file.</p>
        </div>
        <div className="tooltip__slide">
          <p className="tooltip__content-text">The file will wait for you encrypted, for your eyes only.</p>
          <p className="tooltip__content-text">Magic. GDPR-compliant. Enjoy.</p>
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
          <h2 className="tooltip__title section-title">HOW TO</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
