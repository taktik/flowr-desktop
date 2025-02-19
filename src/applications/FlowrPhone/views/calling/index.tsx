import * as React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { CALL_OUT_STATE, ANSWERED_STATE, CallState, OUTGOING_STATE } from '../../stateMachines/callStateMachine'
import styled from 'styled-components'
import { HangupPhoneIcon } from '../phoneButtons'
import { FlexRowCenter } from '../flex'
import { Translator } from '../../../../translator/translator'
import { formatElapsedTime } from '../../helper/time'

import './Calling.css'
import { robotoMedium } from '..'
import { RemoteCodes } from '../../remote'
import { Keyboard } from '../keyboard'
import { KeyPadIcon } from '../otherButtons'
import { CallingNumber } from '../phone'
import { formatCallingNumber } from '../../helper/format'

interface CallingProps {
  mode: CallState
  hangup: () => void
  mute: () => void
  sendKey?: (value: string) => void
  className?: string
  translator: Translator
  lang?: string
  callingNumber: CallingNumber
  elapsedTime: number
}

interface CallingState {
  displayKeyPad: boolean
}

const ElapsedTime = styled(FlexRowCenter)`
  color: white;
  font-size: 24px;
  font-family: 'Roboto', Arial, Helvetica, sans-serif;
  font-weight: 400;
  text-align: center;
  width: 100%;
`

const Rotating = styled(FontAwesomeIcon)`
  width: 40px;
  color: white;
  animation: rotate 2s linear infinite;
  @keyframes rotate {
    100% {
      transform: rotate(360deg);
    }
  }
`

const PhoneNumber = styled.h1`
  color: white;
  margin: 0;
  ${robotoMedium}
`

export class Calling extends React.Component<CallingProps, CallingState> {
  private onKeyDown(e: KeyboardEvent) {
    if (e.code === RemoteCodes.HANGUP_GESTURE || e.code === RemoteCodes.HANGUP_KEY) {
      this.props.hangup()
    } else if (/^[0-9*#]$/.test(e.key.toString())) {
      this.props.sendKey(e.key.toString())
    } else if (e.key === RemoteCodes.HASH) {
      this.props.sendKey('#')
    }
  }

  constructor(props: CallingProps) {
    super(props)
    this.state = { displayKeyPad: false }

    this.onKeyDown = this.onKeyDown.bind(this)
  }

  toggleKeyboard(): void {
    this.setState(state => ({ displayKeyPad: !state.displayKeyPad }))
  }

  render(): JSX.Element {
    let title
    let elapsedTime

    if ([ANSWERED_STATE, CALL_OUT_STATE].includes(this.props.mode)) {
      elapsedTime = (<ElapsedTime><span>{formatElapsedTime(this.props.elapsedTime)}</span></ElapsedTime>)
    } else {
      elapsedTime = (<Rotating icon="circle-notch" spin />)
    }

    if ([OUTGOING_STATE, CALL_OUT_STATE].includes(this.props.mode)) {
      title = (
        <h2 className="title">{this.props.translator.translate('Calling', this.props.lang)}</h2>
      )
    } else if (this.props.mode === ANSWERED_STATE) {
      title = (
        <h2 className="title">{this.props.translator.translate('Answered', this.props.lang)}...</h2>
      )
    } else {
      title = (<h2 className="title"></h2>)
    }

    let keyboard

    if (this.props.sendKey && this.state.displayKeyPad) {
      keyboard = (<div className="extra-keyboard"><Keyboard keyPressed={this.props.sendKey.bind(this)}/></div>)
    } else {
      keyboard = null
    }

    return (
      <div className="calling-container">
        {title}
        <PhoneNumber className="phoneNumber">
          {formatCallingNumber(this.props.callingNumber)}
        </PhoneNumber>
        <div className="flex-container">
          <div className="flex-column width-50">
            {elapsedTime}
            <div className="flex-row">
              <div className="buttonContainer">
                <KeyPadIcon
                  displayKeyPad={this.toggleKeyboard.bind(this)}
                />
                <span className="buttonSpan">
                  {this.props.translator.translate(
                    'Keypad',
                    this.props.lang,
                  )}
                </span>
              </div>
              <div className="buttonContainer">
                <HangupPhoneIcon hangup={this.props.hangup} />
                <span className="buttonSpan">
                  {this.props.translator.translate(
                    'Hang Up',
                    this.props.lang,
                  )}
                </span>
              </div>
            </div>
            <p className="warning">
              {this.props.translator.translate(
                'Pick Up the phone',
                this.props.lang,
              )}
            </p>
          </div>

          {keyboard}
        </div>
      </div>
    )
  }

  componentDidMount(): void {
    document.addEventListener('keydown', this.onKeyDown)
  }

  componentWillUnmount(): void {
    document.removeEventListener('keydown', this.onKeyDown)
  }
}
