; ----------------------------------------------------------------------------
; Dero Vault™ — Windows NSIS Installer Script
; Native Click-Wrap Acceptance: EULA + Privacy Notice + Granular Optional Consents
; Publisher: Enen Digital Labs Co. Ltd
; ----------------------------------------------------------------------------

!include LogicLib.nsh
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER

Var PrivacyConsentDialog
Var StabilityConsentCheckbox
Var AdoptionConsentCheckbox
Var StabilityConsentValue
Var AdoptionConsentValue

!macro customPageAfterChangeDir
  Page custom PrivacyConsentPageCreate PrivacyConsentPageLeave
!macroend

Function PrivacyConsentPageCreate
  !insertmacro MUI_HEADER_TEXT "Privacy Notice & Diagnostic Consents" "Review privacy principles and configure optional diagnostic reporting."

  nsDialogs::Create 1018
  Pop $PrivacyConsentDialog

  ${If} $PrivacyConsentDialog == error
    Abort
  ${EndIf}

  ; Summary of privacy principles
  ${NSD_CreateLabel} 0 0 100% 28u "Dero Vault operates 100% locally on your computer and removable storage.$\r$\nYour documents and backups are never uploaded to the cloud or remote servers."
  Pop $0

  ${NSD_CreateLabel} 0 32u 100% 28u "Privacy Notice Acknowledgement:$\r$\nBy continuing installation, you acknowledge the Dero Vault Privacy Notice. Core backups require zero analytics or telemetry."
  Pop $0

  ; Section divider / explanation
  ${NSD_CreateLabel} 0 66u 100% 14u "Optional Privacy-by-Design Settings (Unchecked / Disabled by default):"
  Pop $0

  ; Checkbox 1: Stability Reporting (Default UNCHECKED)
  ${NSD_CreateCheckbox} 10u 84u 95% 22u "Enable Anonymous Stability Reporting$\r$\n(Transmits crash dumps with local user paths automatically redacted)"
  Pop $StabilityConsentCheckbox

  ; Checkbox 2: Adoption Metrics (Default UNCHECKED)
  ${NSD_CreateCheckbox} 10u 112u 95% 22u "Enable Anonymous Adoption Metrics$\r$\n(Sends an anonymous periodic heartbeat to help estimate active installations)"
  Pop $AdoptionConsentCheckbox

  ; Ensure default is unchecked (OFF)
  ${NSD_SetState} $StabilityConsentCheckbox ${BST_UNCHECKED}
  ${NSD_SetState} $AdoptionConsentCheckbox ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function PrivacyConsentPageLeave
  ${NSD_GetState} $StabilityConsentCheckbox $StabilityConsentValue
  ${NSD_GetState} $AdoptionConsentCheckbox $AdoptionConsentValue
FunctionEnd

!endif

!macro customInstall
  !ifndef BUILD_UNINSTALLER
  ; Create Application Data directories
  CreateDirectory "$APPDATA\DeroVault"
  CreateDirectory "$APPDATA\DeroVault\data"

  ; Write installer-consent.json to both data directory and base directory
  FileOpen $0 "$APPDATA\DeroVault\data\installer-consent.json" w
  FileWrite $0 '{"eulaAccepted":true,"eulaVersion":"1.0.0","privacyNoticeVersion":"1.0.0","stabilityConsent":'
  ${If} $StabilityConsentValue == 1
    FileWrite $0 'true'
  ${Else}
    FileWrite $0 'false'
  ${EndIf}
  FileWrite $0 ',"adoptionConsent":'
  ${If} $AdoptionConsentValue == 1
    FileWrite $0 'true'
  ${Else}
    FileWrite $0 'false'
  ${EndIf}
  FileWrite $0 ',"source":"nsis-installer"}$\r$\n'
  FileClose $0

  ; Fallback copy in root APPDATA
  CopyFiles /SILENT "$APPDATA\DeroVault\data\installer-consent.json" "$APPDATA\DeroVault\installer-consent.json"

  ; Also record in Windows Registry under Current User
  WriteRegStr HKCU "Software\DeroVault" "Publisher" "Enen Digital Labs Co. Ltd"
  WriteRegStr HKCU "Software\DeroVault" "EulaVersion" "1.0.0"
  WriteRegStr HKCU "Software\DeroVault" "PrivacyNoticeVersion" "1.0.0"
  WriteRegDWORD HKCU "Software\DeroVault" "EulaAccepted" 1
  ${If} $StabilityConsentValue == 1
    WriteRegDWORD HKCU "Software\DeroVault" "StabilityConsent" 1
  ${Else}
    WriteRegDWORD HKCU "Software\DeroVault" "StabilityConsent" 0
  ${EndIf}
  ${If} $AdoptionConsentValue == 1
    WriteRegDWORD HKCU "Software\DeroVault" "AdoptionConsent" 1
  ${Else}
    WriteRegDWORD HKCU "Software\DeroVault" "AdoptionConsent" 0
  ${EndIf}
  !endif
!macroend
