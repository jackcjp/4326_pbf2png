PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE metadata (
                    name TEXT PRIMARY KEY,
                    value TEXT
                );
INSERT INTO metadata VALUES('basename','0-0-0.mbtiles');
INSERT INTO metadata VALUES('id','0-0-0');
INSERT INTO metadata VALUES('tile_width','256');
INSERT INTO metadata VALUES('tile_height','256');
INSERT INTO metadata VALUES('format','png');
INSERT INTO metadata VALUES('scheme','xyz');
INSERT INTO metadata VALUES('minzoom','0');
INSERT INTO metadata VALUES('maxzoom','6');
INSERT INTO metadata VALUES('bounds','-180, -85.05112877980659, 180, 85.0511287798066');
INSERT INTO metadata VALUES('center','0, 0, 3');
COMMIT;