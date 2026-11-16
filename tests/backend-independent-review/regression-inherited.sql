\set ON_ERROR_STOP on
-- Desired fail-closed result under the synthetic inherited-role fixture.
SELECT public.qa_assert(NOT has_function_privilege('authenticated','public.admin_decide_review(uuid,boolean,text)','EXECUTE') AND NOT has_table_privilege('authenticated','public.reviews','INSERT'),'inherited roles must not retain customer write or moderation execute');
