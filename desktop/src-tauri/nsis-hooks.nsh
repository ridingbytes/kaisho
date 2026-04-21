; Kill kai-server before installing to prevent
; "file in use" errors during update.
!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /F /IM kai-server.exe'
  nsExec::ExecToLog 'taskkill /F /IM kaisho-desktop.exe'
  nsExec::ExecToLog 'taskkill /F /IM Kaisho.exe'
  ; Give processes time to exit
  Sleep 1000
!macroend
