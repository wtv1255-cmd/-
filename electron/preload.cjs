const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("promptCenterDesktop", {
  setTheme(theme) {
    ipcRenderer.send("prompt-center:set-theme", theme)
  },
  readDefaultApiSettings() {
    return ipcRenderer.invoke("ta-huo:read-default-api-settings")
  },
  saveFileToDownloads(input) {
    return ipcRenderer.invoke("ta-huo:save-file-to-downloads", input)
  },
  renderVideoWithFfmpeg(input) {
    return ipcRenderer.invoke("ta-huo:render-video-with-ffmpeg", input)
  },
})
