-- Apply atomically. A rejected submission stays in the author's history and the
-- moderation audit. A replacement gets its own ID and the normal submission policy.
DO $migration$
DECLARE
  submit_fn regprocedure := 'rmg_private.submit_review(text,text,smallint,smallint,boolean,text,boolean,text,jsonb)'::regprocedure;
  lookup_fn regprocedure := 'rmg_private.own_review_for_guide(text,text)'::regprocedure;
  submit_def text := pg_get_functiondef(submit_fn);
  lookup_def text := pg_get_functiondef(lookup_fn);
  pair_filter constant text := 'FROM public.reviews r WHERE r.guide_id=gid AND r.author_id=actor';
  active_filter constant text := pair_filter || ' AND r.status <> ''rejected''';
  old_index regclass := to_regclass('public.reviewer_one_review_per_guide');
  active_index regclass := to_regclass('public.reviewer_one_active_review_per_guide');
BEGIN
  -- Both live and earlier versions use these two predicates. Change only those
  -- so each installation retains its existing payload, checks, and publication mode.
  IF active_index IS NOT NULL AND old_index IS NULL AND
     pg_get_indexdef(active_index) = 'CREATE UNIQUE INDEX reviewer_one_active_review_per_guide ON public.reviews USING btree (guide_id, author_id) WHERE (status <> ''rejected''::text)' AND
     strpos(submit_def, active_filter || ')') > 0 AND strpos(lookup_def, active_filter || ';') > 0 THEN
    RETURN;
  END IF;
  IF old_index IS NULL OR active_index IS NOT NULL OR
     pg_get_indexdef(old_index) <> 'CREATE UNIQUE INDEX reviewer_one_review_per_guide ON public.reviews USING btree (guide_id, author_id)' OR
     array_length(string_to_array(submit_def, pair_filter || ')'), 1) <> 2 OR
     array_length(string_to_array(lookup_def, pair_filter || ';'), 1) <> 2 THEN
    RAISE EXCEPTION 'Unexpected review uniqueness or lookup definition; no changes applied';
  END IF;

  PERFORM set_config('lock_timeout','5s',true);
  CREATE UNIQUE INDEX reviewer_one_active_review_per_guide ON public.reviews (guide_id, author_id)
    WHERE status <> 'rejected';
  EXECUTE replace(submit_def, pair_filter || ')', active_filter || ')');
  EXECUTE replace(lookup_def, pair_filter || ';', active_filter || ';');
  DROP INDEX public.reviewer_one_review_per_guide;
END
$migration$;
