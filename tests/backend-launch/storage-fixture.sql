-- Deliberately permissive synthetic storage table: this tests only the added
-- restrictive policies, not the real Storage service or bucket configuration.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO authenticated;
CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
CREATE POLICY fixture_all ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO storage.objects VALUES ('50000000-0000-0000-0000-000000000001','guide-photos','fixture.jpg');
