/**
 * Dero Vault — In-App Offline Legal Document Viewer Modal
 * Completely offline, zero blank windows, beautifully rendered with Enen Digital Labs™ branding.
 */

import React, { useState } from 'react';
import { Shield, FileText, X, Copy, Check, ExternalLink, Printer } from 'lucide-react';

export type LegalDocType = 'eula' | 'privacy';

interface LegalDocumentModalProps {
  isOpen: boolean;
  initialDoc?: LegalDocType;
  onClose: () => void;
}

const EULA_TEXT = `# DERO VAULT™ END USER LICENCE AGREEMENT (EULA)

Version: 1.0.0
Effective Date: 23 October 2026
Publisher: Enen Digital Labs Co. Ltd ("Enen Digital Labs")
Jurisdiction: Republic of Uganda

--------------------------------------------------------------------------------

1. ACCEPTANCE OF TERMS
By installing, copying, or using Dero Vault™ ("the Software"), you agree to be bound by the terms of this End User Licence Agreement ("EULA"). If you do not agree to these terms, do not install or use the Software.

2. LICENCE GRANT
Enen Digital Labs grants you a non-exclusive, non-transferable, limited licence to use the Software on compatible Windows devices that you own or control, strictly for personal or internal business backup purposes, subject to the restrictions in this EULA.

3. RESTRICTIONS
Except as permitted by applicable law, you may not:
- Copy, redistribute, or sublicense the Software.
- Modify, adapt, translate, or create derivative works of the Software.
- Reverse engineer, decompile, or disassemble the Software, except as permitted by mandatory law for interoperability purposes.
- Remove any proprietary notices or labels on the Software.

4. OWNERSHIP
4.1 Software Ownership: Enen Digital Labs retains all right, title, and interest in and to the Software, including all intellectual property rights. The Software is licensed, not sold.
4.2 User Content Ownership: You retain full ownership of all files, documents, and data that you back up using the Software ("User Content"). Enen Digital Labs does not claim any ownership rights over your User Content.

5. USER RESPONSIBILITIES
5.1 Selection of Sources: You are solely responsible for selecting the files and folders to be backed up.
5.2 Protection of Media: You are responsible for the physical security and integrity of your backup media (e.g., USB drives, external HDDs).
5.3 Independent Backups: Enen Digital Labs recommends maintaining multiple independent backups. Dero Vault is a tool to assist in your backup strategy, not a replacement for comprehensive data management.

6. LIMITATIONS OF THE SOFTWARE
6.1 No Guarantee of Success: Enen Digital Labs does not guarantee that every file will be backed up or restored successfully. Backup success depends on hardware reliability, file permissions, and system state.
6.2 Interrupted Backups: Backups interrupted by hardware disconnection, power loss, or system shutdown may result in incomplete data. Use the Software's verification features to check backup integrity.
6.3 Malware and Corruption: The Software may back up files that are already corrupted or infected by malware. It does not perform antivirus scanning.
6.4 Hardware Failure: Enen Digital Labs is not responsible for the failure of your computer hardware or backup drives.

7. AUTOMATIC BEHAVIOUR
The Software is designed to:
- Launch automatically at Windows login (configurable in Settings).
- Detect the insertion of removable media to identify registered backup drives.
- Initiate automatic backups when a registered drive is connected (configurable in Settings).

8. UPDATES AND CHANGES
Enen Digital Labs may provide updates to the Software. If update endpoints are configured and active, the Software may check for updates. Updates are never installed without your explicit approval. Features may be added, modified, or removed in future versions.

9. PRIVACY AND ONLINE SERVICES
Use of the Software is subject to the Dero Vault Privacy Notice. Core backup functionality works offline. Optional services, such as stability reporting and adoption analytics, require your separate, informed consent.

10. DISCLAIMER OF WARRANTIES
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTY OF ANY KIND. ENEN DIGITAL LABS DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

11. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ENEN DIGITAL LABS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUE, OR ANY LOSS OF DATA OR DATA USE, ARISING OUT OF OR IN CONNECTION WITH THE SOFTWARE. IN NO EVENT SHALL THE TOTAL LIABILITY OF ENEN DIGITAL LABS EXCEED THE AMOUNT PAID BY YOU FOR THE LICENCE (IF ANY).

12. GOVERNING LAW AND DISPUTE RESOLUTION
12.1 Governing Law: This EULA is governed by the laws of the Republic of Uganda.
12.2 Dispute Resolution: Any dispute arising out of or in connection with this EULA shall be referred to and finally resolved by arbitration in accordance with the Centre for Arbitration and Dispute Resolution (CADER) Rules.
12.3 Seat and Language: The seat of arbitration shall be Kampala, Uganda. The language of the proceedings shall be English.
12.4 Statutory Rights: This clause does not waive your non-waivable statutory rights or access to regulatory complaint mechanisms. You may seek urgent interim relief from a court of competent jurisdiction.

13. TERMINATION
Enen Digital Labs may terminate this licence if you fail to comply with its terms. Upon termination, you must cease all use of the Software and destroy all copies in your possession.

14. CONTACT INFORMATION
For legal notices or inquiries: +256789856805
- Publisher: Enen Digital Labs Co. Ltd
- Location: Kampala, Uganda
- Brand: Dero Vault™ — Your Digital Granary

© 2026 Enen Digital Labs Co. Ltd. All rights reserved.`;

