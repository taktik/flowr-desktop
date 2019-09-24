import * as React from 'react'
import { RegisterStateMachine, REGISTERED_STATE } from '../stateMachines/registerStateMachine'
import { IpcRenderer } from 'electron'
import { WindowModes } from '../WindowModes'
import { MainView } from './mainView'
import './icons'
import { CallState, CallStateMachine, INCOMING_STATE, CALL_OUT_STATE, OFF_HOOK_STATE } from '../stateMachines/callStateMachine'
import { fsm } from 'typescript-state-machine'
import TransitionListener = fsm.ListenerRegistration
import { PhoneStateMachine } from '../stateMachines/factory'
import styled from 'styled-components'
import { ClickableIcon } from './clickableIcon'
import { Translator } from '../../../translator/translator'
import { fr } from '../translations/fr'

declare global {
  interface Window {
    ipcRenderer: IpcRenderer
  }
}

type PhoneProps = {
  phoneServer: string | null,
  className?: string,
  registerProps: RegisterProps | null,
  lang?: string,
  capabilities?: {[key: string]: boolean},
}

type PhoneAppState = {
  callState: CallState | null,
  mode?: WindowModes,
  waiting: boolean,
  lang?: string,
  isMute: boolean,
  callingNumber: string,
  capabilities: {[key: string]: boolean} | undefined,
}

export type RegisterProps = {
  username: string,
  host: string,
}

const UpperRightIcon = styled(ClickableIcon)`
  position: fixed;
  top: 12px;
  left: 12px;
  width: 24px;
  color: white;
`

export enum PhoneCapabilities {
  EMIT = 'emit',
  RECEIVE = 'receive',
}

export class Phone extends React.Component<PhoneProps, PhoneAppState> {
  private registerStateMachine: RegisterStateMachine
  private callStateMachine: CallStateMachine
  private callStateMachineListeners: TransitionListener[] = []
  private _ipc: IpcRenderer = window.ipcRenderer
  private _translator: Translator = new Translator()
  private _capabilities: {[key: string]: boolean} | undefined

  private ipcSend(message: string, payload: {[key: string]: any} = {}): () => void {
    return () => this._ipc.send(message, payload)
  }

  constructor(props: PhoneProps) {
    super(props)
    const { registerStateMachine, callStateMachine } = PhoneStateMachine.factory(props.phoneServer, props.registerProps)
    this.registerStateMachine = registerStateMachine
    this.callStateMachine = callStateMachine

    this._ipc.on('window-mode-changed', this.windowModeChanged.bind(this))
    this._ipc.on('register-props', this.receivedRegisterProps.bind(this))
    this._ipc.on('change-language', (e: Event, lang: string) => this.setState({ lang }))
    this._ipc.on('mute-changed', this.muteStatusChanged.bind(this))
    this._ipc.on('capabilities-changed', this.capabilitiesChanged.bind(this))

    this.registerStateMachine.onEnterState(REGISTERED_STATE, this.listenToCallStateMachine.bind(this))
    this.registerStateMachine.onLeaveState(REGISTERED_STATE, this.unlistenToCallStateMachine.bind(this))

    this._translator.addKeys('fr', fr)

    this.state = { callState: null, waiting: false, lang: props.lang, isMute: false, callingNumber: this.callStateMachine.callingNumber, capabilities: props.capabilities }
  }

  canEmit(): boolean {
    return !this._capabilities || this._capabilities[PhoneCapabilities.EMIT]
  }

  canReceive(): boolean {
    return !this._capabilities || this._capabilities[PhoneCapabilities.RECEIVE]
  }

  muteStatusChanged(e: Event, isMute: boolean) {
    this.setState({ isMute })
  }

  windowModeChanged(e: Event, mode: WindowModes) {
    this.setState({ mode })
  }

  receivedRegisterProps(e: Event, registerProps: RegisterProps) {
    console.log('Received register props', registerProps)
    this.registerStateMachine.registerProps = registerProps
  }

  stateChanged(from: CallState, to: CallState) {
    if (
        !this.canEmit() && to === CALL_OUT_STATE ||
        !this.canReceive() && to === INCOMING_STATE
    ) {
      return
    }
    if (!this.canEmit() && to === OFF_HOOK_STATE) {
      this.hide()
    }
    this.setState({ callState: to, callingNumber: this.callStateMachine.callingNumber })
  }

  capabilitiesChanged(e: Event, capabilities: {[key: string]: boolean} | undefined) {
    this._capabilities = capabilities
    this.setState({ capabilities })
  }

  listenToCallStateMachine() {
    if (!this.callStateMachineListeners.length) {
      this.callStateMachineListeners = [
        this.callStateMachine.onAnyTransition(this.stateChanged.bind(this)),
        this.callStateMachine.onEnterState(INCOMING_STATE, this.ipcSend('phone-show')),
      ]
    }
    this.setState({ callState: this.callStateMachine.state })
  }

  unlistenToCallStateMachine() {
    if (this.callStateMachineListeners) {
      this.callStateMachineListeners.forEach(listener => listener.cancel())
      this.callStateMachineListeners = []
    }
    this.setState({ callState: null })
  }

  call(callNumber: string) {
    if (this.canEmit()) {
      this.callStateMachine.call(callNumber)
    }
  }

  answer() {
    if (this.canReceive()) {
      this.callStateMachine.answer()
    }
  }

  hangup() {
    this.callStateMachine.terminate()
  }

  hide() {
    this.hangup()
    this.ipcSend('phone-hide')()
  }

  render() {
    return (
      <div className={this.props.className}>
        <MainView
            translator={this._translator}
            lang={this.state.lang}
            callState={this.state.callState}
            waiting={this.state.waiting}
            call={this.call.bind(this)}
            answer={this.answer.bind(this)}
            hangup={this.hangup.bind(this)}
            mute={this.ipcSend('phone-mute')}
            callingNumber={this.state.callingNumber}
            capabilities={this.state.capabilities}
        />
        <UpperRightIcon onClick={this.hide.bind(this)} icon="times" />
      </div>
    )
  }

  componentWillUnmount() {
    this.unlistenToCallStateMachine()
  }
}