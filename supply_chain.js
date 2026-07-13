const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); 

// Single corporate master pool connections connection layer mapping
const db = new Pool({
    connectionString: "postgresql://superman4:Postgre4231@superman4-db.postgres.database.azure.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

db.on('connect', (client) => {
    client.query('SET search_path TO public, assets, values;');
});

// Serve frontend cleanly from root directory
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. GET Executive Summary Dashboard Cards
app.get('/api/inventory/summary', async (_req, res) => {
    try {
        // FIXED: Swapped to LEFT JOIN and removed hardcoded WHERE clause so total calculations remain consistent
        const summaryQuery = `
            SELECT 
                -- 1. Financial footprint calculated across all linked inventory structures
                COALESCE(SUM(i.quantityonhand * p.retailprice), 0) AS total_value,
                
                -- 2. Clean count of facilities tracking active stock
                COUNT(DISTINCT CASE WHEN i.quantityonhand > 0 THEN i.warehouseid END) AS active_warehouses,
                
                -- 3. Filtered count for stockout risks (items below minimum stock threshold but above zero)
                COALESCE((
                    SELECT COUNT(*) 
                    FROM public.inventorybalancestable inv
                    INNER JOIN public.partstable parts ON inv.partid = parts.partid
                    WHERE inv.quantityonhand <= parts.minimumstocklevel 
                      AND inv.quantityonhand > 0
                ), 0) AS stockout_risks
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

// 2. GET Live Stock Catalog Entries
app.get('/api/inventory', async (req, res) => {
    try {
        const { warehouseId } = req.query; 
        
        let queryText = `
            SELECT 
                p.sku, p.name, p.material_name AS material, p.retailprice,
                i.warehouseid, COALESCE(i.quantityonhand, 0) AS quantityonhand, i.datecheckedout, p.minimumstocklevel, p.partid,
                w.facility_name AS node_loc
            FROM public.partstable p
            LEFT JOIN public.inventorybalancestable i ON p.partid = i.partid
            LEFT JOIN public.warehousestable w ON i.warehouseid = w.warehouseid
        `;

        const queryParams = [];
        if (warehouseId && warehouseId !== 'all' && warehouseId !== '') {
            queryText += ` WHERE i.warehouseid = $1`;
            queryParams.push(parseInt(warehouseId));
        }

        queryText += ` ORDER BY p.partid ASC`;

        const result = await db.query(queryText, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error("Failed to extract inventory tracking items:", err);
        res.status(500).json({ error: "Failed to extract inventory tracking items" });
    }
});

// 3. POST: Adjust Stock Level 
app.post('/api/inventory/adjust', async (req, res) => {
    const { partId, warehouseId, quantityChanged, transactiontype } = req.body;
    const client = await db.connect();
    
    const absoluteQuantity = Math.abs(quantityChanged); 
    const executionValue = transactiontype === 'PICK' ? -absoluteQuantity : absoluteQuantity;

    try {
        await client.query('BEGIN'); 

        const updateQuery = `
            UPDATE public.inventorybalancestable 
            SET quantityonhand = quantityonhand + $1,
                datecheckedout = CURRENT_TIMESTAMP
            WHERE partid = $2 AND warehouseid = $3
            RETURNING quantityonhand;
        `;
        const updateResult = await client.query(updateQuery, [executionValue, partId, warehouseId]);

        if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Inventory record location target not found" });
        }

        const logQuery = `
            INSERT INTO public.stocktransactions (partid, warehouseid, quantitychanged, transactiontype)
            VALUES ($1, $2, $3, $4);
        `;
        await client.query(logQuery, [partId, warehouseId, absoluteQuantity, transactiontype]);

        await client.query('COMMIT'); 
        res.json({ success: true, currentStock: updateResult.rows[0].quantityonhand });
        
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ 
            error: "Internal engine error processing transaction modification.",
            databaseDetails: err.message 
        });
    } finally {
        client.release();
    }
});

// 4. PUT: Structural Relational Location Modal Transfer
app.put('/api/inventory/update-keys', async (req, res) => {
    const { oldPartId, oldWarehouseId, newPartId, newWarehouseId } = req.body;
    
    const parsedNewPartId = parseInt(newPartId);
    const parsedNewWarehouseId = parseInt(newWarehouseId);

    if (isNaN(parsedNewPartId) || isNaN(parsedNewWarehouseId)) {
        return res.status(400).json({ 
            success: false, 
            error: "Please select a valid destination facility and provide a structural part ID configuration code." 
        });
    }

    const client = await db.connect();
    
    try {
        await client.query('BEGIN');

        const balanceCheck = await client.query(`
            SELECT quantityonhand FROM public.inventorybalancestable 
            WHERE partid = $1 AND warehouseid = $2;
        `, [parseInt(oldPartId), parseInt(oldWarehouseId)]);

        if (balanceCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: "Source asset baseline tracking entry missing." });
        }

        const currentStockVolume = balanceCheck.rows[0].quantityonhand;

        await client.query(`
            DELETE FROM public.inventorybalancestable 
            WHERE partid = $1 AND warehouseid = $2;
        `, [parseInt(oldPartId), parseInt(oldWarehouseId)]);

        const upsertInventoryQuery = `
            INSERT INTO public.inventorybalancestable (partid, warehouseid, binlocation, quantityonhand, datecheckedout)
            VALUES ($1, $2, 'RELOCATED-BAY', $3, CURRENT_TIMESTAMP)
            ON CONFLICT (partid, warehouseid) 
            DO UPDATE SET 
                quantityonhand = public.inventorybalancestable.quantityonhand + EXCLUDED.quantityonhand,
                binlocation = 'CONSOLIDATED-BAY',
                datecheckedout = CURRENT_TIMESTAMP;
        `;
        
        await client.query(upsertInventoryQuery, [parsedNewPartId, parsedNewWarehouseId, currentStockVolume]);

        await client.query('COMMIT');
        res.status(200).json({ success: true });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Logistics Relocation Operation Aborted:", err);

        let customError = "System constraint check rejected this transaction.";
        if (err.message.includes("violates foreign key constraint")) {
            if (err.message.includes("warehouseid")) {
                customError = "The Target Facility ID you typed is unregistered. Please check corporate codes (like 101 or 202).";
            } else if (err.message.includes("partid")) {
                customError = "The designated structural unique core identity part code maps nowhere.";
            }
        } else if (err.message.includes("violates unique constraint")) {
            customError = "A key indexing collision occurred. Target parameters cannot accept identity modification patterns.";
        } else {
            customError = err.message;
        }
        
        res.status(500).json({ success: false, error: customError });
    } finally {
        client.release();
    }
});

// 5. GET: Extract Distinct Options Dynamic Mapper
app.get('/api/inventory/filters', async (req, res) => {
    try {
        const { sku, name, material } = req.query;

        const clauses = [];
        const params = [];

        if (sku) {
            params.push(sku);
            clauses.push(`sku = $${params.length}`);
        }
        if (name) {
            params.push(name);
            clauses.push(`name = $${params.length}`);
        }
        if (material) {
            params.push(material);
            clauses.push(`material_name = $${params.length}`);
        }

        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

        const skusQuery = `SELECT DISTINCT sku FROM public.partstable ${whereClause ? whereClause + ' AND' : 'WHERE'} sku IS NOT NULL AND sku != '' ORDER BY sku ASC;`;
        const namesQuery = `SELECT DISTINCT name FROM public.partstable ${whereClause ? whereClause + ' AND' : 'WHERE'} name IS NOT NULL AND name != '' ORDER BY name ASC;`;
        const materialsQuery = `SELECT DISTINCT material_name FROM public.partstable ${whereClause ? whereClause + ' AND' : 'WHERE'} material_name IS NOT NULL AND material_name != '' ORDER BY material_name ASC;`;
        const warehousesQuery = `SELECT warehouseid, facility_name FROM public.warehousestable ORDER BY warehouseid ASC;`;

        const [skusRes, namesRes, materialsRes, warehousesRes] = await Promise.all([
            db.query(skusQuery, params),
            db.query(namesQuery, params),
            db.query(materialsQuery, params),
            db.query(warehousesQuery)
        ]);

        res.json({
            skus: skusRes.rows.map(row => row.sku),
            names: namesRes.rows.map(row => row.name),
            materials: materialsRes.rows.map(row => row.material_name),
            warehouses: warehousesRes.rows
        });
    } catch (err) {
        console.error("Failed to build dynamic database filter sets:", err);
        res.status(500).json({ error: "Metadata extraction failure." });
    }
});

// 6. POST: Register a New Storage or Production Facility
app.post('/api/inventory/facilities', async (req, res) => {
    const { facilityName, warehouseId } = req.body;

    if (!facilityName || facilityName.trim() === '') {
        return res.status(400).json({ success: false, error: "Facility name cannot be empty." });
    }

    try {
        let insertQuery;
        let queryParams;

        if (warehouseId) {
            insertQuery = `
                INSERT INTO public.warehousestable (warehouseid, facility_name)
                VALUES ($1, $2)
                RETURNING warehouseid, facility_name;
            `;
            queryParams = [parseInt(warehouseId), facilityName.trim()];
        } else {
            insertQuery = `
                INSERT INTO public.warehousestable (facility_name)
                VALUES ($1)
                RETURNING warehouseid, facility_name;
            `;
            queryParams = [facilityName.trim()];
        }

        const result = await db.query(insertQuery, queryParams);
        
        res.status(201).json({ 
            success: true, 
            message: "New facility registered successfully.",
            facility: result.rows[0] 
        });
    } catch (err) {
        console.error("Failed to insert new facility structural node:", err);
        
        let customError = "Failed to register facility due to an internal engine error.";
        if (err.message.includes("unique constraint")) {
            customError = "A facility with this ID or Name already exists in the corporate registry.";
        }
        
        res.status(500).json({ success: false, error: customError });
    }
});

// 7. POST: Move stock items between warehouses
app.post('/api/inventory/transfer', async (req, res) => {
    const { partId, sourceWarehouseId, targetWarehouseId, quantity } = req.body;
    
    const transferQty = parseInt(quantity);
    const parsedPartId = parseInt(partId);
    const parsedFromId = parseInt(sourceWarehouseId);
    const parsedToId = parseInt(targetWarehouseId);

    if (isNaN(transferQty) || transferQty <= 0) {
        return res.status(400).json({ success: false, error: "Invalid transfer quantity requested." });
    }
    if (isNaN(parsedPartId) || isNaN(parsedFromId) || isNaN(parsedToId)) {
        return res.status(400).json({ success: false, error: "Missing or malformed node identifier configurations." });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const subtractQuery = `
            UPDATE public.inventorybalancestable
            SET quantityonhand = quantityonhand - $1,
                datecheckedout = CURRENT_TIMESTAMP
            WHERE partid = $2 AND warehouseid = $3
            RETURNING quantityonhand;
        `;
        const originCheck = await client.query(subtractQuery, [transferQty, parsedPartId, parsedFromId]);

        if (originCheck.rows.length === 0) {
            throw new Error("No asset records found at the origin facility.");
        }
        
        if (originCheck.rows[0].quantityonhand < 0) {
            throw new Error(`Insufficient stock available. Attempted to move ${transferQty} items, but origin stock is depleted.`);
        }

        const upsertQuery = `
            INSERT INTO public.inventorybalancestable (partid, warehouseid, binlocation, quantityonhand, datecheckedout)
            VALUES ($1, $2, 'ZONE-X', $3, CURRENT_TIMESTAMP)
            ON CONFLICT (partid, warehouseid) 
            DO UPDATE SET 
                quantityonhand = public.inventorybalancestable.quantityonhand + EXCLUDED.quantityonhand,
                datecheckedout = CURRENT_TIMESTAMP;
        `;
        await client.query(upsertQuery, [parsedPartId, parsedToId, transferQty]);

        await client.query('COMMIT');
        res.json({ success: true, message: `Successfully repositioned logistics node batch.` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transfer execution aborted:", err.message);
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Inventory Engine active on port ${PORT}`);
});
