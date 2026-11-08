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
; Keep credentials by default, and never remove them during a silent uninstall.
LangString TermiXCredentialsQuestion 1033 "Also delete saved TermiX passwords from Windows Credential Manager? Other applications and portable copies are not affected."
LangString TermiXCredentialsQuestion 1031 "Auch gespeicherte TermiX-Passwoerter aus der Windows-Anmeldeinformationsverwaltung loeschen? Andere Programme und portable Kopien bleiben erhalten."
LangString TermiXCredentialsFailed 1033 "Some saved TermiX credentials could not be removed. You can remove TermiX:ssh entries manually in Windows Credential Manager."
LangString TermiXCredentialsFailed 1031 "Einige TermiX-Zugangsdaten konnten nicht entfernt werden. TermiX:ssh-Eintraege lassen sich in der Windows-Anmeldeinformationsverwaltung entfernen."
!macro NSIS_HOOK_PREUNINSTALL
  IfSilent termix_credentials_done
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(TermiXCredentialsQuestion)" IDNO termix_credentials_done
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --clear-saved-credentials' $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(TermiXCredentialsFailed)"
  ${EndIf}
  termix_credentials_done:
!macroend
