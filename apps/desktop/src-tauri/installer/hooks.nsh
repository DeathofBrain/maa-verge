; The build wrapper defines this only after preparing verified offline payloads.
!ifdef MAAVERGE_COMPONENTS_DIR
!include nsDialogs.nsh
!include FileFunc.nsh
!include LogicLib.nsh
Var MaaVergeCore
Var MaaVergeResource
Var MaaVergeCoreCheckbox
Var MaaVergeResourceCheckbox
Var MaaVergeDialog

; Hooks are included before Tauri's standard pages. Keep this self-contained;
; no copy of the upstream installer template is needed.
Page custom MaaVergeComponentsPage MaaVergeComponentsLeave

Function MaaVergeComponentsDefaults
  ; Revisiting the custom page must preserve the user's previous selection.
  ${If} $MaaVergeCore != ""
    Return
  ${EndIf}
  StrCpy $MaaVergeCore 1
  StrCpy $MaaVergeResource 1
  ClearErrors
  ${GetOptions} $CMDLINE "/UPDATE" $0
  ${IfNot} ${Errors}
    StrCpy $MaaVergeCore 0
    StrCpy $MaaVergeResource 0
  ${Else}
    ${GetOptions} $CMDLINE "/CORE=" $0
    ${IfNot} ${Errors}
      ${If} $0 == 0
        StrCpy $MaaVergeCore 0
        StrCpy $MaaVergeResource 0
      ${EndIf}
    ${EndIf}
    ClearErrors
    ${GetOptions} $CMDLINE "/RESOURCE=" $0
    ${IfNot} ${Errors}
      ${If} $0 == 0
        StrCpy $MaaVergeResource 0
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

Function MaaVergeCoreChanged
  ${NSD_GetState} $MaaVergeCoreCheckbox $MaaVergeCore
  ${If} $MaaVergeCore == 0
    StrCpy $MaaVergeResource 0
    ${NSD_Uncheck} $MaaVergeResourceCheckbox
    EnableWindow $MaaVergeResourceCheckbox 0
  ${Else}
    EnableWindow $MaaVergeResourceCheckbox 1
  ${EndIf}
FunctionEnd

Function MaaVergeCoreClicked
  ; nsDialogs pushes the clicked control HWND for callbacks only. Keep the
  ; shared state helper callable from page initialization without a stack item.
  Pop $0
  Call MaaVergeCoreChanged
FunctionEnd

Function MaaVergeResourceClicked
  Pop $0
  ${NSD_GetState} $MaaVergeResourceCheckbox $MaaVergeResource
FunctionEnd

Function MaaVergeComponentsPage
  Call MaaVergeComponentsDefaults
  ClearErrors
  ${GetOptions} $CMDLINE "/UPDATE" $0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ClearErrors
  ${GetOptions} $CMDLINE "/P" $0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "额外组件" "选择随 Maa Verge 安装的离线组件"
  nsDialogs::Create 1018
  Pop $MaaVergeDialog
  ${If} $MaaVergeDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 32u "安装包已包含以下完整组件，无需联网。取消后可在应用的更新设置中下载；已有组件和自定义位置保持不变。"
  Pop $0
  ${NSD_CreateCheckbox} 0 42u 100% 18u "MaaCore（自动化核心与完整基础资源）"
  Pop $MaaVergeCoreCheckbox
  ${NSD_SetState} $MaaVergeCoreCheckbox $MaaVergeCore
  ${NSD_OnClick} $MaaVergeCoreCheckbox MaaVergeCoreClicked
  ${NSD_CreateCheckbox} 0 68u 100% 18u "MaaResource（完整资源，需同时安装 MaaCore）"
  Pop $MaaVergeResourceCheckbox
  ${NSD_SetState} $MaaVergeResourceCheckbox $MaaVergeResource
  ${NSD_OnClick} $MaaVergeResourceCheckbox MaaVergeResourceClicked
  Call MaaVergeCoreChanged
  nsDialogs::Show
FunctionEnd

Function MaaVergeComponentsLeave
  ${NSD_GetState} $MaaVergeCoreCheckbox $MaaVergeCore
  ${NSD_GetState} $MaaVergeResourceCheckbox $MaaVergeResource
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MaaVergeCore == ""
    Call MaaVergeComponentsDefaults
  ${EndIf}
  ; Only immutable, packaged seed data is written here. The service validates
  ; and imports it after acquiring its data-root lease; no business DB writes.
  ${If} $MaaVergeCore == 1
    SetOutPath "$INSTDIR\runtime\bundled-components"
    File "${MAAVERGE_COMPONENTS_DIR}\manifest.json"
    SetOutPath "$INSTDIR\runtime\bundled-components\core"
    File /r "${MAAVERGE_COMPONENTS_DIR}\core\*"
  ${EndIf}
  ${If} $MaaVergeResource == 1
    SetOutPath "$INSTDIR\runtime\bundled-components\resource"
    File /r "${MAAVERGE_COMPONENTS_DIR}\resource\*"
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend
!endif

; Tauri only knows files bundled at build time. Downloaded components belong to
; these two fixed application directories, including older downloads/generations.
; Custom locations and the business data root are deliberately not consulted.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$INSTDIR\MaaCore"
    RMDir /r "$INSTDIR\MaaResource"
    RMDir /r "$INSTDIR\runtime\bundled-components"
    ; The standard uninstaller attempted this before running our post hook.
    ; Remove the installation directory only if nothing else remains in it.
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
