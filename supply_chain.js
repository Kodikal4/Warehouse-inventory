const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); 

const db = new Pool({
    connectionString: process.env.WAREHOUSE_SQL_DATABASE,
    ssl: { rejectUnauthorized: false } 
});

// Serve frontend cleanly from root directory
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// NEW: 1. GET Aggregate Inventory Summary for Analytics Pulse
app.get('/api/inventory/summary', async (_req, res) => {
    try {
        const summaryQuery = `
            SELECT 
                COALESCE(SUM(i.quantityonhand * p.retailprice), 0) AS total_value,
                COUNT(DISTINCT i.warehouseid) AS active_warehouses,
                COUNT(CASE WHEN i.quantityonhand <= p.minimumstocklevel THEN 1 END) AS stockout_risks
            FROM public.partstable p
            LEFT JOIN public.inventorybalancestable i ON p.partid = i.partid;
        `;
        const result = await db.query(summaryQuery);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Failed to compile executive summary metrics:", err);
        res.status(500).json({ error: "Internal analytics engine error." });
    }
});

// 2. GET: Fetch Dashboard Items
app.get('/api/inventory/low-stock', async (_req, res) => {
    try {
        const queryText = `
            SELECT 
                p.sku, 
                p.name AS asset_class, 
                p.material_name AS material, 
                p.retailprice AS price,
                -- Translate cryptic Warehouse IDs into clear human locations!
                CASE 
                    WHEN i.warehouseid = 101 THEN '📍 Detroit Assembly Plant'
                    WHEN i.warehouseid = 202 THEN '📍 Chicago Distribution Hub'
                    ELSE '📍 Unknown Node (' || i.warehouseid || ')'
                END AS node_loc,
                i.quantityonhand AS capacity_rate
        FROM public.partstable p
        LEFT JOIN public.inventorybalancestable i ON p.partid = i.partid;
        `;
        const result = await db.query(queryText);
        res.json(result.rows);
    } catch (err) {
        console.error("Backend failed to read tracking views:", err);
        res.status(500).json({ error: "Failed to extract inventory tracking items" });
    }
});

// 3. POST: Adjust Stock Level 
app.post('/api/inventory/adjust', async (req, res) => {
    const { partId, warehouseId, quantityChanged, transactiontype } = req.body;
    try {
        await db.query('BEGIN'); 

        const updateQuery = `
            UPDATE public.inventorybalancestable 
            SET quantityonhand = quantityonhand + $1 
            WHERE partid = $2 AND warehouseid = $3
            RETURNING quantityonhand;
        `;
        const updateResult = await db.query(updateQuery, [quantityChanged, partId, warehouseId]);

        if (updateResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: "Inventory record location target not found" });
        }

        const logQuery = `
            INSERT INTO public.stocktransactions (partid, warehouseid, quantitychanged, transactiontype)
            VALUES ($1, $2, $3, $4);
        `;
        await db.query(logQuery, [partId, warehouseId, quantityChanged, transactiontype]);

        await db.query('COMMIT'); 
        res.json({ success: true, currentStock: updateResult.rows[0].quantityonhand });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error("Failed to alter physical inventory volumes:", err);
        res.status(500).json({ error: "Internal engine error processing transaction modification." });
    }
});

// 4. PUT: Structural Key Mutation
app.put('/api/inventory/update-keys', async (req, res) => {
    const { oldPartId, oldWarehouseId, newPartId, newWarehouseId } = req.body;
    try {
        await db.query('BEGIN');

        // 1. Update the item's main catalog number in the partstable
        // If the ID is the same (e.g. 1 to 1), this cleanly skips modification
        if (oldPartId !== newPartId) {
            await client.query(`
                UPDATE public.partstable 
                SET partid = $1 
                WHERE partid = $2;
            `, [newPartId, oldPartId]);
        }

        // 2. SMART LOGISTICS UPDATE (Prevents Key Collision)
        // This checks if the new location already tracks this item.
        // If it does, it updates it. If it doesn't, it creates it cleanly.
        const upsertInventoryQuery = `
            INSERT INTO public.inventorybalancestable (partid, warehouseid, binlocation, quantityonhand)
            VALUES ($1, $2, 'TRANSFER-ZONE', 1)
            ON CONFLICT (partid, warehouseid) 
            DO UPDATE SET 
                warehouseid = EXCLUDED.warehouseid,
                binlocation = 'RELOCATED-BAY';
        `;
        
        await client.query(upsertInventoryQuery, [newPartId, newWarehouseId]);

        // Commit the transaction to the Azure database
        await client.query('COMMIT');
        res.status(200).json({ success: true });

    } catch (err) {
        // If anything goes wrong, safely rollback so data isn't corrupted
        await client.query('ROLLBACK');
        console.error("Logistics Update Failed:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Inventory Engine active on port ${PORT}`);
});
