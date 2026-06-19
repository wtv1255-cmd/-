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
  synthesizeLocalTts(input) {
    return ipcRenderer.invoke("ta-huo:synthesize-local-tts", input)
  },
  selectAudioFile() {
    return ipcRenderer.invoke("ta-huo:select-audio-file")
  },
  selectJianyingDraftsRoot() {
    return ipcRenderer.invoke("ta-huo:select-jianying-drafts-root")
  },
  saveFileToDownloads(input) {
    return ipcRenderer.invoke("ta-huo:save-file-to-downloads", input)
  },
  saveTaskAssetFile(input) {
    return ipcRenderer.invoke("ta-huo:save-task-asset-file", input)
  },
  copyTaskAssetFile(input) {
    return ipcRenderer.invoke("ta-huo:copy-task-asset-file", input)
  },
  readTaskAssetPreview(input) {
    return ipcRenderer.invoke("ta-huo:read-task-asset-preview", input)
  },
  deleteTaskCache(input) {
    return ipcRenderer.invoke("ta-huo:delete-task-cache", input)
  },
  appendTaskRunEvent(input) {
    return ipcRenderer.invoke("ta-huo:append-task-run-event", input)
  },
  readTaskRunEvents(input) {
    return ipcRenderer.invoke("ta-huo:read-task-run-events", input)
  },
  readTaskRunSummary(input) {
    return ipcRenderer.invoke("ta-huo:read-task-run-summary", input)
  },
  clearTaskRunLog(input) {
    return ipcRenderer.invoke("ta-huo:clear-task-run-log", input)
  },
  createJianyingDraft(input) {
    return ipcRenderer.invoke("ta-huo:create-jianying-draft", input)
  },
  renderVideoWithFfmpeg(input) {
    return ipcRenderer.invoke("ta-huo:render-video-with-ffmpeg", input)
  },
})
