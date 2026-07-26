-- Custom SQL migration file, put your code below! --
-- Required by `businesses.location` — architecture.md §5.2
-- (`location (geography POINT — PostGIS)`) and §5 ("PostgreSQL with the
-- PostGIS extension (geospatial)").
CREATE EXTENSION IF NOT EXISTS postgis;
