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
        <p className="tooltip__content-text">Drop your files here and protect them with password. When you are ready, click <b>SEND</b>.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">You can upload up to <b>{numOfFilesLimit}</b> files.<br />Individual file size limit is <b>{fileSizeLimit}</b> and total limit is <b>{totalSizeLimit}</b>.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">Your files will be encrypted on your machine using a key derived from password.</p>
      </SwiperSlide>
      <SwiperSlide>
        <p className="tooltip__content-text">Only the ones know the password will be able to decrypt the files.</p>
      </SwiperSlide>
    </Swiper>

  const desktop =
    <div className="tooltip__content-container">
      <div className="tooltip__content">
        <div className="tooltip__slide">
          <p className="tooltip__content-text">Drop your files here and protect them with password. When you are ready, click <b>SEND</b>.</p>
          <p className="tooltip__content-text">You can upload up to <b>{numOfFilesLimit}</b> files.<br />Individual file size limit is <b>{fileSizeLimit}</b> and total limit is <b>{totalSizeLimit}</b>.</p>
          <p className="tooltip__content-text">Your files will be encrypted in the browser using a key derived from password.</p>
          <p className="tooltip__content-text">Only the ones know the password will be able to decrypt the files.</p>
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
          <h2 className="tooltip__title section-title">Encrypt and send files</h2>
          {window.matchMedia('(max-width: 1099px)').matches ? mobile : desktop}
        </div>
      </div>
    </div>
  )
}

export { view }
