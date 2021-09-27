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
        <p className="tooltip__content-text">Copy the link, and ask the file sender to visit the link and upload the file.</p>
        <p className="tooltip__content-text">The file will be <b>end-to-end</b> encrypted from him to you, and only you will be able to decrypt it.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">Feel free to share the link with the sender over a non-secure chanel (e-mail or else). The <b>end to-end</b> encryption protects you.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">Copy the link, and ask the file sender to visit the link and upload the file.</p>
          <p className="tooltip__content-text">The file will be <b>end-to-end</b> encrypted from him to you, and only you will be able to decrypt it.</p>
        </div>
        <div className="tooltip__slide">
          <p className="tooltip__content-text">Feel free to share the link with the sender over a non-secure chanel (e-mail or else). The <b>end to-end</b> encryption protects you.</p>
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
