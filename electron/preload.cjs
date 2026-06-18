/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("promptCenterDesktop", {
  setTheme(theme) {
    ipcRenderer.send("prompt-center:set-theme", theme)
  },
  readDefaultApiSettings() {
    return ipcRenderer.invoke("ta-huo:read-default-api-settings")
  },
  checkLocalTtsProject(input) {
    return ipcRenderer.invoke("ta-huo:check-local-tts-project", input)
  },
  saveFileToDownloads(input) {
    return ipcRenderer.invoke("ta-huo:save-file-to-downloads", input)
  },
  saveTaskAssetFile(input) {
    return ipcRenderer.invoke("ta-huo:save-task-asset-file", input)
  },
  readTaskAssetPreview(input) {
    return ipcRenderer.invoke("ta-huo:read-task-asset-preview", input)
  },
  renderVideoWithFfmpeg(input) {
    return ipcRenderer.invoke("ta-huo:render-video-with-ffmpeg", input)
  },
})
