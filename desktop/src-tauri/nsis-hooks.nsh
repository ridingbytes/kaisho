; Kill kai-server / Kaisho before installing to prevent
; "file in use" errors during update. The running app
; should already have called the kill_sidecar IPC before
; download, but we redundantly kill here in case the user
; ran the installer manually (without going through the
; in-app updater).
!macro NSIS_HOOK_PREINSTALL
  Var /GLOBAL KaiAttempts
  StrCpy $KaiAttempts 0

  ; Initial kill pass.
  nsExec::ExecToLog 'taskkill /F /IM kai-server.exe'
  nsExec::ExecToLog 'taskkill /F /IM kaisho-desktop.exe'
  nsExec::ExecToLog 'taskkill /F /IM Kaisho.exe'

  ; Poll up to 12 x 500ms (= 6s total) for kai-server.exe
  ; to actually be gone. Windows can delay handle release
  ; after taskkill, and a fixed Sleep 3000 was sometimes
  ; not enough on slower / disk-busy systems.
  KaiPollLoop:
    Sleep 500
    nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq \
      kai-server.exe" /NH /FO CSV'
    Pop $0
    Pop $1
    StrCmp $1 "" KaiGone 0
    StrCmp $1 "INFO: No tasks are running which match \
      the specified criteria." KaiGone 0
    IntOp $KaiAttempts $KaiAttempts + 1
    IntCmp $KaiAttempts 12 KaiGiveUp 0 0
    ; Retry kill — sometimes a respawn slips in.
    nsExec::ExecToLog 'taskkill /F /IM kai-server.exe'
    Goto KaiPollLoop

  KaiGiveUp:
    ; Best effort: continue install anyway. The installer
    ; itself will surface a clearer error if the file is
    ; still locked.
    DetailPrint "kai-server.exe still running after 6s; \
      proceeding anyway"

  KaiGone:
!macroend
