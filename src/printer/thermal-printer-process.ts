import {ipcMain, WebContents} from "electron"
import {PosPrintData, PosPrinter, PosPrintOptions} from "electron-pos-printer"

export class ThermalPrinterProcess {
    private static instance: ThermalPrinterProcess | undefined = undefined;
    private webContents: WebContents;

    static init(webContents: WebContents) {
        if (!this.instance) {
            this.instance = new ThermalPrinterProcess(webContents);
        }
    }

    static stop() {
        ipcMain.off('print-content', this.instance?.printContent.bind(this))
        this.instance = undefined;
    }

    private async printContent(_: unknown, param: {data: PosPrintData[], options: PosPrintOptions}) {
        try {
            await PosPrinter.print(param.data, param.options)
            this.webContents.send('print-success')

        } catch (err) {
            console.log('Printing error', err)
            this.webContents.send(`print-error`, {
                errorMessage: 'error'
            })
        }

    }
    private startListeningEvents() {
        ipcMain.on('print-content', this.printContent.bind(this))
    }

    private constructor(webContents: WebContents) {
        this.webContents = webContents;
        this.startListeningEvents()
    }
}
