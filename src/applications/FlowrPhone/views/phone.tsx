/* eslint-disable no-console */
import * as React from 'react'
import { RegisterStateMachine, REGISTERED_STATE } from '../stateMachines/registerStateMachine'
import { IpcRenderer } from 'electron'
import { WindowModes } from '../WindowModes'
import { MainView } from './mainView'
import './icons'
import {
  CallState,
  CallStateMachine,
  INCOMING_STATE,
  CALL_OUT_STATE,
  OFF_HOOK_STATE,
  ANSWERED_STATE,
  OUTGOING_STATE,
} from '../stateMachines/callStateMachine'
import { ListenerRegistration as TransitionListener } from 'typescript-state-machine'
import { PhoneStateMachine } from '../stateMachines/factory'
import { Translator } from '../../../translator/translator'
import { fr } from '../translations/fr'
import { History, PhoneHistory } from '../features/history'
import { UserStore } from '../features'
import { Favorites } from '../features/favorites'

declare global {
  interface Window {
    ipcRenderer: IpcRenderer
    openKeyboard: () => Promise<void>
    closeKeyboard: () => Promise<void>
  }
}

type PhoneProps = {
  phoneServer: string | null,
  phoneMessagingNumber?:string,
  className?: string,
  registerProps: RegisterProps | null,
  lang?: string,
  capabilities?: {[key: string]: boolean},
  currentUser: string,
  history: boolean,
  favorites: boolean,
  applyExternalPhoneNumberPrefix?: boolean
}

type PhoneAppState = {
  callState: CallState | null,
  mode?: WindowModes,
  waiting: boolean,
  lang?: string,
  isMute: boolean,
  callingNumber: CallingNumber,
  messagingNumber?: string,
  capabilities: {[key: string]: boolean} | undefined,
  phoneHistory: PhoneHistory[],
  favorites: CallingNumber[],
  elapsedTime: number,
}

interface CallingNumber {
  name?: string,
  value: string
}

type RegisterProps = {
  username: string,
  host: string,
}

enum PhoneCapabilities {
  EMIT = 'emit',
  RECEIVE = 'receive',
}

interface PhoneStore {
  history?: UserStore<PhoneHistory>
  favorites?: UserStore<CallingNumber>
}

class Phone extends React.Component<PhoneProps, PhoneAppState> {
  private registerStateMachine: RegisterStateMachine
  private callStateMachine: CallStateMachine
  private callStateMachineListeners: TransitionListener[] = []
  private _ipc: IpcRenderer = window.ipcRenderer
  private _translator: Translator = new Translator()
  private _capabilities: {[key: string]: boolean} | undefined
  private _history: History | undefined = undefined
  private _favorites: Favorites | undefined = undefined

  private tickRequest: number | null = null
  private firstTick: number | undefined = undefined

  private _ipcEvents: {[key: string]: (...args: any[]) => void} = {
    'window-mode-changed': this.windowModeChanged.bind(this),
    'register-props': this.receivedRegisterProps.bind(this),
    'change-language': (e: Event, lang: string) => this.setState({ lang }),
    'mute-changed': this.muteStatusChanged.bind(this),
    'capabilities-changed': this.capabilitiesChanged.bind(this),
    'history-changed': this.historyChanged.bind(this),
    'current-user-changed': this.currentUserChanged.bind(this),
    'store-updated': this.storeUpdated.bind(this),
  }

  private ipcSend(message: string, payload: {[key: string]: any} = {}): () => void {
    return () => this._ipc.send(message, payload)
  }

  private storeFor(namespace: string) {
    return (data: {[key: string]: any}) => {
      this.ipcSend('update-phone-store', { [namespace]: data })()
    }
  }

  private callingNumberChanged(callingNumber: CallingNumber) {
    this.setState({ callingNumber })
  }

  constructor(props: PhoneProps) {
    super(props)
    this._capabilities = props.capabilities
    const {
      registerStateMachine,
      callStateMachine
    } = PhoneStateMachine.factory(
      props.phoneServer,
      props.registerProps,
      this.callingNumberChanged.bind(this),
      this.canReceive(),
    )
    this.registerStateMachine = registerStateMachine
    this.callStateMachine = callStateMachine

    Object.entries(this._ipcEvents).forEach(entry => this._ipc.on(entry[0], entry[1]))

    this.registerStateMachine.onEnterState(REGISTERED_STATE, this.listenToCallStateMachine.bind(this))
    this.registerStateMachine.onLeaveState(REGISTERED_STATE, this.unlistenToCallStateMachine.bind(this))

    this._translator.addKeys('fr', fr)

    this.state = {
      callState: null,
      waiting: false,
      lang: props.lang,
      isMute: false,
      messagingNumber: props.phoneMessagingNumber,
      callingNumber: { value: '' },
      capabilities: props.capabilities,
      phoneHistory: [],
      favorites: [],
      elapsedTime: 0,
    }
    this.ipcSend('update-phone-store')()
  }

  setHistory(enabled: boolean, currentUser: string): void {
    if (enabled) {
      if (!this._history) {
        this._history = new History({ currentUser, save: this.storeFor('history') })
      } else {
        this._history.user = currentUser || ''
      }
    }
  }

  setFavorites(enabled: boolean, currentUser: string): void {
    if (enabled) {
      if (!this._favorites) {
        this._favorites = new Favorites({ currentUser, save: this.storeFor('favorites') })
      } else {
        this._favorites.user = currentUser || ''
      }
    }
  }

  saveFavorite(favorite: CallingNumber): void {
    if (this._favorites) {
      this._favorites.add(favorite)
    }
  }

  removeFavorite(favorite: CallingNumber): void {
    if (this._favorites) {
      this._favorites.remove(favorite)
    }
  }

