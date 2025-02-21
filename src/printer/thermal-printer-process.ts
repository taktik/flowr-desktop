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

    private async printContent(_: unknown, param: {data: PosPrintData[], options: PosPrintOptions}) {
        try {
            /*const printerObj = new printer({
                type: PrinterTypes.EPSON,
                interface: 'printer:BIXOLON BK3-3 (Copie 1)',
            })
            const value = await printerObj.isPrinterConnected()
            console.log('connected', value)*/

            console.log(JSON.stringify(param.data))
            await PosPrinter.print(param.data, param.options)
            console.log('print success')
           
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