const PRIVACY_TEXT = `# DERO VAULT™ PRIVACY NOTICE

Version: 1.0.0
Effective Date: 23 October 2026
Publisher: Enen Digital Labs Co. Ltd ("Enen Digital Labs")
Applicable Law: Uganda Data Protection and Privacy Act, 2019

--------------------------------------------------------------------------------

1. OVERVIEW
Dero Vault™ is designed with a "Privacy-by-Design" and "Offline-First" philosophy. Our core mission is to provide local-first backup protection for your digital assets without requiring cloud dependencies, online user accounts, or unnecessary data collection.

2. LOCAL DATA PROCESSING
The Software processes the following information locally on your computer to perform its core functions:
- Backup Configuration: Paths to your source folders and destination backup drives.
- File Metadata: File names, sizes, timestamps, and cryptographic hashes (SHA-256) used for comparison and verification.
- Backup History: Records of completed, failed, or interrupted backup sessions.
- Application Logs: Diagnostic logs and error information stored strictly in your local application directory to assist with troubleshooting.

IMPORTANT: Enen Digital Labs does not have access to your local configuration, backup history, or the contents of your backed-up files. All data remains strictly on your local device and physical backup media.

3. OPTIONAL DATA TRANSMISSION
Any network communication by Dero Vault is strictly controlled, fails closed, and remains inactive by default until explicitly enabled:

3.1 Software Update Checks
If update endpoints are configured, the Software may periodically check for new versions. During this check, it transmits:
- Current application version.
- Operating system platform and architecture.
This information is used solely to provide the correct update package. No personal information or file data is included.

3.2 Stability Reporting (Optional)
If you provide separate, informed consent, the Software may transmit anonymous diagnostic reports following a crash or performance bottleneck. These reports include:
- Error messages and sanitized stack traces.
- Application version and basic hardware environment (OS version, architecture).
Sanitization: We automatically redact local usernames and file paths (e.g., C:\\Users\\[REDACTED]\\...) before transmission to prevent any personal identifier leakage.

3.3 Global Adoption Monitor (Optional)
If you provide separate, informed consent, the Software may transmit an anonymous "heartbeat" to help us understand global usage. This includes:
- A randomly generated Installation ID (not linked to your hardware serials or identity).
- Coarse storage capacity tiers (e.g., ">500GB").
- Number of registered backup drives.

4. CONSENT AND CONTROL
- Non-Conditional: Consent for stability reporting or adoption analytics is NOT a condition for using Dero Vault's core backup features.
- Strict Opt-In: Reporting is disabled by default. An unchecked box means NO consent.
- Withdrawal: You can enable or disable optional reporting at any time via the "Legal & Privacy" or "Services" tab in Settings.

5. LAWFUL BASIS FOR PROCESSING
Under the Uganda Data Protection and Privacy Act, 2019, we process information based on:
- Contractual Necessity: For core software functions (local processing only).
- Legitimate Interests: For software update checks (where configured).
- Consent: For optional stability reporting and adoption analytics.

6. DATA RETENTION AND SECURITY
- Local Data: Remains under your control on your devices.
- Anonymous Reports: If transmitted, these are stored securely and retained only as long as necessary for technical troubleshooting or usage estimation.

7. YOUR RIGHTS
You have the right to access, rectify, or request the deletion of any personal data we may hold (though we aim to hold zero personal data). You may also lodge a complaint with the Personal Data Protection Office (PDPO) in Uganda.

8. CONTACT INFORMATION
For privacy-related inquiries:
- Publisher: Enen Digital Labs Co. Ltd
- Location: Lira, Uganda Contact +256789856805
- Brand: Dero Vault™ — Your Digital Granary

© 2026 Enen Digital Labs Co. Ltd. All rights reserved.`;

