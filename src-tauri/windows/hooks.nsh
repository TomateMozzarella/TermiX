; Use Tauri's path-scoped Restart Manager check before replacing any files.
; Interactive installs offer OK/Cancel to close only the installed TermiX.
; Do not use taskkill /IM: unrelated copies and other users must be preserved.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
!macroend
; Refresh only this product's shortcuts, preserving the user's choice to have
; no desktop shortcut. A separately named icon avoids stale executable icons.
!macro TermiXRefreshShortcut SHORTCUT
  ${If} ${FileExists} "${SHORTCUT}"
    !insertmacro IsShortcutTarget "${SHORTCUT}" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 == 1
      CreateShortCut "${SHORTCUT}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\termix-v3.ico" 0
      !insertmacro SetLnkAppUserModelId "${SHORTCUT}"
    ${EndIf}
  ${EndIf}
!macroend
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro TermiXRefreshShortcut "$DESKTOP\TermiX.lnk"
  !insertmacro TermiXRefreshShortcut "$SMPROGRAMS\TermiX\TermiX.lnk"
  !insertmacro TermiXRefreshShortcut "$SMPROGRAMS\TermiX.lnk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
