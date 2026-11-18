-- Synthetic-only replica of captured public guide_media columns required by Storage.
DROP POLICY fixture_media_owner ON public.guide_media;
ALTER TABLE public.guide_media ADD COLUMN photo_path text;
GRANT SELECT ON public.guide_media TO anon,authenticated;
CREATE POLICY media_public_read ON public.guide_media FOR SELECT TO anon,authenticated USING
 (EXISTS (SELECT 1 FROM public.guides g WHERE g.id=guide_media.guide_id AND g.listing_status='published'));
INSERT INTO public.guide_media(id,guide_id,caption,photo_path) VALUES
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','synthetic','fixture-one/remove.png'),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','synthetic','fixture-one/retain.png'),
 ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','synthetic','fixture-one/later.png');
