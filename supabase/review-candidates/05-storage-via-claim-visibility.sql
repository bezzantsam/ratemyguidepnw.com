-- ALTERNATIVE REVIEW CANDIDATE ONLY; do not apply together with unreviewed SQL.
-- Hosted storage.objects is owned by a role unavailable to the postgres MCP
-- account. The existing guide-photos INSERT/DELETE policies join guide_claims
-- as the caller. Restrict direct approved-claim visibility so those existing
-- permissive policies cannot match. Owner status and profile changes use the
-- separately authorized SECURITY DEFINER RPCs, not direct claim-table reads.
-- This depends on the *current* storage policy definitions remaining unchanged.
BEGIN;
CREATE POLICY rmg_launch_no_direct_approved_claims ON public.guide_claims AS RESTRICTIVE
 FOR SELECT TO authenticated USING (status <> 'approved');
COMMIT;
