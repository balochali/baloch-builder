ALTER TABLE project_building_details
  ADD COLUMN planned_houses INTEGER CHECK(planned_houses >= 0);

ALTER TABLE project_building_details
  ADD COLUMN has_masjid INTEGER NOT NULL DEFAULT 0 CHECK(has_masjid IN (0, 1));

ALTER TABLE project_building_details
  ADD COLUMN selected_spaces_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE project_building_details
  ADD COLUMN floor_layout_json TEXT NOT NULL DEFAULT '[]';
