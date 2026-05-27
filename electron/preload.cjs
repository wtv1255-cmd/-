const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("promptCenterDesktop", {
  setTheme(theme) {
    ipcRenderer.send("prompt-center:set-theme", theme)
  },
})
