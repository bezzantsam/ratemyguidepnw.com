-- Synthetic local shim: PostgREST sets request.jwt.claims; no real Supabase Auth.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid
$$;
-- Helpers from the independent SQL suite are not part of the HTTP API.
REVOKE ALL ON FUNCTION public.qa_assert(boolean,text),public.qa_expect(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO qa_authenticator;
