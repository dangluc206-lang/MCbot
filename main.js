const { app, BrowserWindow, ipcMain } = require("electron");
const WebSocket = require("ws");
function createWindow() {
    const win = new BrowserWindow({
        width: 500,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile("gui.html");
}

app.whenReady().then(createWindow);

const ws = new WebSocket("ws://localhost:3000");

ipcMain.on("control", (event, action) => {
    ws.send(action);
});