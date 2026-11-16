-- TEST FIXTURE ONLY: intentional local opt-in; never an application migration.
GRANT INSERT ON storage.objects TO authenticated;
CREATE POLICY qa_private_object_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (qa_storage_private.can_insert(bucket_id,name));
