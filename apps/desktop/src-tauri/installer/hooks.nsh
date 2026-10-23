; Tauri only knows files bundled at build time. Downloaded components belong to
; these two fixed application directories, including older downloads/generations.
; Custom locations and the business data root are deliberately not consulted.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$INSTDIR\MaaCore"
    RMDir /r "$INSTDIR\MaaResource"
    ; The standard uninstaller attempted this before running our post hook.
    ; Remove the installation directory only if nothing else remains in it.
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
