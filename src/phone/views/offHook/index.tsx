import * as React from 'react'
import { AnswerPhoneIcon } from '../phoneButtons'
import styled from 'styled-components'
import { throttle } from '../../helper/throttle'
import { Translator } from '../../../translator/translator'
import { Keyboard } from '../keyboard'
import { ClickableIcon } from '../clickableIcon'

import './OffHook.css'
import { RemoteCodes } from '../../remote'

type CallFunction = (callNumber: string) => void

interface OffHookProps {
  call: CallFunction
  translator: Translator
  lang?: string
}

interface OffHookState {
  callNumber: string
}

const numberValidationRegExp = /^\+?[0-9]*$/

const StyledIcon = styled(ClickableIcon)`
  width: 36px;
`

export class OffHook extends React.Component<OffHookProps, OffHookState> {
  constructor(props: OffHookProps) {
    super(props)
    this.state = { callNumber: '' }

    this.handleChange = this.handleChange.bind(this)
    this.onKeyDown = this.onKeyDown.bind(this)
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.keyCode === 13 || e.code === RemoteCodes.ANSWER_KEY) {
      this.call()
    } else if (/[0-9]/.test(e.key.toString())) {
      this.addNumber(e.key.toString())
    } else if (e.key === 'Backspace' || e.code === RemoteCodes.BACK) {
      this.removeNumber()
    }
  }

  private addNumber(value: string) {
    this.setState(state => ({ callNumber: `${state.callNumber}${value}` }))
  }

  private removeNumber() {
    this.setState(state => ({ callNumber: state.callNumber ? state.callNumber.slice(0, -1) : '' }))
  }

  @throttle(1000)
  call() {
    this.props.call(this.state.callNumber)
  }

  handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (numberValidationRegExp.test(e.target.value)) {
      this.setState({ callNumber: e.target.value })
    }
  }

  render() {
    return (
      <div className="offHook-container">
        <div className="left">
          <div>
            <label className="label">Number</label>
            <div className="input-container">
              <input id="callNumber" className="number" type="string" value={this.state.callNumber} onChange={this.handleChange} onKeyDown={e => e.preventDefault()} autoFocus />
              <StyledIcon className="input-icon" icon="backspace" onClick={this.removeNumber.bind(this)} />
            </div>
          </div>
          <AnswerPhoneIcon answer={this.call.bind(this)} />
        </div>
        <div className="right">
          <Keyboard keyPressed={this.addNumber.bind(this)} />
        </div>
      </div>
    )
  }

  componentDidMount() {
    document.addEventListener('keydown', this.onKeyDown)
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.onKeyDown)
  }
}
