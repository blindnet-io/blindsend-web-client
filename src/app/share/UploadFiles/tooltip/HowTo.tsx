import * as React from 'react'
import { Html } from 'elm-ts/lib/React'
import SwiperCore, { Pagination } from 'swiper'
import { Swiper, SwiperSlide } from 'swiper/react'

import MailIcon from '../../../../images/mail.svg'

SwiperCore.use([Pagination])

const view = (
  fileSizeLimit: string,
  totalSizeLimit: string,
  numOfFilesLimit: number
): Html<any> => _ => {

  const mobile =
    <Swiper
      watchOverflow={true}
      slidesPerView={1}
      spaceBetween={24}
      pagination={{ type: 'bullets' }}
      className="tooltip__content-container swiper-container"
    >
      <SwiperSlide>
        <p className="tooltip__content-text">Drop your files here and protect them with a password</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">The files will be uploaded and you will receive a unique link which you can share with anyone.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">Only those who have the password will be able to decrypt the files.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">You can share up to 10 files at a time. Individual file limit is 2GB and the total limit is 4GB.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">Drop your files here and<br />protect them with a password.</p>
          <p className="tooltip__content-text">The files will be uploaded and<br />you will receive a unique link<br /> which you can share with anyone.</p>
          <p className="tooltip__content-text">Only those who have the password<br /> will be able to decrypt the files.</p>
          <p className="tooltip__content-text">You can share up to 10 files at a time.<br /> Individual file limit is 2GB.<br /> Total limit is 4GB.</p>
        </div>
      </div>
    </div>

  return (
    <div className="tooltip__wrap col-lg-3">
      <div className="tooltip">
        <div className="tooltip__inner tooltip__inner--default">
          <div className="tooltip__img">
            <img src={MailIcon} alt="" />
          </div>
          <h2 className="tooltip__title section-title">HOW TO</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
