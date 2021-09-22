import * as React from 'react'
import { Html } from 'elm-ts/lib/React'

import BlindsendLogo from '../../../images/blindsend.svg'

const view = (): Html<any> => _ => {

  window.addEventListener('keyup', e => {
    e.preventDefault();
    if (e.code === 'Escape' || e.keyCode === 27) {
      document.querySelector('.js-main-terms')?.classList.remove('show')
    }
  })

  return (
    <div className="main-privacy js-main-terms">
      <div className="site-header">
        <div className="site-nav__img">
          <a href="/" style={{ 'borderBottom': 'none' }}><img src={BlindsendLogo} alt="" /></a>
        </div>
        <span className="site-privacy__close" onClick={() => {
          document.querySelector('.js-main-terms')?.classList.remove('show')
        }}>
          &#10005;
        </span>
      </div>
      <div className="main-privacy__content">
        <h1 className="main-privacy__title">Terms and conditions</h1>
        <p>
          <b>Terms and Conditions of Sale and Use</b>
        </p>
        <p>
          The Terms and Conditions of Sale and Use (TCSU) are the full contractual terms and conditions binding the Service Provider, BLINDNET Inc, an American corporation, having its registered offices at 651 N Broad St, Suite 206 Middletown - 19709 New Castle (United States of America) and the client (the Client).
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>1. Definitions</b></div>
        <div>
          <p>
            &laquo; <b> Administration Panel </b> &raquo; means the control panel to manage their end users, backend processes, and workflows
            <br /><br />
            &laquo; <b> Agreement </b> &raquo; means Terms and Conditions of Sale and Use
            <br /><br />
            &laquo; <b> Client </b> &raquo; means an individual or legally recognized entity that has entered into the subscription of the services provided by BLINDNET Inc
            <br /><br />
            &laquo; <b> Conditions </b> &raquo; means Terms and Conditions of Sale and Use
            <br /><br />
            &laquo; <b> Dashboard </b> &raquo; the User interface presenting information
            <br /><br />
            &laquo; <b> Party </b> &raquo; means a person or entity who takes part in the Terms and Conditions of Sale and Use
            <br /><br />
            &laquo; <b> Service Provider </b> &raquo; means BLINDNET Inc, the company that supplies the Services to the Client
            <br /><br />
            &laquo; <b> Services </b> &raquo; means the data maintenance and hosting operated
            by the Service Provider
            <br /><br />
            &laquo; <b> Software </b> &raquo; means all the object and binary code programs developed by the Service Provider which enable the Client to perform the
            operations. The Software includes the Administration Panel functionality.
            <br /><br />
            &laquo; <b> User </b> &raquo; means, as appropriate, the Client or the
            Client&#39;s staff members authorised to use the Software
          </p>
        </div>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>2. Purpose</b></div>
        <p>
          The purpose of these general conditions is to define the contractual terms that exist between the Service Provider and the Client. The Service Provider grants to the Client under these conditions a non-exclusive and non-transferable Licence to use the Services. These Conditions apply to blindnet.io services, blindsend and privateform.
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>3. Term</b></div>
        <p>
          The Terms and Conditions of Sale and Use come into force from the moment of acceptance by the Client of these Conditions and will be entering into force for one month. The Conditions can be explicitly or implicitly accepted by the Client. The Client can accept the conditions explicitly by ticking the box stipulated for such purpose. Otherwise, the Client using the services is reputed having accepted the Conditions. The Agreement is tacitly renewed for successive periods with the same duration.
        </p>
        <p>
          This Agreement may be terminated by either Party, with or without cause, anytime during or after the end of the initial term. The Service Provider may terminate this Agreement immediately, at any time, with or without notice. The Client’s declaration of termination results in unsubscribing from the service. The termination date is that of the unsubscription validation. In the event that the Client has opted for a plan that includes a subscription, he will have to pay the cost of the monthly subscription and for what he has consumed at the moment of the termination. In the event that the plan chosen by the Client does not include a subscription, the Client will only pay for what he has consumed at the moment of the termination.
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>4. Licence</b></div>
        <p>
          Any software application, including without limitation, the Service Provider’s portal or other Service Provider website, and documentation associated with any application as well as any local computer files installed as a result, in each case, provided by or on behalf of the Service Provider, may be used in object code form only and solely by Client for Client’s internal business purposes. The Client may not (a) provide, disclose or make Service Provider Software available to any third party, or (b) decompile, reverse engineer, disassemble, modify, rent, lease, loan, distribute, or create derivative works or improvements from the Service Provider Software, no license under patents, copyrights, trademarks, service marks, trade names or other indicia of origins or other right is granted to Client in the Service Provider Software or in the Service Provider trademark, copyright, patent, trade secret or other proprietary rights nor shall any such rights be implied or arise by estoppel with respect to any transactions contemplated under the Agreement.
        </p>
        <p>
          The Client warrants not to use the service for illegal activities, activities carried out for illegal purposes or other improper activities. The Service Provider reserves the right to terminate this Agreement in the event that it has reason to believe that the customer does not comply with the conditions of this Agreement.
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>5. Software upgrade</b></div>
        <p>
          The service provider reserves the right to update the software features in line with technological developments or market demands. In this sense, the Service provider can add or remove one or more functionalities. Also, the Service Provider can change the way the functionalities are implemented and/or the way they operate.
        </p>
        <p>
          In the event that essential features of the Software are removed or modified, the Service Provider will notify the Client at least one month before they are removed or modified. In this case, the Client may terminate the contract. If the Client fails to terminate the contract before they are actually removed or modified, he will be deemed to have accepted the corresponding removal or modification. In this case the Client will continue to use the modified service continuing to pay as subscribed.
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>6. Client rights</b></div>
        <p>The Service provider grants the Client a license to use the Administration Panel for their own purposes only and a user license for its users to use the software in the course of their professional duties. The provider grants these services on a non-exclusive, non-assignable and non-transferable basis for the entire duration of the TCSU.
        </p>
        <p>
          In consideration of this, without prejudice to the statutory rights recognized by applicable law, the Client undertakes not to transfer, sublicense or grant access to the Software, or otherwise make it available to third parties in any way, including any company in its group, and also in the context of IT management services or consultancy services on a temporary or free basis, unless the Client has obtained the prior and express authorization of the Service Provider.
        </p>
        <p>
          The Client agrees to inform Users of the Software of any limitations imposed on their use of the Software under the license granted herein, and warrants that its Users will comply with the TCSU.
        </p>


        <p>
          In all circumstances, the Software’s intellectual property remains the property of the Service Provider, who is the only one who owns the rights to have the software used and marketed.
        </p>
        <p>
          Accordingly, the Client may not pledge, assign, sub-licence, lend or allow access to it, whether for valuable consideration or free of charge. Moreover, the Client undertakes to inform the Service Provider of any infringement of the Service Provider's intellectual property rights of which it becomes aware.
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>8. Warranties</b></div>
        <p>
          Throughout the term of the Licence, the Service Provider is committed to offer the Client a quality service and to give to the Client all corresponding updates necessary to ensure a consistent level of service. To that effect, the Client undertakes to report to the Service Provider any problems it may encounter or observe when using the Software.
          The Service Provider does not provide any warranty concerning the suitability of the Software for the Client's specific needs, or its compatibility with any computer program run alongside it. As such, the Client shall be responsible for assessing its specific needs, evaluating the suitability of the Software in view of those needs, and ensuring that it has the necessary skills to use the Software and a compatible computer environment. By accepting the Licence Terms and Conditions, the Client acknowledges that it has received all necessary information in this connection.
          As the Software comprises cutting-edge technology, it is not possible in the current state of computer science to test and verify all the possible uses and to warrant that it is free from all errors. In view thereof, the Client may, if it considers it appropriate, put in place suitable plans in the event of a failure or suitable measures to minimise any harmful consequences of, for example, the loss of data generated by the Software as a result of its use.
        </p>
        <p>
          Due to the fast evolution of the software, the related documentation will be progressively modified. The responsibility for viewing the most recent corresponding documentation lies solely with the Client. The Service Provider commits to take care and update the documentation so that it fits the actual functionalities offered by the system, but no warranty is given.
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>9. Personal data</b></div>
        <p>
          Everything in relation to the personal data rights of Users is defined in the Privacy Policy, that is to be considered an integral part of the present Terms
        </p>

        <div style={{ fontSize: '25px', marginTop: '30px' }}><b>10. General provisions </b></div>
        <p>
          The Terms and Conditions of Sale and Use are governed by French law. In the event of a difficulty arising from pre-contractual relations or related to the validity, execution or interpretation of the present Terms, the Parties will seek an amicable solution as a priority. In the absence of an amicable agreement, the dispute will be submitted to the courts of Paris, that shall have exclusive jurisdiction to hear any dispute arising between the Parties.
        </p>
        <p>
          These Terms and Conditions of Sale and Use apply from September 22nd 2021.
        </p>
      </div >
    </div >
  )
}

export { view }