UPDATE settings SET value=value || jsonb_build_object('areaDisplayUnit','sqft','marlaSqft',coalesce(value->>'sqftPerMarla','272.25')) WHERE NOT value ? 'areaDisplayUnit';
