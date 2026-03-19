# Incident Response Plan

## Contact

For security or privacy incidents, contact: **info@bizzicloud.io**

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **Critical** | Active data breach, service compromise, ransomware | Immediate (within 1 hour) |
| **High** | Suspected breach, credential compromise, significant outage | Within 4 hours |
| **Medium** | Vulnerability disclosure, minor data exposure | Within 24 hours |
| **Low** | Policy violation, minor security concern | Within 72 hours |

## Response Steps

### 1. Triage

- Confirm the incident and classify severity
- Assign an incident owner
- Notify stakeholders as appropriate

### 2. Containment

- Isolate affected systems or accounts
- Revoke compromised credentials
- Block malicious IPs or actors if applicable

### 3. Eradication

- Remove threat (malware, unauthorized access)
- Patch vulnerabilities
- Rotate keys or secrets if compromised

### 4. Recovery

- Restore services from backups if needed
- Verify systems are clean and secure
- Resume normal operations

### 5. Post-Incident

- Document timeline and actions taken
- Update security controls to prevent recurrence
- Notify affected users if required by law (e.g., breach notification)

## Data Breach Notification

If personal data is compromised:

- Assess scope and affected users
- Comply with applicable laws (e.g., GDPR 72-hour notification, state breach laws)
- Notify users via email and/or in-app notice
- Provide guidance on steps users can take

## Logging and Evidence

- Preserve logs and evidence for investigation
- Use `audit_logs` collection and application logs
- Do not delete or alter logs during an active incident
