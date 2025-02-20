import {ipcMain, WebContents} from "electron"
import { printer, PrinterTypes } from "node-thermal-printer";

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

    private printHelloWorld(param: {type: PrinterTypes, interface: string}) {
        try {
            const thermalPrinter = new printer({
                type: param.type,
                interface: param.interface,
            })
            thermalPrinter.println('Hello World !')
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
