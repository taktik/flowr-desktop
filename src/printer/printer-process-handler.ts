import {ipcMain, WebContents} from "electron";

export class PrinterProcessHandler {
    private static instance: PrinterProcessHandler | undefined = undefined;
    private webContents: WebContents;

    static init(webContents: WebContents) {
        if (!this.instance) {
            this.instance = new PrinterProcessHandler(webContents);
        }
    }

    private async getPrinters() {
        try {
            const printers = await this.webContents.getPrintersAsync();
            this.webContents.send('printer-message', {
                printers
            })
        } catch (err) {
            console.log('Error', err)
            this.webContents.send('printer-message', {
                errorMessage: 'Printer not found'
            })
        }
    }
    private startListeningEvents() {
        ipcMain.on('get-printers', this.getPrinters.bind(this))
    }

    private constructor(webContents: WebContents) {
        this.webContents = webContents;
        this.startListeningEvents()
    }
}
