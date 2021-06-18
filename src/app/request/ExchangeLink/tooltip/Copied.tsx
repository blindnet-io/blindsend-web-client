import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import SwiperCore, { Pagination } from 'swiper'
import { Swiper, SwiperSlide } from 'swiper/react'

import ClapEmoji from '../../../../images/clap.svg'

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
        <p className="tooltip__content-text">Provide the file sender with the link and ask them to upload the file there.</p>
        <p className="tooltip__content-text">Feel free to share the link with the sender over a non-secure chanel (e-mail or else).</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">The <b>end-to-end</b> encryption protects you.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">Provide the file sender with the link and ask them to upload the file there.</p>
          <p className="tooltip__content-text">Feel free to share the link with the sender over a non-secure chanel (e-mail or else).</p>
        </div>
        <div className="tooltip__slide">
          <p className="tooltip__content-text">The <b>end-to-end</b> encryption protects you.</p>
        </div>
      </div>
    </div>

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--strong">
          <div className="tooltip__img">
            <img src={ClapEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">YOU’VE COPIED THE LINK</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
