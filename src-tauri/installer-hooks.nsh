!macro NSIS_HOOK_POSTINSTALL
  ; App-local Microsoft CRT: no machine-wide redistributable installation/elevation.
  CopyFiles /SILENT "$INSTDIR\resources\vcredist\*.dll" "$INSTDIR"
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  ; Only installer-owned libraries; AppData is deliberately untouched.
  Delete "$INSTDIR\vcruntime140.dll"
  Delete "$INSTDIR\vcruntime140_1.dll"
  Delete "$INSTDIR\msvcp140.dll"
  Delete "$INSTDIR\msvcp140_1.dll"
  Delete "$INSTDIR\msvcp140_2.dll"
  Delete "$INSTDIR\msvcp140_atomic_wait.dll"
  Delete "$INSTDIR\msvcp140_codecvt_ids.dll"
  Delete "$INSTDIR\concrt140.dll"
  Delete "$INSTDIR\vccorlib140.dll"
  Delete "$INSTDIR\vcruntime140_threads.dll"
!macroend
