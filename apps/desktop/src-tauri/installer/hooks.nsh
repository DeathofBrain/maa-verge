; Resource-only offline installation. MaaFramework keeps its independent update channel.
!ifdef MAAVERGE_COMPONENTS_DIR
!include nsDialogs.nsh
!include FileFunc.nsh
!include LogicLib.nsh
Var MaaVergeResource
Var MaaVergeResourceCheckbox
Var MaaVergeDialog
Page custom MaaVergeComponentsPage MaaVergeComponentsLeave
Function MaaVergeComponentsDefaults
  ${If} $MaaVergeResource != ""
    Return
  ${EndIf}
  StrCpy $MaaVergeResource 1
  ClearErrors
  ${GetOptions} $CMDLINE "/UPDATE" $0
  ${IfNot} ${Errors}
    StrCpy $MaaVergeResource 0
  ${Else}
    ${GetOptions} $CMDLINE "/RESOURCE=" $0
    ${IfNot} ${Errors}
      ${If} $0 == 0
        StrCpy $MaaVergeResource 0
      ${EndIf}
    ${EndIf}
  ${EndIf}
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
  !insertmacro MUI_HEADER_TEXT "游戏资源" "选择随 Maa Verge 安装的离线资源"
  nsDialogs::Create 1018
  Pop $MaaVergeDialog
  ${If} $MaaVergeDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 32u "完整游戏资源包含 OCR 模型，无需安装旧核心。MaaFramework 在应用内独立安装。取消后可在更新设置中下载资源。"
  Pop $0
  ${NSD_CreateCheckbox} 0 42u 100% 18u "MaaResource（完整游戏资源与 OCR 模型）"
  Pop $MaaVergeResourceCheckbox
  ${NSD_SetState} $MaaVergeResourceCheckbox $MaaVergeResource
  nsDialogs::Show
FunctionEnd
Function MaaVergeComponentsLeave
  ${NSD_GetState} $MaaVergeResourceCheckbox $MaaVergeResource
FunctionEnd
!macro NSIS_HOOK_POSTINSTALL
  ${If} $MaaVergeResource == ""
    Call MaaVergeComponentsDefaults
  ${EndIf}
  ; Content-addressed generations are immutable and registered after the data-root lease.
  ${If} $MaaVergeResource == 1
    ${IfNot} ${FileExists} "$INSTDIR\MaaResource\generations\${MAAVERGE_RESOURCE_GENERATION}"
      SetOutPath "$INSTDIR\MaaResource\generations\${MAAVERGE_RESOURCE_GENERATION}"
      File /r "${MAAVERGE_COMPONENTS_DIR}\resource\*"
    ${EndIf}
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend
!endif
; Legacy engine directories remain untouched, including on uninstall.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$INSTDIR\MaaResource"
    RMDir /r "$INSTDIR\MaaFramework"
    RMDir /r "$INSTDIR\runtime\bundled-components"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
