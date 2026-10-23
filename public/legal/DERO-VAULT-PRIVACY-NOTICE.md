# DERO VAULT™ PRIVACY NOTICE

**Version:** 1.0.0  
**Effective Date:** 23 October 2026  
**Publisher:** Enen Digital Labs Co. Ltd ("Enen Digital Labs")

---

### 1. OVERVIEW

Dero Vault™ is designed with a "Privacy-by-Design" and "Offline-First" philosophy. Our core mission is to provide local-first backup protection for your digital assets without requiring cloud dependencies or unnecessary data collection.

### 2. LOCAL DATA PROCESSING

The Software processes the following information locally on your computer to perform its core functions:

- **Backup Configuration:** Paths to your source folders and destination backup drives.
- **File Metadata:** File names, sizes, timestamps, and cryptographic hashes (SHA-256) used for comparison and verification.
- **Backup History:** Records of completed, failed, or interrupted backup sessions.
- **Application Logs:** Diagnostic logs and error information stored in your local application directory to assist with troubleshooting.

**IMPORTANT:** Enen Digital Labs does not have access to your local configuration, backup history, or the contents of your backed-up files. This information remains strictly on your local device and backup media.

### 3. OPTIONAL DATA TRANSMISSION

Any network communication by Dero Vault is strictly controlled and inactive by default.

#### 3.1 Software Update Checks
If update endpoints are configured, the Software may periodically check for new versions. During this check, it transmits:
- Current application version.
- Operating system platform and architecture.
This information is used solely to provide the correct update package. No personal information or file data is included.

#### 3.2 Stability Reporting (Optional)
If you provide separate, informed consent, the Software may transmit anonymous diagnostic reports following a crash or performance bottleneck. These reports include:
- Error messages and sanitized stack traces.
- Application version and basic hardware environment (OS version, architecture).
**Sanitization:** We automatically redact local usernames and file paths (e.g., `C:\Users\[REDACTED]\...`) before transmission to prevent PII leakage.

#### 3.3 Global Adoption Monitor (Optional)
If you provide separate, informed consent, the Software may transmit an anonymous "heartbeat" to help us understand global usage. This includes:
- A randomly generated Installation ID (not linked to your hardware serials or identity).
- Coarse storage capacity tiers (e.g., ">500GB").
- Number of registered backup drives.

### 4. CONSENT AND CONTROL

- **Non-Conditional:** Consent for stability reporting or adoption analytics is NOT a condition for using Dero Vault's core backup features.
- **Strict Opt-In:** Reporting is disabled by default. An unchecked box means NO consent.
- **Withdrawal:** You can enable or disable optional reporting at any time via the "Services & Updates" tab in Settings.

### 5. LAWFUL BASIS FOR PROCESSING

Under the **Uganda Data Protection and Privacy Act, 2019**, we process information based on:
- **Contractual Necessity:** For core software functions (local processing only).
- **Legitimate Interests:** For software update checks (where configured).
- **Consent:** For optional stability reporting and adoption analytics.

### 6. DATA RETENTION AND SECURITY

- **Local Data:** Remains under your control on your devices.
- **Anonymous Reports:** If transmitted, these are stored securely and retained only as long as necessary for technical troubleshooting or usage estimation.

### 7. YOUR RIGHTS

You have the right to access, rectify, or request the deletion of any personal data we may hold (though we aim to hold zero personal data). You may also lodge a complaint with the **Personal Data Protection Office (PDPO)** in Uganda.

### 8. CONTACT INFORMATION

For privacy-related inquiries, please contact:
- **Data Protection Contact:** [PLACEHOLDER: PRIVACY EMAIL ADDRESS]

---
© 2026 Enen Digital Labs Co. Ltd. All rights reserved.
