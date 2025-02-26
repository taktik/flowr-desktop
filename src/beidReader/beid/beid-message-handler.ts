import {WebContents} from "electron";

enum BeIDDataHeader {
    READER_DATA = 'CARD_READER_DATA',
    READER_INFO = 'CARD_READER_INFO',
    READER_ERROR = 'CARD_READER_ERROR'
}

export class BeIDDataHandler {
    private static instance: BeIDDataHandler
    webContents: WebContents | undefined
    static getInstance() {
        if (!this.instance) {
            this.instance = new BeIDDataHandler()
        }

        return this.instance
    }

    // private messageBroker = BeIDMessageBroker.getInstance(4000)

    handleMessage(message: string) {
        console.log('message', message)
        if (message.startsWith(BeIDDataHeader.READER_DATA)) {
            const cleanMessage = message.replace(BeIDDataHeader.READER_DATA, '').trim()
            this.handleData(cleanMessage)
        } else if (message.startsWith(BeIDDataHeader.READER_INFO)) {
            const cleanMessage = message.replace(BeIDDataHeader.READER_INFO, '').trim()
            this.handleInfo(cleanMessage)
        } else if (message.startsWith(BeIDDataHeader.READER_ERROR)) {
            const cleanMessage = message.replace(BeIDDataHeader.READER_ERROR, '').trim()
            this.handleError(cleanMessage)
        }
        // TODO
        // else {
        //     this.messageBroker.publish(undefined)
        // }
    }

    private handleData(message: string): void {
        const messageContent = message.split('|')
        const beidData = {
            lastname: messageContent?.[1],
            firstname: messageContent?.[2],
            nationalNumber: messageContent?.[3]
        }
        this.webContents?.send('beid-message', beidData)
        // TODO
        // this.messageBroker.publish(beidData)
    }

    private handleInfo(message: string): void {
        const messageContent = message.split('|')
        const beidInfo = {
            message: messageContent?.[1]
        }
        this.webContents?.send('beid-message', beidInfo)
    }

    private handleError(message: string): void {
        const messageContent = message.split('|')
        const beidError = {
            errorMessage: messageContent?.[1]
        }
        this.webContents?.send('beid-message', beidError)

    }

    private constructor() {}
}
