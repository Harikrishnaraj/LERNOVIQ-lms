# GDPR legal positions (draft for counsel)

Status: **draft, not legal advice.** Prepared 2026-11-02 with Claude's compliance-check skill from
`PRIVACY_REGISTER.md`, `PRIVACY_GAP_REGISTER.md`, `DPIA.md` and `RETENTION.md`. Each position below is a
recommendation for the controller's privacy lead or outside counsel to accept, change or reject. Record the
decision and the approver in the "Decision" line; only then update the registers.

## Summary

**Assessment: proceed with conditions.** The platform can serve EU/UK learners once the conditions in
§8 are met. The biggest open items are the privacy notice (none is published), the transfer mechanism for
data hosted in India, and the processor terms with employer customers.

Facts this draft relies on (checked 2026-11-02):

- Controller: Lernoviq AI Technologies Private Limited, India. No EU/UK establishment.
- Database, auth and storage: Supabase project in **ap-south-1 (Mumbai)**.
- Application server: Hostinger VPS (location to be confirmed).
- Email: Resend or Hostinger Mail, depending on configuration.
- No advertising or analytics trackers on the public site.

## 1. Which laws apply

| Law | Applies? | Why |
| --- | --- | --- |
| EU GDPR | Yes, if the service is offered to people in the EU (Art. 3(2)) | Learners and employer customers in the EU |
| UK GDPR | Yes, if offered to people in the UK | Same test |
| India DPDP Act 2023 and DPDP Rules 2025 | Yes, always | Company and data are in India |
| Art. 27 representative | Likely required | Controller outside the EU offering services to EU residents; exemption for occasional, low-risk processing is unlikely to fit an LMS |

**Position:** treat GDPR, UK GDPR and the DPDP Act as all applying. Appoint an EU and a UK representative
before the first EU/UK customer goes live.

**Decision:** ______ (approver, date)

## 2. Controller and processor roles

| Situation | LERNOVIQ role | Customer role | Contract needed |
| --- | --- | --- | --- |
| Individual learner signs up directly | Controller | n/a | Privacy notice + terms |
| Employer organisation enrols its staff (org admin portal) | **Processor** for the employer's learner data | Controller | Art. 28 DPA with each employer |
| Content server: course runs inside the customer's own LMS | Processor (learner key, progress sent back) | Controller | Art. 28 DPA in the licence terms |
| Account security, fraud prevention, audit logs, billing | Controller (own purposes) | n/a | Disclosed in the notice |

**Position:** sign a standard Data Processing Addendum with every employer and content-server customer. It
must cover the Art. 28 items: instructions, confidentiality, security, sub-processors (Supabase,
Hostinger, the mail provider) with notice of changes, help with rights requests, breach notice within
**48 hours**, deletion at contract end within **30 days**, and audit by report.

**Decision:** ______

## 3. Lawful basis per data category

