ALTER TABLE project_building_details ADD COLUMN covered_area_unit TEXT CHECK(covered_area_unit IN ('sqft', 'sqyd'));
