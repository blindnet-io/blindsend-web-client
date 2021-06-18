import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import SwiperCore, { Pagination } from 'swiper'
import { Swiper, SwiperSlide } from 'swiper/react'

import WeakEmoji from '../../../images/weak.svg'

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
        <p className="tooltip__content-text">This is an OK password. <br /> It’d take 10k years to guess it! Good job.</p>
        <p className="tooltip__content-text"> Now click on “<b>Generate link</b>” to get a blindsend lint that you can share with the file sender.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">The file will be waiting for you, encrypted, once they upload it.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">This is an OK password. <br /> It’d take 10k years to guess it! Good job.</p>
          <p className="tooltip__content-text"> Now click on “<b>Generate link</b>” to get a blindsend lint that you can share with the file sender.</p>
        </div>
        <div className="tooltip__slide">
          <p className="tooltip__content-text">The file will be waiting for you, encrypted, once they upload it.</p>
        </div>
      </div>
    </div>

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--weak">
          <div className="tooltip__img">
            <img src={WeakEmoji} alt="" />
          </div>
          <h2 className="tooltip__title section-title">WEAK PASSWORD</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
