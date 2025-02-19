import * as React from 'react'
import { SubmitErrorHandler, SubmitHandler, useForm, Validate } from 'react-hook-form'
import { LabeledInput } from './components/LabeledInput'
import type { ConfigProps } from './types'
import { ModifiableConfig, VirtualKeyboardMode } from '../frontend/src/interfaces/flowrStore'
import styled from 'styled-components'

function flexColumn(name: keyof JSX.IntrinsicElements) {
  return styled(name)`
    display: flex;
    flex-direction: column;
  `
}
const ColumnDiv = flexColumn('div')
const ColumnForm = flexColumn('form')
const ActionButton = styled('button')`
  width: 200px;
  height: 50px;
  align-self: center;
  margin: 10px;
`
const FlexRowDiv = styled('div')`
  display: flex;
`

const userAgent = navigator.userAgent
const onValid: SubmitHandler<ModifiableConfig> = (updatedConfig) => {
  ipc.send('setAppConfig', updatedConfig)
}
const close = () => ipc.send('close')
const validateExtUrl: Validate<string> = (value) => {
  try {
    new URL(value)
    return true
  } catch (e) {
    return false
  }
}

export function Config({ config, lastError, isLaunchedUrlCorrect }: ConfigProps): JSX.Element {
  const [ initialError ] = React.useState(lastError)
  const {
    handleSubmit,
    formState: { isDirty },
    register,
    reset,
  } = useForm({
    defaultValues: config,
  })
  const [ urlError, setUrlError ] = React.useState(!isLaunchedUrlCorrect)

  const onError: SubmitErrorHandler<ModifiableConfig> = (e) => {
    if (e.extUrl) {
      setUrlError(true)
    }
  }

  const buttons = isDirty
    ? <>
          <ActionButton type="button" onClick={() => reset(config)}>Reset values</ActionButton>
          <ActionButton type="button" onClick={() => close()}>Exit without saving</ActionButton>
          <ActionButton type="submit">Save and close</ActionButton>
    </>
    : <ActionButton type="button" onClick={() => close()}>Cancel</ActionButton>

  return (
    <ColumnDiv>
      <h1>Settings</h1>
      <h3>Firmware Version : </h3>
      <div id="userAgent">{userAgent}</div>
      <hr></hr>

      {initialError ? (
          <p id="lastError" className="error">{initialError}</p>
        ) : (
          <></>
        )}

      <ColumnForm onSubmit={handleSubmit(onValid, onError)}>
        <h3>External Config</h3>
        <LabeledInput
          label="Url to flowr"
          register={register}
          path="extUrl"
          validate={validateExtUrl}
        />
        {urlError ? (
          <span className="error"> Invalid url*</span>
        ) : (
          <></>
        )}
        <LabeledInput
          label="Flowr monitoring timer (use 0 to disable)"
          register={register}
          path="flowrMonitoringTime"
          type="number"
          min="0"
          max="10000000"
          valueAsNumber
        />

        <LabeledInput
          label="Activate Kiosk Mode"
          type="checkbox"
          register={register}
          path="isKiosk"
        />

        <h3>Configuration</h3>
        <LabeledInput
          label="Ozone API"
          register={register}
          path="flowrConfig.ozoneApi.hostProxy"
        />
        <LabeledInput
          label="Flowr API"
          register={register}
          path="flowrConfig.flowrApi.hostProxy"
        />
        <LabeledInput
          label="Socket API"
          register={register}
          path="flowrConfig.socketApi.host"
        />
        <LabeledInput
          label="Push vod socket API"
          register={register}
          path="flowrConfig.pushVodSocketApi.host"
        />
        <LabeledInput
          label="Anevia vod socket API"
          register={register}
          path="flowrConfig.aneviaVodSocketApi.host"
        />

        <h3>Deinterlacing</h3>
        <LabeledInput
          label="Activate Deinterlacing"
          type="checkbox"
          register={register}
          path="deinterlacing"
        />

        <h3>Applications</h3>
        <h4>Browser</h4>
        <LabeledInput
          label="Clear app data on start"
          type="checkbox"
          register={register}
          path="clearAppDataOnStart"
        />

        <h4>FlowR-Phone</h4>
        <LabeledInput
          label="Clear app data on start"
          type="checkbox"
          register={register}
          path="applications.FlowrPhone.clearAppDataOnStart"
        />
        <LabeledInput
          label="Prefix phone number by '0'"
          type="checkbox"
          register={register}
          defaultChecked={true}
          path="applications.FlowrPhone.applyExternalPhoneNumberPrefix"
        />

        <h3>Virtual keyboard</h3>
        <LabeledInput
          label="Enable virtual keyboard"
          type="checkbox"
          register={register}
          path="enableVirtualKeyboard"
        />
        <h4>Virtual keyboard mode</h4>
        <select name='Keyboard mode' id='keyboardMode' {...register('virtualKeyboardConfig.mode')}>
          <option value={VirtualKeyboardMode.INTERNAL}>Internal (handled by flowr-desktop)</option>
          <option value={VirtualKeyboardMode.EXTERNAL}>External (handled through http calls)</option>
        </select>
        <h4>Virtual keyboard external URLs</h4>
        <LabeledInput
          label="Toggle"
          register={register}
          path="virtualKeyboardConfig.urls.toggle"
        />
        <LabeledInput
          label="Open"
          register={register}
          path="virtualKeyboardConfig.urls.open"
        />
        <LabeledInput
          label="Close"
          register={register}
          path="virtualKeyboardConfig.urls.close"
        />


        <h3>Debug</h3>
        <LabeledInput
          label="Activate debug mode"
          type="checkbox"
          register={register}
          path="debugMode"
        />

        <FlexRowDiv>{ buttons }</FlexRowDiv>
      </ColumnForm>
    </ColumnDiv>
  )
}
