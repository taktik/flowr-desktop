import * as React from 'react'
import { FlexRowSpaceEvenly } from '../flex'
import { AnswerPhoneIcon, HangupPhoneIcon } from '../phoneButtons'
import './Incoming.css'
import { RemoteCodes } from '../../remote'
import { Translator } from '../../../../translator/translator'
import { CallingNumber } from '../phone'
import { formatCallingNumber } from '../../helper/format'

interface IncomingProps {
  answer: () => void
  hangup: () => void
  translator: Translator
  lang?: string
  callingNumber: CallingNumber
}

export class Incoming extends React.Component<IncomingProps> {
  private onKeyDown(e: KeyboardEvent) {
    if (e.keyCode === 13 || e.code === RemoteCodes.ANSWER_KEY || e.code === RemoteCodes.ANSWER_GESTURE) {
      this.props.answer()
    } else if (e.code === RemoteCodes.HANGUP_KEY || e.code === RemoteCodes.HANGUP_GESTURE) {
      this.props.hangup()
    }
  }

  constructor(props: IncomingProps) {
    super(props)
    this.onKeyDown = this.onKeyDown.bind(this)
  }

  render(): JSX.Element {
    return (
      <div className="incoming-call-container">
        <h2 className="title">
          {this.props.translator.translate(
            'Incoming Call',
            this.props.lang,
          )}
        </h2>
        <h1 className="phoneNumber">
          {formatCallingNumber(this.props.callingNumber) || ''}
        </h1>
        <FlexRowSpaceEvenly className="buttons-container">
          <div className="buttonContainer">
            <AnswerPhoneIcon answer={this.props.answer} />
            <span className="buttonSpan">
              {this.props.translator.translate('Accept', this.props.lang)}
            </span>
          </div>
          <div className="buttonContainer">
            <HangupPhoneIcon hangup={this.props.hangup} />
            <span className="buttonSpan">
              {this.props.translator.translate('Decline', this.props.lang)}
            </span>
          </div>
        </FlexRowSpaceEvenly>
        <p className="warning">
          {this.props.translator.translate(
            'Pick Up the phone',
            this.props.lang,
          )}
        </p>
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
