import 'server-only';

/**
 * Browser forms are NOT evidence that the deployed Supabase schema and RLS work.
 *
 * Both switches deliberately remain false. Enabling a feature requires a
 * reviewed code change AND an explicit deployment opt-in, AFTER separate live
 * schema, GRANT/RLS, real JWT, moderator and audit checks have passed.
 *
 * This is a user-experience fail-closed guard, not a database authorization
 * mechanism. All writes still require server-side grants, RLS and audit.
 */
const REVIEWED_LIVE_WRITE_APPROVAL = Object.freeze({
  reviewSubmission: false,
  captainClaimSubmission: false,
});

export type BackendWriteAvailability = Readonly<{
  reviews: boolean;
  claims: boolean;
}>;

export function backendWriteAvailability(): BackendWriteAvailability {
  const deploymentOptIn =
    process.env.RMG_BACKEND_WRITE_RELEASE === 'explicitly-reviewed-live-rls-and-jwt';
  return {
    reviews: REVIEWED_LIVE_WRITE_APPROVAL.reviewSubmission && deploymentOptIn,
    claims: REVIEWED_LIVE_WRITE_APPROVAL.captainClaimSubmission && deploymentOptIn,
  };
}
