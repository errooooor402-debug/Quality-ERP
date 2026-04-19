# Security Specification - Quality Analytics Dashboard

## Data Invariants
1. Sub-collections (Reports) must belong to a valid section and line.
2. Users can only write reports if they are 'admin' or 'entry' roles and assigned to the correct line (if applicable).
3. Owners can only update their own profile fields.
4. Admins have full read/write access to all reports.
5. All timestamps must be server-validated.

## The "Dirty Dozen" Payloads

1. **Identity Injection**: Attempt to create a report with `createdBy` set to another user's UID.
2. **Privilege Escalation**: Attempt to update own `UserProfile` role to 'admin'.
3. **State Shortcutting**: Attempt to update a report's `dhuPercent` without providing correct underlying quantities (handled by validation helper).
4. **ID Poisoning**: Attempt to create a report with a document ID containing special characters or excessive length.
5. **Orphaned Write**: Attempt to create a report for a line the user is not assigned to.
6. **Shadow Fields**: Attempt to create a user profile with an extra `isVerifiedAdmin` field not in the schema.
7. **Type Mismatch**: Attempt to set `totalCheckQty` as a string instead of a number.
8. **Immortality Bypass**: Attempt to update the `createdAt` timestamp of an existing report.
9. **Zero-Trust List Query**: Attempt to query all `dhuReports` without being an admin or an active user.
10. **Self-Activation**: Attempt to set `isActive: true` in `UserProfile` during initial creation (if default is false).
11. **Negative Quantities**: Attempt to set `qcPassQty` to a negative number.
12. **Cross-Section Poisoning**: Attempt to set `section: 'Cutting'` on a document in the `dhuReports` and filtering by it (if dhuReports is only for Sewing).

## The Test Plan
Verify all above payloads return `PERMISSION_DENIED` using Firebase Emulator or `firestore.rules.test.ts`.
