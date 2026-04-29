; Kill kai-server before installing to prevent
; "file in use" errors during update.
!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /F /IM kai-server.exe'
  nsExec::ExecToLog 'taskkill /F /IM kaisho-desktop.exe'
  nsExec::ExecToLog 'taskkill /F /IM Kaisho.exe'
  ; Wait for processes to fully exit and release file
  ; handles. Windows may delay handle release after
  ; process termination.
  Sleep 3000
  ; Retry kill in case a process respawned
  nsExec::ExecToLog 'taskkill /F /IM kai-server.exe'
  Sleep 1000
!macroend
