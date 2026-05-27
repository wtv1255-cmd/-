@echo off
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST ^| findstr /B "PID:"') do (
  wmic process where "ProcessId=%%a and CommandLine like '%%prompt-center-shadcn%%'" call terminate >nul 2>nul
)
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq go.exe" /FO LIST ^| findstr /B "PID:"') do (
  wmic process where "ProcessId=%%a and CommandLine like '%%prompt-center-shadcn%%'" call terminate >nul 2>nul
)
echo 已发送关闭请求。
