-- Safe Drop Sequence for the views to clear out stuck links
DROP VIEW IF EXISTS "Inventorybalances" CASCADE;
DROP VIEW IF EXISTS "InventoryBalances" CASCADE;
DROP VIEW IF EXISTS "Parts" CASCADE;

-- 1. Create tables ONLY if they don't exist yet
CREATE TABLE IF NOT EXISTS "PartsTable" (
    partid INT PRIMARY KEY,
    sku VARCHAR(50) UNIQUE,
    name VARCHAR(150),
    material_name VARCHAR(100) DEFAULT 'Hardened Steel',
    retailprice NUMERIC(10, 2),
    minimumstocklevel INT
);

CREATE TABLE IF NOT EXISTS "InventoryBalancesTable" (
    partid INT REFERENCES "PartsTable"(partid),
    warehouseid INT,
    binlocation VARCHAR(50),
    quantityonhand INT
);

-- 2. Rebuild your exact unified uppercase Views with case-sensitive aliases matching your Express backend
CREATE VIEW "Parts" AS 
SELECT 
    partid AS "PartID",
    sku AS "SKU",
    name AS "Name",
    material_name AS "MaterialName",
    retailprice AS "RetailPrice",
    minimumstocklevel AS "MinimumStockLevel"
FROM "PartsTable";

CREATE VIEW "InventoryBalances" AS 
SELECT 
    partid AS "PartID",
    warehouseid AS "WarehouseID",
    binlocation AS "BinLocation",
    quantityonhand AS "QuantityOnHand"
FROM "InventoryBalancesTable";

CREATE VIEW "Inventorybalances" AS SELECT * FROM "InventoryBalances";

-- 3. Seed data rows (using ON CONFLICT DO NOTHING so it won't crash if item 1 is already there)
INSERT INTO "PartsTable" (partid, sku, name, material_name, retailprice, minimumstocklevel)
VALUES 
(1, 'SKU-AZURE-PRO', 'Cloud Processing Core Unit', 'Aerospace-Grade Aluminum', 149.99, 5),
(2, 'SKU-AZURE-NODE', 'Edge Routing Controller', 'High-Density Polyethylene', 89.50, 5),
(3, 'SKU-AZURE-THERM', 'Thermal Regulation Sink', 'Anodized Copper', 210.00, 2),
(4, 'SKU-AZURE-PWR', 'Solid State Power Module', 'Silicon Carbide', 345.25, 3)
ON CONFLICT (partid) DO NOTHING;

INSERT INTO "InventoryBalancesTable" (partid, warehouseid, binlocation, quantityonhand)
VALUES 
(1, 101, 'ZONE-A-BIN-7', 2),
(2, 101, 'ZONE-B-BIN-3', 4),
(3, 101, 'ZONE-C-BIN-12', 1),
(4, 101, 'ZONE-A-BIN-1', 8)
ON CONFLICT DO NOTHING;