ALTER TABLE project_building_details ADD COLUMN parking_area_value REAL CHECK(parking_area_value > 0);
ALTER TABLE project_building_details ADD COLUMN parking_area_unit TEXT CHECK(parking_area_unit IN ('sqft', 'sqyd'));
