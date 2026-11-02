; Refresh only this product's shortcuts, preserving the user's choice to have
; no desktop shortcut. A separately named icon avoids stale executable icons.
!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$DESKTOP\TermiX.lnk" 0 +2
    CreateShortCut "$DESKTOP\TermiX.lnk" "$INSTDIR\termix.exe" "" "$INSTDIR\termix-v3.ico" 0
  IfFileExists "$SMPROGRAMS\TermiX\TermiX.lnk" 0 +2
    CreateShortCut "$SMPROGRAMS\TermiX\TermiX.lnk" "$INSTDIR\termix.exe" "" "$INSTDIR\termix-v3.ico" 0
  IfFileExists "$SMPROGRAMS\TermiX.lnk" 0 +2
    CreateShortCut "$SMPROGRAMS\TermiX.lnk" "$INSTDIR\termix.exe" "" "$INSTDIR\termix-v3.ico" 0
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
