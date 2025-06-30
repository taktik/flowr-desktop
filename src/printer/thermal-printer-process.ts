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

    private async getPrinterData(printerName: string) {
        const printers = await this.webContents.getPrintersAsync()
        return printers.find((p) => p.name === printerName)
    }

    private async getPrinter(_: unknown, printerName: string) {
        try {
            console.log('printerName', printerName)
            const printer = await this.getPrinterData(printerName)
            console.log('printer', printer)
            this.webContents.send('printer-data', printer)
        } catch (err) {
            this.webContents.send('get-printer-error', {
                errorMessage: 'Error getting printer data'
            })
        }
    }

    private async printContent(_: unknown, param: {data: PosPrintData[], options: PosPrintOptions}) {
        try {
            const printer = await this.getPrinterData(param.options.printerName)
            if (printer.status !== 0) {
                this.webContents.send('print-error', {
                    errorMessage: 'Printer not connected/ready'
                })
            }
             await PosPrinter.print(param.data, param.options)
            this.webContents.send('print-success')

        } catch (err) {
            this.webContents.send(`print-error`, {
                errorMessage: err.message ? err.message : err
            })
        }

    }
    private startListeningEvents() {
        ipcMain.on('print-content', this.printContent.bind(this))
        ipcMain.on('get-printer-info', this.getPrinter.bind(this))
    }

    private constructor(webContents: WebContents) {
        this.webContents = webContents;
        this.startListeningEvents()
    }
}