export const LegalDocumentModal: React.FC<LegalDocumentModalProps> = ({
  isOpen,
  initialDoc = 'eula',
  onClose,
}) => {
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(initialDoc);
  const [copied, setCopied] = useState(false);

  // Sync activeDoc if initialDoc changes when opening
  React.useEffect(() => {
    setActiveDoc(initialDoc);
  }, [initialDoc, isOpen]);

  if (!isOpen) return null;

  const currentContent = activeDoc === 'eula' ? EULA_TEXT : PRIVACY_TEXT;
  const currentTitle =
    activeDoc === 'eula'
      ? 'End User Licence Agreement (EULA)'
      : 'Privacy Notice';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl h-[85vh] max-h-[820px] bg-[#0D1B3D] border border-[#1E3466] rounded-2xl shadow-2xl flex flex-col text-slate-100 overflow-hidden relative">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1E3466] flex items-center justify-between bg-[#081126]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#F4A62A]/10 text-[#F4A62A] border border-[#F4A62A]/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base font-['Poppins',sans-serif] text-white">
                  {currentTitle}
                </h3>
                <span className="text-[10px] bg-[#162852] text-[#00A884] font-mono px-2 py-0.5 rounded-full border border-[#1E3466]">
                  v1.0.0
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Enen Digital Labs Co. Ltd · Effective 23 October 2026
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#162852] transition-colors"
            title="Close viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher & Action Bar */}
        <div className="px-4 sm:px-5 py-2.5 bg-[#0A142E] border-b border-[#1E3466] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-[#081126] p-1 rounded-xl border border-[#1E3466]">
            <button
              onClick={() => setActiveDoc('eula')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeDoc === 'eula'
                  ? 'bg-[#F4A62A] text-[#0D1B3D] shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>EULA</span>
            </button>
            <button
              onClick={() => setActiveDoc('privacy')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeDoc === 'privacy'
                  ? 'bg-[#F4A62A] text-[#0D1B3D] shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Privacy Notice</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-[#162852] hover:bg-[#1E3466] text-slate-200 hover:text-white border border-[#1E3466] flex items-center gap-1.5 transition-colors font-medium"
              title="Copy text to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#00A884]" />
                  <span className="text-[#00A884]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-[#162852] hover:bg-[#1E3466] text-slate-200 hover:text-white border border-[#1E3466] flex items-center gap-1.5 transition-colors font-medium"
              title="Print legal document"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-xs font-mono leading-relaxed bg-[#081126] select-text">
          <pre className="whitespace-pre-wrap font-sans text-slate-200 space-y-4 max-w-none">
            {currentContent}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-[#0A142E] border-t border-[#1E3466] flex items-center justify-between text-xs text-slate-400">
          <div className="text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00A884]" />
            <span>Official Legal Record · Offline Available</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-[#F4A62A] hover:bg-[#F6B54A] text-[#0D1B3D] font-bold rounded-xl transition-all shadow-md shadow-[#F4A62A]/15"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