| # | Category | Recommended basis | Note |
| --- | --- | --- | --- |
| 1 | Account and profile | Contract, Art. 6(1)(b) | |
| 2 | Authentication, login history | Contract (sign-in); legitimate interests (security logs) | Keep the 12-month limit |
| 3 | Learning progress and time | Contract | For employer accounts the employer chooses the basis; tell learners their employer can see it |
| 4 | Assessment attempts | Contract | |
| 5 | Certificates | Contract; legitimate interests for public verification | See §6 on retention |
| 6 | Submissions | Contract | |
| 7 | Messages and discussions | Contract | Moderation under legitimate interests |
| 8 | Audit logs | Legitimate interests; legal obligation where a law requires a record | |
| 9 | Organisation membership | Processor for the employer | Employer is controller |
| 10 | Enquiries and applications | Steps before a contract | Consent only for marketing email |
| 11 | Analytics | Legitimate interests | Aggregated, as today |
| 12 | Report exports | Legitimate interests (or the employer's basis) | No names or emails, as today |
| 13 | Uploaded files | Contract | |
| 14 | Data held by vendors | Same as the source category | Vendors are processors |

**Position:** no category should rely on consent except marketing email. Each legitimate-interests line needs
a short balancing test (LIA) on file before launch.

**Decision:** ______

## 4. International transfers

The data is stored in India. India has **no EU or UK adequacy decision**, so data of EU/UK learners
needs a transfer mechanism.

| Flow | Mechanism | Action |
| --- | --- | --- |
| Employer (EU, controller) → LERNOVIQ (India, processor) | EU SCCs 2021, Module 2; UK IDTA or Addendum | Attach to the DPA in §2 |
| Individual EU learner → LERNOVIQ (India, controller) | Art. 3(2) direct collection; no transfer under EDPB Guidelines 05/2021 | Disclose the location in the notice |
| LERNOVIQ → Supabase, Hostinger, mail provider | Their DPAs and SCCs (Module 3 where we are processor) | Sign each vendor's DPA; record the regions |
| All transfers | Transfer impact assessment for India | Cover government access under Indian law, and the encryption at rest and in transit already in place |

**Position:** sign vendor DPAs, attach SCCs to customer DPAs, and complete one India transfer impact
assessment. Offer an EU-hosted database later if large EU customers require it.

**Decision:** ______

## 5. Personal-data breach procedure

Nothing exists today. Minimum procedure to adopt:

1. Anyone who suspects a breach reports it to the breach owner the same day.
2. Breach owner opens an incident record: what data, how many people, when, how found.
3. Contain it: revoke keys, suspend accounts, restore from backup as needed.
4. Within **72 hours** of becoming aware: notify the lead EU authority (through the Art. 27 representative)
   and the ICO for UK data, unless the breach is unlikely to risk people's rights.
5. Notify India's Data Protection Board and affected people **without delay**, as the DPDP Rules require.
6. As processor: notify the affected employer within **48 hours**, so they can meet their own 72-hour deadline.
7. Tell affected people directly when the risk to them is high.
8. Record every breach, including those not reported, with the reasoning.

**Position:** name a breach owner and a deputy, and add this procedure to `RUNBOOKS.md`.

**Decision:** ______ (breach owner: ______)

## 6. Retention decisions still open

| Item | Recommendation | Reason |
| --- | --- | --- |
| Certificates after account deletion | Keep the verification record (certificate id, course, date, learner name) for 7 years | Employers and third parties rely on verification; delete on request unless a legal claim needs it |
| Closed privacy requests | Keep 3 years, then delete | Proof of compliance; matches typical complaint limitation periods |
| Legal hold on deletion | Use only for active legal claims or a statutory duty, recorded with reason and end date | Prevents indefinite holds |
| Server logs on the VPS | Rotate at 90 days | Security value falls after that |
| Vendor logs | Accept each vendor's default; record it | Not under our control |

**Decision:** ______

## 7. Impact assessments (DPIA)

| Processing | DPIA? | When |
| --- | --- | --- |
| Employers seeing staff progress and time | **Yes** (systematic monitoring of employees) | Before selling to employers. The employer is controller, but we should provide a template DPIA and a learner notice. |
| AI tutor and instructor AI | **Yes** (new technology, data sent to an outside model) | Before T-200 ships; also check the EU AI Act (education uses can be high-risk) |
| Automatic completion and certificates | No | Published rules, no significant effect |
| Special-category data | Not collected | Reassess if proctoring is ever added |

**Decision:** ______

## 8. Conditions before launch to EU/UK users

1. Publish a privacy notice at `/privacy` covering: identity and contact, purposes and bases (§3), recipients
   and vendors, transfers to India (§4), retention (§6), rights and how to use them, and the right to complain.
2. Name the privacy lead, the breach owner (§5), and the EU and UK representatives (§1).
3. Sign vendor DPAs; finalise the customer DPA with SCCs (§2, §4); complete the transfer impact assessment.
4. Close the engineering gaps: storage deletion with the account, full data export, tracked requests for
   visitors, overdue reminders, and backups (`SUPABASE_DB_URL` secret).
5. Complete the monitoring DPIA before the first employer customer.

## Approvals needed

| Approver | For | Status |
| --- | --- | --- |
| Company director | Representatives, privacy lead, breach owner | Pending |
| Privacy counsel (EU/UK and India) | §1–§7 positions | Pending |
| Engineering | §8 item 4 | Pending |

## Further review recommended

- Whether a Data Protection Officer is required (large-scale employee monitoring could trigger Art. 37).
- EU AI Act classification of the AI tutor.
- DPDP Act: notice language, consent manager rules, and children's data, if learners under 18 are expected.
