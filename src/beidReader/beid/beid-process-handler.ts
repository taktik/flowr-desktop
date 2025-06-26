import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import {join, resolve} from 'path'
import { BeIDDataHandler } from './beid-message-handler'
import {app, WebContents} from "electron";
import {platform} from "os";
import * as log from "electron-log";

class BeIDProcessHandler {
    private static instance: BeIDProcessHandler | undefined = undefined

    static getInstance(fileName: string, webContents: WebContents): BeIDProcessHandler {
        if (!this.instance) {
            this.instance = new BeIDProcessHandler(fileName)
            this.instance.start(webContents)
        }
        return this.instance
    }

    private readonly executablePath: string
    private childProcessReference: ChildProcessWithoutNullStreams | undefined

    private messageHandler: BeIDDataHandler = BeIDDataHandler.getInstance()

    private childProcessStandardOutputHandler: (data: any) => void = (data: any) => {
        this.messageHandler.handleMessage(data.toString())
    }

    private childProcessStandardErrorHandler: (data: any) => void = (data: any) => {
        this.messageHandler.handleMessage(data.toString())
    }

    private childProcessExitHandler: (exitCode?: any) => void = (exitCode: any) => {
        console.log(`BeIDProcess exit with code ${exitCode}`)
        this.messageHandler.handleMessage('')
    }

    private start(webContents: WebContents) {
        try {
            this.childProcessReference = spawn(this.executablePath)
            this.messageHandler.webContents = webContents
            this.childProcessReference.stdout.on('data', this.childProcessStandardOutputHandler)
            this.childProcessReference.stderr.on('data', this.childProcessStandardErrorHandler)
            this.childProcessReference.on('exit', this.childProcessExitHandler)
            this.childProcessReference.on('close', this.childProcessExitHandler)
        } catch (err) {
            log.error(err)
        }

    }

    private constructor(path: string) {
        this.executablePath = path
        console.log(this.executablePath)
    }
}

let handler: BeIDProcessHandler

const computeExecutablePath = () => {
    const fileName = platform() === 'win32' ? 'beid_reader.exe': 'beid_reader'
    if (process.env.ENV === 'dev') {
        return join(app.getAppPath(), `script/beid/${fileName}`)
    }
    return resolve(app.getAppPath(), `script/beid/${fileName}`)
}

const init = (webContents: WebContents ) => {
    handler = BeIDProcessHandler.getInstance(computeExecutablePath(), webContents)
}

const getHandler = () => {
    return handler
}

export { getHandler, init }
