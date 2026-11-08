DROP INDEX IF EXISTS partner_name_unique;
CREATE UNIQUE INDEX partner_name_unique ON partners(lower(btrim(name))) WHERE status='Active';

CREATE TEMP TABLE legacy_project_partners ON COMMIT DROP AS
SELECT j.id AS project_id, COALESCE(item->>'partnerId',item->>'id') AS legacy_id, btrim(item->>'name') AS name
FROM projects j CROSS JOIN LATERAL (
  SELECT value AS item FROM jsonb_array_elements(COALESCE(j.details->'sitePartners','[]'::jsonb))
  UNION ALL SELECT value FROM jsonb_array_elements(COALESCE(j.details->'partners','[]'::jsonb))
  UNION ALL SELECT value FROM jsonb_array_elements(COALESCE(j.details->'feasibility'->'partners','[]'::jsonb))
) identities WHERE btrim(item->>'name')<>'';

INSERT INTO partners(name,role)
SELECT DISTINCT ON (lower(name)) name,'Partner' FROM legacy_project_partners l
WHERE NOT EXISTS (SELECT 1 FROM partners m WHERE lower(btrim(m.name))=lower(l.name) OR m.id::text=l.legacy_id)
ORDER BY lower(name),name ON CONFLICT DO NOTHING;

CREATE TEMP TABLE master_partner_map ON COMMIT DROP AS
SELECT l.*, (SELECT id FROM partners m WHERE m.id::text=l.legacy_id OR lower(btrim(m.name))=lower(l.name)
 ORDER BY (m.id::text=l.legacy_id) DESC NULLS LAST,(m.status='Active') DESC,m.id LIMIT 1) AS master_id
FROM legacy_project_partners l;

INSERT INTO project_partner_links(project_id,partner_id)
SELECT DISTINCT project_id,master_id FROM master_partner_map WHERE master_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE projects j SET details =
 (j.details - 'sitePartners')
 || CASE WHEN j.details ? 'partners' THEN jsonb_build_object('partners',
  COALESCE((SELECT jsonb_agg(f.value || COALESCE((SELECT jsonb_build_object('partnerId',m.master_id) FROM master_partner_map m
   WHERE m.project_id=j.id AND (m.legacy_id=f.value->>'partnerId' OR lower(m.name)=lower(btrim(f.value->>'name'))) AND m.master_id IS NOT NULL
   ORDER BY (m.legacy_id=f.value->>'partnerId') DESC NULLS LAST,m.master_id LIMIT 1),'{}'::jsonb) ORDER BY f.ordinality)
   FROM jsonb_array_elements(j.details->'partners') WITH ORDINALITY f),'[]'::jsonb)) ELSE '{}'::jsonb END
 || CASE WHEN j.details->'feasibility' ? 'partners' THEN jsonb_build_object('feasibility',
  jsonb_set(j.details->'feasibility','{partners}',COALESCE((SELECT jsonb_agg(f.value || COALESCE((
   SELECT jsonb_build_object('partnerId',m.master_id) FROM master_partner_map m WHERE m.project_id=j.id
   AND (m.legacy_id=f.value->>'partnerId' OR lower(m.name)=lower(btrim(f.value->>'name'))) AND m.master_id IS NOT NULL
   ORDER BY (m.legacy_id=f.value->>'partnerId') DESC NULLS LAST,m.master_id LIMIT 1),'{}'::jsonb) ORDER BY f.ordinality)
   FROM jsonb_array_elements(j.details->'feasibility'->'partners') WITH ORDINALITY f),'[]'::jsonb))) ELSE '{}'::jsonb END
 || CASE WHEN j.details ? 'landParcels' THEN jsonb_build_object('landParcels',
  COALESCE((SELECT jsonb_agg(f.value || COALESCE((SELECT jsonb_build_object('contributingPartnerId',m.master_id)
   FROM master_partner_map m WHERE m.project_id=j.id AND m.legacy_id=f.value->>'contributingPartnerId' AND m.master_id IS NOT NULL
   ORDER BY m.master_id LIMIT 1),'{}'::jsonb) ORDER BY f.ordinality)
   FROM jsonb_array_elements(j.details->'landParcels') WITH ORDINALITY f),'[]'::jsonb)) ELSE '{}'::jsonb END
WHERE j.details ?| ARRAY['sitePartners','partners','feasibility','landParcels'];
