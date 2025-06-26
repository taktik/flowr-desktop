import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import {join, resolve} from 'path'
import { BeIDDataHandler } from './beid-message-handler'
import {app, WebContents} from "electron";
import {platform} from "os";
import * as log from "electron-log";

export class BeIDProcessHandler {
    private readonly executablePath =  computeExecutablePath()
    private static instance: BeIDProcessHandler | undefined = undefined
    private messageHandler: BeIDDataHandler = BeIDDataHandler.getInstance()
    private childProcessReference: ChildProcessWithoutNullStreams | undefined

    static init( webContents: WebContents) {
        if (!this.instance) {
            this.instance = new BeIDProcessHandler()
        }
        this.instance.start(webContents)
    }

    static stop() {
        this.instance?.stop()
        this.instance = undefined
    }

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

    private stop() {
        if (this.childProcessReference) {
            this.childProcessReference.kill('SIGTERM')
        }
    }
}


const computeExecutablePath = () => {
    const fileName = platform() === 'win32' ? 'beid_reader.exe': 'beid_reader'
    if (process.env.ENV === 'dev') {
        return join(app.getAppPath(), `script/beid/${fileName}`)
    }
    return resolve(app.getAppPath(), `script/beid/${fileName}`)
}

const init = (webContents: WebContents ) => {
    BeIDProcessHandler.getInstance(computeExecutablePath(), webContents)
    BeIDProcessHandler.startProcess(webContents)
}

const stop = () => {
    BeIDProcessHandler.stopProcess()
}



export { init, stop }