  canEmit(): boolean {
    return !this._capabilities || this._capabilities[PhoneCapabilities.EMIT]
  }

  canReceive(): boolean {
    return !this._capabilities || this._capabilities[PhoneCapabilities.RECEIVE]
  }

  muteStatusChanged(e: Event, isMute: boolean): void {
    this.setState({ isMute })
  }

  windowModeChanged(e: Event, mode: WindowModes): void {
    this.setState({ mode })
  }

  receivedRegisterProps(e: Event, registerProps: RegisterProps): void {
    this.registerStateMachine.registerProps = registerProps
  }

  stateChanged(from: CallState, to: CallState): void {
    if (this.tickRequest) {
      cancelAnimationFrame(this.tickRequest)
    }

    if (
        !this.canEmit() && to === CALL_OUT_STATE ||
        !this.canReceive() && to === INCOMING_STATE
    ) {
      return
    }

    if (this.callStateMachine.isCallingState(to)) {
      this.startTick()
    } else if (this.callStateMachine.isOffHookState(to)) {
      if (this._history) {
        this._history.callEnded(from, this.state.elapsedTime, this.state.callingNumber)
      }

      this.callingNumberChanged({ value: '' })
    }

    if (([INCOMING_STATE, ANSWERED_STATE].includes(from) || !this.canEmit()) && to === OFF_HOOK_STATE) {
      this.hide()
    }
    this.setState({ callState: to, elapsedTime: 0 })
  }

  capabilitiesChanged(e: Event, capabilities: {[key: string]: boolean} | undefined): void {
    this._capabilities = capabilities
    this.setState({ capabilities })
    this.registerStateMachine.canReceive = this.canReceive()
  }

  historyChanged(e: Event, history: boolean): void {
    if (this._history && !history) {
      delete this._history
    }
  }

  currentUserChanged(e: Event, currentUser: string): void {
    if (this._history) {
      this._history.user = currentUser
    }
    if (this._favorites) {
      this._favorites.user = currentUser
    }
  }

  storeUpdated(e: Event, storeData: PhoneStore): void {
    if (this._history) {
      this._history.store = storeData.history
      this.setState({ phoneHistory: this._history.list })
    }

    if (this._favorites) {
      this._favorites.store = storeData.favorites
      this.setState({ favorites: this._favorites.list })
    }
  }

  listenToCallStateMachine(): void {
    if (!this.callStateMachineListeners.length) {
      this.callStateMachineListeners = [
        this.callStateMachine.onAnyTransition(this.stateChanged.bind(this)),
        this.callStateMachine.onEnterState(INCOMING_STATE, () => {
          this._ipc.send('phone-show')
          this._ipc.send('phone.incoming-call')
        }),
        this.callStateMachine.onEnterState(OUTGOING_STATE, () => {
          this._ipc.send('phone.outgoing-call')
        }),
        this.callStateMachine.onLeaveState(CALL_OUT_STATE, () => {
          this._ipc.send('phone.call-ended', this.state.elapsedTime, 'outgoing-call')
        }),
        this.callStateMachine.onLeaveState(ANSWERED_STATE, () => {
          this._ipc.send('phone.call-ended', this.state.elapsedTime, 'incoming-call')
        }),
      ]
    }
    this.setState({ callState: this.callStateMachine.state })
  }

  unlistenToCallStateMachine(): void {
    if (this.callStateMachineListeners) {
      this.callStateMachineListeners.forEach(listener => listener.cancel())
      this.callStateMachineListeners = []
    }
    this.setState({ callState: null })
  }

  call(callNumber: CallingNumber): void {
    if (this.canEmit()) {
      const favorite = this.state.favorites.find(fav => fav.value === callNumber.value)
      this.callStateMachine.call(favorite || callNumber)
    }
  }

  answer(): void {
    if (this.canReceive()) {
      this.callStateMachine.answer()
    }
  }

  hangup(): void {
    this.callStateMachine.terminate()
  }

  hide(): void {
    this.hangup()
    this.ipcSend('phone-hide')()
  }

  sendKey(key: string): void {
    this.callStateMachine.sendKey(key)
  }

  private startTick() {
    this.firstTick = Date.now()
    this.tickRequest = requestAnimationFrame(this.tick.bind(this))
  }

  private tick() {
    if (this.firstTick === undefined) {
      return
    }
    const elapsedTime = Date.now() - this.firstTick
    this.setState({ elapsedTime })
    this.tickRequest = requestAnimationFrame(this.tick.bind(this))
  }

  render(): React.ReactElement {
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
            messagingNumber={this.state.messagingNumber}
            capabilities={this.state.capabilities}
            history={this.state.phoneHistory}
            sendKey={this.sendKey.bind(this)}
            elapsedTime={this.state.elapsedTime}
            favorites={this.state.favorites}
            saveFavorite={this.saveFavorite.bind(this)}
            removeFavorite={this.removeFavorite.bind(this)}
            openKeyboard={window.openKeyboard}
            closeKeyboard={window.closeKeyboard}
            hidePhone={this.hide.bind(this)}
            applyExternalPhoneNumberPrefix={this.props.applyExternalPhoneNumberPrefix}
        />
      </div>
    )
  }

  componentWillMount(): void {
    this.setHistory(this.props.history, this.props.currentUser)
    this.setFavorites(this.props.favorites, this.props.currentUser)
  }

  componentWillUnmount(): void {
    this.unlistenToCallStateMachine()
    Object.entries(this._ipcEvents).forEach(entry => this._ipc.removeListener(entry[0], entry[1]))
    if (this.tickRequest) {
      cancelAnimationFrame(this.tickRequest)
    }
  }
}

export {
  CallingNumber,
  Phone,
  PhoneCapabilities,
  PhoneProps,
  RegisterProps,
}
