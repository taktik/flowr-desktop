import { CallingNumber } from '../views/phone'

export function formatCallingNumber(callingNumber: CallingNumber | string): string {
  if (typeof callingNumber === 'string') {
    return callingNumber
  }
  return `${callingNumber.name ? `${callingNumber.name}  :` : ''} ${callingNumber.value}`
}

export const numberValidationRegExp = /^\+?[0-9]*$/
