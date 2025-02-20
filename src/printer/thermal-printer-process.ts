import {ipcMain, WebContents} from "electron"
import { printer, PrinterTypes } from "node-thermal-printer";
import {PosPrinter} from 'electron-pos-printer'
export class ThermalPrinterProcess {
    private static instance: ThermalPrinterProcess | undefined = undefined;
    private webContents: WebContents;

    static init(webContents: WebContents) {
        if (!this.instance) {
            this.instance = new ThermalPrinterProcess(webContents);
        }
    }

    private async checkThermalPrinterStatus(_: unknown, param: {type: PrinterTypes, interface: string}) {
        try {
            console.log('Checking thermal printer status...', JSON.stringify(param))
            const thermalPrinter = new printer({
                type: param.type,
                interface: param.interface,
            })
            const isConnected = await thermalPrinter.isPrinterConnected()
            console.log(isConnected ? "✅ Imprimante BIXOLON connectée !" : "❌ Imprimante déconnectée !");
            this.webContents.send(`printer-${param.type}-status`, {
                isConnected,
            })
        } catch (err) {
            console.log('Printer not found', JSON.stringify(err))
            this.webContents.send(`printer-${param.type}-status`, {
                errorMessage: 'Printer not found'
            })
        }
    }

    private async printHelloWorld(param: {printerName: string}) {
        try {
            await PosPrinter.print([
                { type: 'text', value: 'Hello World!' },
                { type: 'text', value: 'Bienvenue à l\'impression POS' }
            ], {
                boolean: undefined,
                preview: false,
                margin: '0 0 0 0',
                copies: 1,
                printerName: param.printerName,
                timeOutPerLine: 400,
                pageSize: '80mm' // page size
            })
            this.webContents.send(`print-success`)
        } catch (err) {
            console.log('Printing error', JSON.stringify(err))
            this.webContents.send(`print-error`, {
                errorMessage: 'cannot print'
            })
        }

    }
    private startListeningEvents() {
        ipcMain.on('check-thermal-printer-status', this.checkThermalPrinterStatus.bind(this))
        ipcMain.on('print-hello-world', this.printHelloWorld.bind(this))
    }

    private constructor(webContents: WebContents) {
        this.webContents = webContents;
        this.startListeningEvents()
    }
}
